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
  var onFirstTileRendered: (() -> Void)?

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
    guard let sampledImage = source.image(forScale: lodScale) else { return }

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
  private var imagePath: String?

  private let proxyImageView: UIImageView = {
    let imageView = UIImageView()
    imageView.contentMode = .scaleToFill
    imageView.clipsToBounds = true
    imageView.alpha = 0
    return imageView
  }()

  private let tiledLayerView = TiledLayerView()

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

    tiledLayerView.onFirstTileRendered = { [weak self] in
      guard let self = self else { return }
      UIView.animate(withDuration: 0.15) {
        self.proxyImageView.alpha = 0
      }
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    proxyImageView.frame = bounds
    tiledLayerView.frame = bounds
  }

  func clear() {
    imagePath = nil
    proxyImageView.image = nil
    proxyImageView.alpha = 0
    tiledLayerView.configure(source: nil, viewportSize: .zero)
  }

  func configure(withLocalPath path: String, exactSize: CGSize) {
    imagePath = path
    frame = CGRect(origin: .zero, size: exactSize)
    proxyImageView.frame = CGRect(origin: .zero, size: exactSize)
    tiledLayerView.frame = CGRect(origin: .zero, size: exactSize)
    proxyImageView.alpha = 0
    proxyImageView.image = nil
    tiledLayerView.configure(source: nil, viewportSize: exactSize)

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { return }
      let source = SubsampledImageSource(filePath: path)
      let preview = source?.previewImage(maxPixelSize: 1024)

      DispatchQueue.main.async {
        guard self.imagePath == path else { return }
        self.proxyImageView.image = preview
        self.proxyImageView.alpha = preview == nil ? 0 : 1
        self.tiledLayerView.configure(source: source, viewportSize: exactSize)
      }
    }
  }
}
