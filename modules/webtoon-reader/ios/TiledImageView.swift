import UIKit
import ImageIO

// A custom tiled layer that skips the default 0.25s fade-in animation
class FastTiledLayer: CATiledLayer {
    override class func fadeDuration() -> CFTimeInterval {
        return 0.05 // A very quick fade is smoother than instant popping, but much faster than default
    }
}

// Internal view that actually hosts the CATiledLayer
class TiledLayerView: UIView {
    override class var layerClass: AnyClass {
        return FastTiledLayer.self
    }
    
    var tiledLayer: CATiledLayer {
        return layer as! CATiledLayer
    }
    
    // Shared reference to the image to prevent reading from disk on every tile draw
    var cgImageRef: CGImage? {
        didSet {
            tiledLayer.contents = nil
            tiledLayer.setNeedsDisplay()
        }
    }
    
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
        tiledLayer.tileSize = CGSize(width: 512, height: 512)
        tiledLayer.levelsOfDetail = 1
        tiledLayer.levelsOfDetailBias = 0
    }
    
    override func draw(_ rect: CGRect) {
        guard let cgImage = cgImageRef else { return }
        
        guard let context = UIGraphicsGetCurrentContext() else { return }
        context.saveGState()
        
        // Flip coordinate system for CGImage rendering
        context.translateBy(x: 0, y: bounds.height)
        context.scaleBy(x: 1.0, y: -1.0)
        
        // CATiledLayer context is already clipped to the tile rect (`rect`)
        let drawRect = CGRect(x: 0, y: 0, width: bounds.width, height: bounds.height)
        context.draw(cgImage, in: drawRect)
        
        context.restoreGState()
    }
}

class TiledImageView: UIView {
    private var imageSize: CGSize = .zero
    var imagePath: String?
    
    // Background view to show a low-res proxy while tiles render
    private let proxyImageView: UIImageView = {
        let iv = UIImageView()
        iv.contentMode = .scaleToFill
        iv.clipsToBounds = true
        return iv
    }()
    
    // The actual tiled layer view that sits on top of the proxy
    let tiledLayerView = TiledLayerView()
    
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
    }
    
    override func layoutSubviews() {
        super.layoutSubviews()
        proxyImageView.frame = bounds
        tiledLayerView.frame = bounds
    }
    
    func clear() {
        self.imagePath = nil
        proxyImageView.image = nil
        tiledLayerView.cgImageRef = nil
    }
    
    // Configures the view for a local image file path
    func configure(withLocalPath path: String, exactSize: CGSize) {
        self.imagePath = path
        self.imageSize = exactSize
        self.frame = CGRect(origin: .zero, size: exactSize)
        
        // Clear previous immediately
        proxyImageView.image = nil
        tiledLayerView.cgImageRef = nil
        
        // Re-layout subviews
        proxyImageView.frame = CGRect(origin: .zero, size: exactSize)
        tiledLayerView.frame = CGRect(origin: .zero, size: exactSize)
        
        // 1. Generate a fast low-res proxy in the background to hide tile loading
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let proxy = self.createLowResProxy(from: path)
            
            // 2. Also load the full CGImage here in the background so main thread isn't blocked.
            // Keeping a strong reference to `cgImage` allows concurrent drawing without hitting disk I/O locks per tile.
            let fullImage = UIImage(contentsOfFile: path)?.cgImage
            
            DispatchQueue.main.async {
                // Ensure the path hasn't changed while we were processing
                if self.imagePath == path {
                    self.proxyImageView.image = proxy
                    self.tiledLayerView.cgImageRef = fullImage
                }
            }
        }
    }
    
    private func createLowResProxy(from path: String) -> UIImage? {
        let url = URL(fileURLWithPath: path)
        let options: [CFString: Any] = [kCGImageSourceShouldCache: false]
        guard let source = CGImageSourceCreateWithURL(url as CFURL, options as CFDictionary) else { return nil }
        
        // Target a max dimension of roughly 1024px for the proxy to keep memory low but look okay
        let downsampleOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 1024
        ]
        
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, downsampleOptions as CFDictionary) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
