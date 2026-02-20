import UIKit

class WebtoonTransitionCell: UICollectionViewCell {
  static let identifier = "WebtoonTransitionCell"
  
  private let containerView: UIView = {
    let view = UIView()
    view.backgroundColor = .clear // Transparent background like Mihon (shows parent background)
    view.translatesAutoresizingMaskIntoConstraints = false
    return view
  }()
  
  private let stackView: UIStackView = {
    let sv = UIStackView()
    sv.axis = .vertical
    sv.spacing = 32
    sv.alignment = .center
    sv.translatesAutoresizingMaskIntoConstraints = false
    return sv
  }()
  
  private var prevTitleView: UILabel!
  private var nextTitleView: UILabel!
  private var prevContainer: UIStackView!
  private var nextContainer: UIStackView!
  
  override init(frame: CGRect) {
    super.init(frame: frame)
    setupUI()
  }
  
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
  
  private func setupUI() {
    backgroundColor = UIColor(red: 15/255, green: 15/255, blue: 18/255, alpha: 1.0) // #0F0F12 matching ReaderScreen background
    
    contentView.addSubview(containerView)
    containerView.addSubview(stackView)
    
    // --- Previous Chapter Row ---
    prevContainer = UIStackView()
    prevContainer.axis = .vertical
    prevContainer.spacing = 4
    prevContainer.alignment = .center
    
    let prevLabelView = UILabel()
    prevLabelView.text = "PREVIOUS"
    prevLabelView.textColor = UIColor(white: 0.6, alpha: 1.0) // Grey text
    prevLabelView.font = .systemFont(ofSize: 12, weight: .semibold)
    
    prevTitleView = UILabel()
    prevTitleView.textColor = .white
    prevTitleView.font = .systemFont(ofSize: 18, weight: .semibold)
    prevTitleView.textAlignment = .center
    prevTitleView.numberOfLines = 2
    
    prevContainer.addArrangedSubview(prevLabelView)
    prevContainer.addArrangedSubview(prevTitleView)
    
    // --- Next Chapter Row ---
    nextContainer = UIStackView()
    nextContainer.axis = .vertical
    nextContainer.spacing = 4
    nextContainer.alignment = .center
    
    let nextLabelView = UILabel()
    nextLabelView.text = "NEXT"
    nextLabelView.textColor = UIColor(white: 0.6, alpha: 1.0) // Grey text
    nextLabelView.font = .systemFont(ofSize: 12, weight: .semibold)
    
    nextTitleView = UILabel()
    nextTitleView.textColor = .white
    nextTitleView.font = .systemFont(ofSize: 18, weight: .semibold)
    nextTitleView.textAlignment = .center
    nextTitleView.numberOfLines = 2
    
    nextContainer.addArrangedSubview(nextLabelView)
    nextContainer.addArrangedSubview(nextTitleView)
    
    // Add rows to main stack
    stackView.addArrangedSubview(prevContainer)
    stackView.addArrangedSubview(nextContainer)
    
    NSLayoutConstraint.activate([
      containerView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
      containerView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
      containerView.topAnchor.constraint(equalTo: contentView.topAnchor),
      containerView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
      
      stackView.centerXAnchor.constraint(equalTo: containerView.centerXAnchor),
      stackView.centerYAnchor.constraint(equalTo: containerView.centerYAnchor),
      stackView.leadingAnchor.constraint(greaterThanOrEqualTo: containerView.leadingAnchor, constant: 16),
      stackView.trailingAnchor.constraint(lessThanOrEqualTo: containerView.trailingAnchor, constant: -16)
    ])
  }
  
  func configure(previousTitle: String?, nextTitle: String?) {
    if let prev = previousTitle, !prev.isEmpty {
      prevTitleView.text = prev
      prevContainer.isHidden = false
    } else {
      prevContainer.isHidden = true
    }
    
    if let next = nextTitle, !next.isEmpty {
      nextTitleView.text = next
      nextContainer.isHidden = false
    } else {
      nextContainer.isHidden = true
    }
  }
}
