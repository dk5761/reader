import UIKit
import Kingfisher

class WebtoonPageCell: UICollectionViewCell {
  static let identifier = "WebtoonPageCell"
  
  private let imageView: UIImageView = {
    let iv = UIImageView()
    iv.contentMode = .scaleToFill // Stretch to exactly fill the calculated frame
    iv.clipsToBounds = true
    return iv
  }()
  
  override init(frame: CGRect) {
    super.init(frame: frame)
    contentView.addSubview(imageView)
    backgroundColor = .clear // Important to prevent white flashes
  }
  
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
  
  override func layoutSubviews() {
    super.layoutSubviews()
    imageView.frame = contentView.bounds
  }
  
  override func prepareForReuse() {
    super.prepareForReuse()
    imageView.kf.cancelDownloadTask() // Prevent wrong images loading from fast scrolling
    imageView.image = nil
  }
  
  func configure(with page: WebtoonPage, completion: @escaping (CGFloat) -> Void) {
    guard let url = URL(string: page.url) else { return }
    
    // Calculate a safe bounding box for downsampling based on screen width
    // We use a very large height to allow tall webtoons, but bound it to safe texture limits
    let screenWidth = UIScreen.main.bounds.width
    let maxTextureSize: CGFloat = 8192
    let targetSize = CGSize(width: screenWidth, height: maxTextureSize)
    let processor = DownsamplingImageProcessor(size: targetSize)
    
    imageView.kf.indicatorType = .activity
    imageView.kf.setImage(
      with: url,
      placeholder: nil,
      options: [
        .processor(processor),
        .scaleFactor(UIScreen.main.scale),
        .cacheOriginalImage,
        .backgroundDecode, // Move image decoding sequence to background thread
        .transition(.fade(0.1)) // Tiny fade prevents sudden pop-in
      ],
      completionHandler: { result in
        switch result {
        case .success(let value):
            let size = value.image.size
            if size.height > 0 {
                let ratio = size.width / size.height
                completion(ratio)
            }
        case .failure(_):
            break
        }
      }
    )
  }
}
