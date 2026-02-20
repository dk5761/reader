import UIKit
import Kingfisher

class WebtoonPageCell: UICollectionViewCell {
  static let identifier = "WebtoonPageCell"
  
  private var scrollView: UIScrollView!
  private var tiledImageView: TiledImageView!
  
  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear // Important to prevent white flashes
    
    // Setup ScrollView for Zoom (Phase 4)
    scrollView = UIScrollView(frame: contentView.bounds)
    scrollView.delegate = self
    scrollView.minimumZoomScale = 1.0
    scrollView.maximumZoomScale = 3.0
    scrollView.showsVerticalScrollIndicator = false
    scrollView.showsHorizontalScrollIndicator = false
    scrollView.bouncesZoom = true
    
    // Disable native vertical scrolling for the cell itself so parent CollectionView works
    // Allow zooming/panning only horizontally if zoomed.
    scrollView.isScrollEnabled = false
    
    // Setup Tiled View for Sub-sampling huge textures
    tiledImageView = TiledImageView(frame: .zero)
    scrollView.addSubview(tiledImageView)
    contentView.addSubview(scrollView)
    
    // Add double tap to zoom
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
    // Clear contents to free memory immediately
    tiledImageView.clear()
  }
  
  @objc private func handleDoubleTap(_ gesture: UITapGestureRecognizer) {
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
      zoomRect.size.width  = scrollView.frame.size.width  / scale
      let newCenter = scrollView.convert(center, from: tiledImageView)
      zoomRect.origin.x = newCenter.x - (zoomRect.size.width / 2.0)
      zoomRect.origin.y = newCenter.y - (zoomRect.size.height / 2.0)
      return zoomRect
  }
  
  func configure(with page: WebtoonPage) {
    // Determine screen width and intended image height based on the exact aspectRatio React Native calculated from disk
    let screenWidth = UIScreen.main.bounds.width
    let targetHeight = screenWidth / page.aspectRatio
    let targetSize = CGSize(width: screenWidth, height: targetHeight)
    
    // Adjust ScrollView content wrapper
    scrollView.contentSize = targetSize
    
    guard let url = URL(string: page.url) else { return }
    let rawPath = url.path // Strip file:// scheme for UIImage(contentsOfFile:)
    
    // Feed local disk image to CATiledLayer immediately
    tiledImageView.configure(withLocalPath: rawPath, exactSize: targetSize)
  }
}

// MARK: - UIScrollViewDelegate (Phase 4: Zoom/Pan handling natively)
extension WebtoonPageCell: UIScrollViewDelegate {
    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        return tiledImageView
    }
    
    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        // Only allow scrolling / panning when actually zoomed in
        scrollView.isScrollEnabled = scrollView.zoomScale > 1.0
    }
}
