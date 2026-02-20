import UIKit

class WebtoonPageCell: UICollectionViewCell {
  static let identifier = "WebtoonPageCell"

  private var scrollView: UIScrollView!
  private var tiledImageView: TiledImageView!
  private var lastZoomInteractionAt: CFTimeInterval = 0

  var shouldSuppressReaderTap: Bool {
    if scrollView.isDragging || scrollView.isDecelerating || scrollView.isZooming {
      return true
    }

    if scrollView.zoomScale > 1.01 {
      return true
    }

    return CACurrentMediaTime() - lastZoomInteractionAt < 0.35
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear

    scrollView = UIScrollView(frame: contentView.bounds)
    scrollView.delegate = self
    scrollView.minimumZoomScale = 1.0
    scrollView.maximumZoomScale = 3.0
    scrollView.showsVerticalScrollIndicator = false
    scrollView.showsHorizontalScrollIndicator = false
    scrollView.bouncesZoom = true
    scrollView.isScrollEnabled = false

    tiledImageView = TiledImageView(frame: .zero)
    scrollView.addSubview(tiledImageView)
    contentView.addSubview(scrollView)

    let doubleTap = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap))
    doubleTap.numberOfTapsRequired = 2
    scrollView.addGestureRecognizer(doubleTap)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    scrollView.frame = contentView.bounds
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    scrollView.setZoomScale(1.0, animated: false)
    scrollView.isScrollEnabled = false
    tiledImageView.clear()
  }

  @objc private func handleDoubleTap(_ gesture: UITapGestureRecognizer) {
    lastZoomInteractionAt = CACurrentMediaTime()

    if scrollView.zoomScale > 1.0 {
      scrollView.setZoomScale(1.0, animated: true)
      scrollView.isScrollEnabled = false
    } else {
      let location = gesture.location(in: tiledImageView)
      let zoomRect = self.zoomRectForScale(scale: 2.5, center: location)
      scrollView.isScrollEnabled = true
      scrollView.zoom(to: zoomRect, animated: true)
    }
  }

  private func zoomRectForScale(scale: CGFloat, center: CGPoint) -> CGRect {
    var zoomRect = CGRect.zero
    zoomRect.size.height = scrollView.frame.size.height / scale
    zoomRect.size.width = scrollView.frame.size.width / scale
    let newCenter = scrollView.convert(center, from: tiledImageView)
    zoomRect.origin.x = newCenter.x - (zoomRect.size.width / 2.0)
    zoomRect.origin.y = newCenter.y - (zoomRect.size.height / 2.0)
    return zoomRect
  }

  func configure(with page: WebtoonPage) {
    let safeAspectRatio = page.aspectRatio > 0 ? page.aspectRatio : 1.0
    let screenWidth = UIScreen.main.bounds.width
    let targetHeight = screenWidth / safeAspectRatio
    let targetSize = CGSize(width: screenWidth, height: targetHeight)

    scrollView.contentSize = targetSize

    let rawPath = page.localPath
    guard !rawPath.isEmpty else {
      tiledImageView.clear()
      return
    }

    let resolvedPath: String
    if rawPath.hasPrefix("file://"), let url = URL(string: rawPath) {
      resolvedPath = url.path
    } else {
      resolvedPath = rawPath
    }

    guard resolvedPath.hasPrefix("/") else {
      tiledImageView.clear()
      return
    }

    tiledImageView.configure(withLocalPath: resolvedPath, exactSize: targetSize)
  }
}

extension WebtoonPageCell: UIScrollViewDelegate {
  func viewForZooming(in scrollView: UIScrollView) -> UIView? {
    return tiledImageView
  }

  func scrollViewWillBeginZooming(_ scrollView: UIScrollView, with view: UIView?) {
    lastZoomInteractionAt = CACurrentMediaTime()
  }

  func scrollViewDidZoom(_ scrollView: UIScrollView) {
    scrollView.isScrollEnabled = scrollView.zoomScale > 1.0
  }
}
