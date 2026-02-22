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
  private var renderState: RenderState = .idle

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

  private let activityIndicator: UIActivityIndicatorView = {
    let indicator = UIActivityIndicatorView(style: .medium)
    indicator.color = .white
    indicator.hidesWhenStopped = true
    return indicator
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
    button.setTitle("Retry", for: .normal)
    button.setTitleColor(.white, for: .normal)
    button.backgroundColor = UIColor(white: 1.0, alpha: 0.15)
    button.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
    button.contentEdgeInsets = UIEdgeInsets(top: 8, left: 14, bottom: 8, right: 14)
    button.layer.cornerRadius = 8
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
    addSubview(activityIndicator)
    addSubview(errorOverlayView)

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
      self.onImageError?("Failed to decode image tiles.")
      self.applyRenderState(.error(message: "Tap retry to try again."))
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    proxyImageView.frame = bounds
    tiledLayerView.frame = bounds
    activityIndicator.center = CGPoint(x: bounds.midX, y: bounds.midY)
    errorOverlayView.frame = bounds
  }

  func clear() {
    imagePath = nil
    currentPath = nil
    currentSize = nil
    proxyImageView.image = nil
    proxyImageView.alpha = 0
    tiledLayerView.configure(source: nil, viewportSize: .zero)
    applyRenderState(.idle)
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
    retryCurrentImageLoad()
  }

  private func loadImage(path: String, exactSize: CGSize) {
    imagePath = path
    frame = CGRect(origin: .zero, size: exactSize)
    proxyImageView.frame = CGRect(origin: .zero, size: exactSize)
    tiledLayerView.frame = CGRect(origin: .zero, size: exactSize)
    activityIndicator.frame = CGRect(origin: .zero, size: exactSize)
    activityIndicator.center = CGPoint(x: exactSize.width / 2, y: exactSize.height / 2)
    proxyImageView.alpha = 0
    proxyImageView.image = nil
    tiledLayerView.configure(source: nil, viewportSize: exactSize)

    applyRenderState(.loading)
    shouldReportPreviewFailure = true

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { return }

      guard !path.isEmpty else {
        DispatchQueue.main.async {
          self.activityIndicator.stopAnimating()
          self.applyRenderState(.error(message: "Tap retry to try again."))
          self.onImageError?("Image path is empty.")
        }
        return
      }

      let source = SubsampledImageSource(filePath: path)

      guard source != nil else {
        DispatchQueue.main.async {
          guard self.imagePath == path else { return }
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
      activityIndicator.stopAnimating()
      errorOverlayView.isHidden = true
      errorMessageLabel.text = "Tap retry to try again."
      setLoading(false)
    case .loading:
      errorOverlayView.isHidden = true
      activityIndicator.startAnimating()
      setLoading(true)
    case .ready:
      activityIndicator.stopAnimating()
      errorOverlayView.isHidden = true
      errorMessageLabel.text = "Tap retry to try again."
      setLoading(false)
    case .error(let message):
      activityIndicator.stopAnimating()
      errorMessageLabel.text = message
      errorOverlayView.isHidden = false
      setLoading(false)
    }
  }

  private func setLoading(_ loading: Bool) {
    guard isLoading != loading else { return }
    isLoading = loading
    onLoadingStateChanged?(loading)
  }
}
