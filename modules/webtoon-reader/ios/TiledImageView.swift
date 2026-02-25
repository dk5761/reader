import ImageIO
import UIKit

final class SubsampledImageSource {
  let filePath: String
  let pixelWidth: Int
  let pixelHeight: Int
  let maxPixelDimension: Int

  private let imageSource: CGImageSource
  private let imageCache = NSCache<NSNumber, CGImage>()

  init?(filePath: String) {
    let fileURL = URL(fileURLWithPath: filePath)
    let sourceOptions: [CFString: Any] = [
      kCGImageSourceShouldCache: false,
      kCGImageSourceShouldCacheImmediately: false
    ]
    guard let source = CGImageSourceCreateWithURL(fileURL as CFURL, sourceOptions as CFDictionary) else {
      return nil
    }
    guard let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = props[kCGImagePropertyPixelWidth] as? Int,
          let height = props[kCGImagePropertyPixelHeight] as? Int else {
      return nil
    }

    self.filePath = filePath
    self.pixelWidth = width
    self.pixelHeight = height
    self.maxPixelDimension = max(width, height)
    self.imageSource = source
    imageCache.countLimit = 8
  }

  func image(forScale scale: CGFloat) -> CGImage? {
    let clampedScale = max(0.05, min(abs(scale), 8.0))
    let desiredPixelSize = max(512, Int(CGFloat(maxPixelDimension) * clampedScale))
    return image(forDesiredMaxPixelSize: desiredPixelSize)
  }

  func previewImage(maxPixelSize: Int = 1024) -> UIImage? {
    guard let cgImage = image(forDesiredMaxPixelSize: maxPixelSize) else {
      return nil
    }
    return UIImage(cgImage: cgImage)
  }

  private func image(forDesiredMaxPixelSize desiredPixelSize: Int) -> CGImage? {
    let sampleFactor = downsampleFactor(forDesiredMaxPixelSize: desiredPixelSize)
    let cacheKey = NSNumber(value: sampleFactor)
    if let cached = imageCache.object(forKey: cacheKey) {
      return cached
    }

    let thumbnailMaxSize = max(1, maxPixelDimension / sampleFactor)
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceShouldCache: false,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: thumbnailMaxSize
    ]

    guard let image = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, options as CFDictionary) else {
      return nil
    }

    imageCache.setObject(image, forKey: cacheKey)
    return image
  }

  private func downsampleFactor(forDesiredMaxPixelSize desiredPixelSize: Int) -> Int {
    var factor = 1
    while maxPixelDimension / factor > desiredPixelSize {
      factor *= 2
    }
    return max(1, factor)
  }
}

class FastTiledLayer: CATiledLayer {
  override class func fadeDuration() -> CFTimeInterval {
    return 0.05
  }
}

class TiledLayerView: UIView {
  override class var layerClass: AnyClass {
    return FastTiledLayer.self
  }

  var tiledLayer: CATiledLayer {
    return layer as! CATiledLayer
  }

  private var subsampledSource: SubsampledImageSource?
  private let firstTileLock = NSLock()
  private var didRenderFirstTile = false
  private var didReportTileFailure = false
  var onFirstTileRendered: (() -> Void)?
  var onTileRenderFailed: (() -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setup()
  }

  private func setup() {
    backgroundColor = .clear
    isOpaque = false
    tiledLayer.contentsScale = UIScreen.main.scale
  }

  func configure(source: SubsampledImageSource?, viewportSize: CGSize) {
    subsampledSource = source
    didRenderFirstTile = false
    didReportTileFailure = false

    let screenScale = UIScreen.main.scale
    tiledLayer.tileSize = CGSize(width: 512 * screenScale, height: 512 * screenScale)
    tiledLayer.levelsOfDetail = 1

    if let source = source {
      let viewportPixels = max(viewportSize.width, viewportSize.height) * screenScale
      let ratio = CGFloat(source.maxPixelDimension) / max(viewportPixels, 1)
      let lodBias = max(0, Int(ceil(log2(ratio))))
      tiledLayer.levelsOfDetailBias = lodBias
    } else {
      tiledLayer.levelsOfDetailBias = 0
    }

    tiledLayer.setNeedsDisplay()
  }

  override func draw(_ rect: CGRect) {
    guard let source = subsampledSource,
          let context = UIGraphicsGetCurrentContext(),
          bounds.width > 0,
          bounds.height > 0 else {
      return
    }

    let scaleX = abs(context.ctm.a)
    let scaleY = abs(context.ctm.d)
    let lodScale = max(scaleX, scaleY) / UIScreen.main.scale
    guard let sampledImage = source.image(forScale: lodScale) else {
      firstTileLock.lock()
      let shouldNotifyFailure = !didRenderFirstTile && !didReportTileFailure
      if shouldNotifyFailure {
        didReportTileFailure = true
      }
      firstTileLock.unlock()

      if shouldNotifyFailure {
        DispatchQueue.main.async { [weak self] in
          self?.onTileRenderFailed?()
        }
      }
      return
    }

    let sourceRect = CGRect(x: 0, y: 0, width: sampledImage.width, height: sampledImage.height)
    let normalizedTileRect = CGRect(
      x: rect.origin.x / bounds.width,
      y: rect.origin.y / bounds.height,
      width: rect.width / bounds.width,
      height: rect.height / bounds.height
    )
    var cropRect = CGRect(
      x: normalizedTileRect.origin.x * sourceRect.width,
      y: normalizedTileRect.origin.y * sourceRect.height,
      width: normalizedTileRect.width * sourceRect.width,
      height: normalizedTileRect.height * sourceRect.height
    ).integral

    cropRect = cropRect.intersection(sourceRect)
    guard cropRect.width > 0,
          cropRect.height > 0,
          let tileImage = sampledImage.cropping(to: cropRect) else {
      return
    }

    context.saveGState()
    context.translateBy(x: 0, y: bounds.height)
    context.scaleBy(x: 1.0, y: -1.0)

    let drawRect = CGRect(
      x: rect.origin.x,
      y: bounds.height - rect.maxY,
      width: rect.width,
      height: rect.height
    )
    context.draw(tileImage, in: drawRect)
    context.restoreGState()

    firstTileLock.lock()
    let shouldNotify = !didRenderFirstTile
    if shouldNotify {
      didRenderFirstTile = true
    }
    firstTileLock.unlock()

    if shouldNotify {
      DispatchQueue.main.async { [weak self] in
        self?.onFirstTileRendered?()
      }
    }
  }
}

class TiledImageView: UIView {
  private enum RenderState {
    case idle
    case loading
    case ready
    case error(message: String)
  }

  private var imagePath: String?
  private var currentPath: String?
  private var currentSize: CGSize?
  private var activeImageSource: SubsampledImageSource?
  private var renderState: RenderState = .idle
  private var placeholderRetryHandler: (() -> Void)?

  var onLoadingStateChanged: ((Bool) -> Void)?
  var onImageError: ((String) -> Void)?

  private let proxyImageView: UIImageView = {
    let imageView = UIImageView()
    imageView.contentMode = .scaleToFill
    imageView.clipsToBounds = true
    imageView.alpha = 0
    return imageView
  }()

  private let tiledLayerView = TiledLayerView()
  private var isLoading = false
  private var shouldReportPreviewFailure = false

  private let loadingOverlayView: UIView = {
    let view = UIView()
    view.backgroundColor = UIColor(white: 0, alpha: 0.4)
    view.isHidden = true
    view.isUserInteractionEnabled = false
    return view
  }()

  private let loadingStack: UIStackView = {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 8
    stack.alignment = .center
    stack.distribution = .fill
    return stack
  }()

  private let activityIndicator: UIActivityIndicatorView = {
    let indicator = UIActivityIndicatorView(style: .large)
    indicator.color = .white
    indicator.hidesWhenStopped = true
    return indicator
  }()

  private let loadingLabel: UILabel = {
    let label = UILabel()
    label.text = "Loading page..."
    label.font = .systemFont(ofSize: 13, weight: .medium)
    label.textColor = UIColor(white: 1.0, alpha: 0.95)
    label.textAlignment = .center
    return label
  }()

  private let errorOverlayView: UIView = {
    let view = UIView()
    view.backgroundColor = UIColor(white: 0, alpha: 0.65)
    view.isHidden = true
    view.isUserInteractionEnabled = true
    return view
  }()

  private let errorContentStack: UIStackView = {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 8
    stack.alignment = .center
    stack.distribution = .fill
    return stack
  }()

  private let errorIconView: UIImageView = {
    let imageView = UIImageView(image: UIImage(systemName: "exclamationmark.triangle.fill"))
    imageView.tintColor = UIColor(red: 1.0, green: 0.45, blue: 0.36, alpha: 1.0)
    imageView.contentMode = .scaleAspectFit
    return imageView
  }()

  private let errorTitleLabel: UILabel = {
    let label = UILabel()
    label.text = "Failed to load page"
    label.font = .systemFont(ofSize: 16, weight: .semibold)
    label.textColor = .white
    label.textAlignment = .center
    label.numberOfLines = 1
    return label
  }()

  private let errorMessageLabel: UILabel = {
    let label = UILabel()
    label.font = .systemFont(ofSize: 13, weight: .regular)
    label.textColor = UIColor(white: 1.0, alpha: 0.9)
    label.textAlignment = .center
    label.numberOfLines = 0
    label.text = "Tap retry to try again."
    return label
  }()

  private let retryButton: UIButton = {
    let button = UIButton(type: .system)
    if #available(iOS 15.0, *) {
      var config = UIButton.Configuration.plain()
      var attributedTitle = AttributedString("Retry")
      attributedTitle.font = .systemFont(ofSize: 14, weight: .semibold)
      config.attributedTitle = attributedTitle
      config.baseForegroundColor = .white
      config.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 14, bottom: 8, trailing: 14)
      config.background.backgroundColor = UIColor(white: 1.0, alpha: 0.15)
      config.background.cornerRadius = 8
      button.configuration = config
    } else {
      button.setTitle("Retry", for: .normal)
      button.setTitleColor(.white, for: .normal)
      button.backgroundColor = UIColor(white: 1.0, alpha: 0.15)
      button.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
      button.contentEdgeInsets = UIEdgeInsets(top: 8, left: 14, bottom: 8, right: 14)
      button.layer.cornerRadius = 8
    }
    return button
  }()

  override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setup()
  }

  private func setup() {
    backgroundColor = .clear
    addSubview(proxyImageView)
    addSubview(tiledLayerView)
    addSubview(loadingOverlayView)
    addSubview(errorOverlayView)

    loadingOverlayView.addSubview(loadingStack)
    loadingStack.addArrangedSubview(activityIndicator)
    loadingStack.addArrangedSubview(loadingLabel)
    loadingStack.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      loadingStack.centerXAnchor.constraint(equalTo: loadingOverlayView.centerXAnchor),
      loadingStack.centerYAnchor.constraint(equalTo: loadingOverlayView.centerYAnchor),
      loadingStack.leadingAnchor.constraint(greaterThanOrEqualTo: loadingOverlayView.leadingAnchor, constant: 20),
      loadingStack.trailingAnchor.constraint(lessThanOrEqualTo: loadingOverlayView.trailingAnchor, constant: -20)
    ])

    errorOverlayView.addSubview(errorContentStack)
    errorContentStack.addArrangedSubview(errorIconView)
    errorContentStack.addArrangedSubview(errorTitleLabel)
    errorContentStack.addArrangedSubview(errorMessageLabel)
    errorContentStack.addArrangedSubview(retryButton)
    retryButton.addTarget(self, action: #selector(handleRetryTap), for: .touchUpInside)
    errorIconView.translatesAutoresizingMaskIntoConstraints = false
    errorContentStack.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      errorIconView.widthAnchor.constraint(equalToConstant: 26),
      errorIconView.heightAnchor.constraint(equalToConstant: 26),
      errorContentStack.centerXAnchor.constraint(equalTo: errorOverlayView.centerXAnchor),
      errorContentStack.centerYAnchor.constraint(equalTo: errorOverlayView.centerYAnchor),
      errorContentStack.leadingAnchor.constraint(greaterThanOrEqualTo: errorOverlayView.leadingAnchor, constant: 20),
      errorContentStack.trailingAnchor.constraint(lessThanOrEqualTo: errorOverlayView.trailingAnchor, constant: -20)
    ])

    tiledLayerView.onFirstTileRendered = { [weak self] in
      guard let self = self else { return }
      UIView.animate(withDuration: 0.15) {
        self.proxyImageView.alpha = 0
      }
      self.applyRenderState(.ready)
    }

    tiledLayerView.onTileRenderFailed = { [weak self] in
      guard let self = self else { return }
      self.activeImageSource = nil
      self.onImageError?("Failed to decode image tiles.")
      self.applyRenderState(.error(message: "Tap retry to try again."))
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    proxyImageView.frame = bounds
    tiledLayerView.frame = bounds
    loadingOverlayView.frame = bounds
    errorOverlayView.frame = bounds
  }

  var isReadyForMagnifier: Bool {
    guard case .ready = renderState else {
      return false
    }
    return activeImageSource != nil
  }

  func magnifierSnapshot(at point: CGPoint, diameter: CGFloat, zoomScale: CGFloat) -> UIImage? {
    guard isReadyForMagnifier,
          bounds.width > 0,
          bounds.height > 0,
          diameter > 0,
          zoomScale > 1.0,
          let source = activeImageSource else {
      return nil
    }

    let normalizedX = min(max(point.x / bounds.width, 0), 1)
    let normalizedY = min(max(point.y / bounds.height, 0), 1)
    let sourcePoint = CGPoint(
      x: CGFloat(source.pixelWidth) * normalizedX,
      y: CGFloat(source.pixelHeight) * normalizedY
    )

    let cropDiameterInViewPoints = diameter / zoomScale
    let sourcePixelsPerPointX = CGFloat(source.pixelWidth) / bounds.width
    let sourcePixelsPerPointY = CGFloat(source.pixelHeight) / bounds.height

    let cropWidth = max(1, cropDiameterInViewPoints * sourcePixelsPerPointX)
    let cropHeight = max(1, cropDiameterInViewPoints * sourcePixelsPerPointY)

    var cropRect = CGRect(
      x: sourcePoint.x - cropWidth / 2,
      y: sourcePoint.y - cropHeight / 2,
      width: cropWidth,
      height: cropHeight
    )

    let sourceBounds = CGRect(
      x: 0,
      y: 0,
      width: CGFloat(source.pixelWidth),
      height: CGFloat(source.pixelHeight)
    )

    if cropRect.minX < sourceBounds.minX {
      cropRect.origin.x = sourceBounds.minX
    }
    if cropRect.minY < sourceBounds.minY {
      cropRect.origin.y = sourceBounds.minY
    }
    if cropRect.maxX > sourceBounds.maxX {
      cropRect.origin.x = sourceBounds.maxX - cropRect.width
    }
    if cropRect.maxY > sourceBounds.maxY {
      cropRect.origin.y = sourceBounds.maxY - cropRect.height
    }

    cropRect = cropRect.integral.intersection(sourceBounds)

    guard cropRect.width > 0, cropRect.height > 0 else {
      return nil
    }

    // Request a source image level appropriate for magnifier rendering.
    guard let sampledImage = source.image(forScale: max(zoomScale, 1.0)) else {
      return nil
    }

    let sampledSourceRect = CGRect(
      x: 0,
      y: 0,
      width: CGFloat(sampledImage.width),
      height: CGFloat(sampledImage.height)
    )
    let scaleX = sampledSourceRect.width / sourceBounds.width
    let scaleY = sampledSourceRect.height / sourceBounds.height
    let sampledCropRect = CGRect(
      x: cropRect.origin.x * scaleX,
      y: cropRect.origin.y * scaleY,
      width: cropRect.width * scaleX,
      height: cropRect.height * scaleY
    ).integral.intersection(sampledSourceRect)

    guard sampledCropRect.width > 0,
          sampledCropRect.height > 0,
          let cropped = sampledImage.cropping(to: sampledCropRect) else {
      return nil
    }

    let outputSize = CGSize(width: diameter, height: diameter)
    let renderer = UIGraphicsImageRenderer(size: outputSize)
    return renderer.image { _ in
      UIImage(cgImage: cropped).draw(in: CGRect(origin: .zero, size: outputSize))
    }
  }

  func clear() {
    imagePath = nil
    currentPath = nil
    currentSize = nil
    activeImageSource = nil
    placeholderRetryHandler = nil
    proxyImageView.image = nil
    proxyImageView.alpha = 0
    tiledLayerView.configure(source: nil, viewportSize: .zero)
    applyRenderState(.idle)
  }

  func showLoadingPlaceholder(size: CGSize) {
    imagePath = nil
    currentPath = nil
    currentSize = size
    activeImageSource = nil
    placeholderRetryHandler = nil
    frame = CGRect(origin: .zero, size: size)
    proxyImageView.frame = CGRect(origin: .zero, size: size)
    tiledLayerView.frame = CGRect(origin: .zero, size: size)
    loadingOverlayView.frame = CGRect(origin: .zero, size: size)
    proxyImageView.image = nil
    proxyImageView.alpha = 0
    tiledLayerView.configure(source: nil, viewportSize: size)
    applyRenderState(.loading)
  }

  func showErrorPlaceholder(
    size: CGSize,
    message: String,
    allowRetry: Bool = false,
    onRetry: (() -> Void)? = nil
  ) {
    imagePath = nil
    currentPath = nil
    currentSize = size
    activeImageSource = nil
    placeholderRetryHandler = allowRetry ? onRetry : nil
    frame = CGRect(origin: .zero, size: size)
    proxyImageView.frame = CGRect(origin: .zero, size: size)
    tiledLayerView.frame = CGRect(origin: .zero, size: size)
    loadingOverlayView.frame = CGRect(origin: .zero, size: size)
    errorOverlayView.frame = CGRect(origin: .zero, size: size)
    proxyImageView.image = nil
    proxyImageView.alpha = 0
    tiledLayerView.configure(source: nil, viewportSize: size)
    retryButton.isHidden = !allowRetry
    applyRenderState(.error(message: message))
  }

  func configure(withLocalPath path: String, exactSize: CGSize) {
    currentPath = path
    currentSize = exactSize
    loadImage(path: path, exactSize: exactSize)
  }

  func retryCurrentImageLoad() {
    guard let path = currentPath,
          let size = currentSize else {
      return
    }

    loadImage(path: path, exactSize: size)
  }

  @objc private func handleRetryTap() {
    if currentPath == nil {
      placeholderRetryHandler?()
      return
    }
    retryCurrentImageLoad()
  }

  private func loadImage(path: String, exactSize: CGSize) {
    imagePath = path
    activeImageSource = nil
    placeholderRetryHandler = nil
    frame = CGRect(origin: .zero, size: exactSize)
    proxyImageView.frame = CGRect(origin: .zero, size: exactSize)
    tiledLayerView.frame = CGRect(origin: .zero, size: exactSize)
    loadingOverlayView.frame = CGRect(origin: .zero, size: exactSize)
    proxyImageView.alpha = 0
    proxyImageView.image = nil
    tiledLayerView.configure(source: nil, viewportSize: exactSize)

    applyRenderState(.loading)
    shouldReportPreviewFailure = true

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { return }

      guard !path.isEmpty else {
        DispatchQueue.main.async {
          self.activeImageSource = nil
          self.applyRenderState(.error(message: "Tap retry to try again."))
          self.onImageError?("Image path is empty.")
        }
        return
      }

      let source = SubsampledImageSource(filePath: path)

      guard source != nil else {
        DispatchQueue.main.async {
          guard self.imagePath == path else { return }
          self.activeImageSource = nil
          self.proxyImageView.image = nil
          self.proxyImageView.alpha = 0
          self.onImageError?("Failed to load image: \(path)")
          self.applyRenderState(.error(message: "Tap retry to try again."))
        }
        return
      }

      let preview = source?.previewImage(maxPixelSize: 1024)

      DispatchQueue.main.async {
        guard self.imagePath == path else { return }
        self.activeImageSource = source
        if let preview {
          self.proxyImageView.image = preview
          self.proxyImageView.alpha = 1
        } else {
          self.proxyImageView.image = nil
          self.proxyImageView.alpha = 0
          if self.shouldReportPreviewFailure {
            self.onImageError?("Failed to generate preview for: \(path)")
            self.shouldReportPreviewFailure = false
          }
        }
        self.tiledLayerView.configure(source: source, viewportSize: exactSize)
      }
    }
  }

  private func applyRenderState(_ state: RenderState) {
    renderState = state

    switch state {
    case .idle:
      retryButton.isHidden = false
      activityIndicator.stopAnimating()
      loadingOverlayView.isHidden = true
      errorOverlayView.isHidden = true
      errorMessageLabel.text = "Tap retry to try again."
      setLoading(false)
    case .loading:
      retryButton.isHidden = false
      loadingOverlayView.isHidden = false
      bringSubviewToFront(loadingOverlayView)
      errorOverlayView.isHidden = true
      activityIndicator.startAnimating()
      setLoading(true)
    case .ready:
      retryButton.isHidden = false
      activityIndicator.stopAnimating()
      loadingOverlayView.isHidden = true
      errorOverlayView.isHidden = true
      errorMessageLabel.text = "Tap retry to try again."
      setLoading(false)
    case .error(let message):
      activityIndicator.stopAnimating()
      loadingOverlayView.isHidden = true
      errorMessageLabel.text = message
      errorOverlayView.isHidden = false
      bringSubviewToFront(errorOverlayView)
      setLoading(false)
    }
  }

  private func setLoading(_ loading: Bool) {
    guard isLoading != loading else { return }
    isLoading = loading
    onLoadingStateChanged?(loading)
  }
}
