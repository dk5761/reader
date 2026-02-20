import UIKit

class TiledImageView: UIView {
    private var imageSize: CGSize = .zero
    private var imagePath: String?
    
    // Tiled layers render asynchronously by chunks (tiles)
    override class var layerClass: AnyClass {
        return CATiledLayer.self
    }
    
    var tiledLayer: CATiledLayer {
        return layer as! CATiledLayer
    }
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        setupTiledLayer()
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupTiledLayer()
    }
    
    private func setupTiledLayer() {
        // Tile size is standard 512x512 for optimal texture loading
        tiledLayer.tileSize = CGSize(width: 512, height: 512)
        tiledLayer.levelsOfDetail = 1
        tiledLayer.levelsOfDetailBias = 0
    }
    
    // Configures the view for a local image file path
    func configure(withLocalPath path: String, exactSize: CGSize) {
        self.imagePath = path
        self.imageSize = exactSize
        self.frame = CGRect(origin: .zero, size: exactSize)
        tiledLayer.setNeedsDisplay()
    }
    
    override func draw(_ rect: CGRect) {
        guard let path = imagePath,
              let image = UIImage(contentsOfFile: path),
              let cgImage = image.cgImage else { return }
        
        let context = UIGraphicsGetCurrentContext()
        context?.saveGState()
        
        // Flip coordinate system for CGImage rendering
        context?.translateBy(x: 0, y: bounds.height)
        context?.scaleBy(x: 1.0, y: -1.0)
        
        // CATiledLayer will only ask to draw `rect` representing the visible tile
        let drawRect = CGRect(x: 0, y: 0, width: bounds.width, height: bounds.height)
        context?.draw(cgImage, in: drawRect)
        
        context?.restoreGState()
    }
}
