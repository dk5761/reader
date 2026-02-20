import ExpoModulesCore
import UIKit

// Define the data model for our Diffable Data Source.
// It must be Hashable to uniquely identify each page in the collection view.
struct WebtoonPage: Hashable {
  let id: String
  let url: String
  let chapterId: String
  let aspectRatio: CGFloat
  let isTransition: Bool
  let previousChapterTitle: String?
  let nextChapterTitle: String?
}

class WebtoonReaderView: ExpoView, UICollectionViewDelegate, UICollectionViewDataSourcePrefetching {
  let onEndReached = EventDispatcher()
  let onChapterChanged = EventDispatcher()
  let onSingleTap = EventDispatcher()
  let onPageChanged = EventDispatcher()
  
  private var collectionView: UICollectionView!
  private var dataSource: UICollectionViewDiffableDataSource<Int, WebtoonPage>!
  
  // Track dynamically loaded aspect ratios for images where RN didn't explicitly know it
  private var dynamicAspectRatios: [String: CGFloat] = [:]
  
  // Track the previously emitted chapter to avoid duplicate events
  private var lastEmittedChapterId: String? = nil
  private var lastEmittedPageId: String? = nil
  
  // Track end indices of each chapter for precise preloading
  private var chapterEndIndices: [String: Int] = [:]
  private var preloadedChapters: Set<String> = []
  
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    setupCollectionView()
    setupDataSource()
  }
  
  private func setupCollectionView() {
    let layout = UICollectionViewFlowLayout()
    layout.minimumLineSpacing = 0
    layout.minimumInteritemSpacing = 0
    layout.scrollDirection = .vertical
    
    collectionView = UICollectionView(frame: bounds, collectionViewLayout: layout)
    collectionView.backgroundColor = .clear
    collectionView.delegate = self
    collectionView.prefetchDataSource = self
    collectionView.showsVerticalScrollIndicator = false
    collectionView.showsHorizontalScrollIndicator = false
    
    collectionView.register(WebtoonPageCell.self, forCellWithReuseIdentifier: WebtoonPageCell.identifier)
    collectionView.register(WebtoonTransitionCell.self, forCellWithReuseIdentifier: WebtoonTransitionCell.identifier)
    
    // Attach single tap recognizer for overlay toggle
    let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleSingleTap(_:)))
    tapGesture.cancelsTouchesInView = false // Allow scroll interactions to pass through
    collectionView.addGestureRecognizer(tapGesture)
    
    addSubview(collectionView)
  }
  
  @objc private func handleSingleTap(_ gesture: UITapGestureRecognizer) {
    // Only emit tap if we are truly resting, avoiding firing mid-scroll
    if gesture.state == .ended {
        onSingleTap([:])
    }
  }
  
  private func setupDataSource() {
    dataSource = UICollectionViewDiffableDataSource<Int, WebtoonPage>(collectionView: collectionView) { [weak self]
      (collectionView, indexPath, page) -> UICollectionViewCell? in
      
      if page.isTransition {
        guard let cell = collectionView.dequeueReusableCell(withReuseIdentifier: WebtoonTransitionCell.identifier, for: indexPath) as? WebtoonTransitionCell else {
          fatalError("Could not create transition cell")
        }
        cell.configure(previousTitle: page.previousChapterTitle, nextTitle: page.nextChapterTitle)
        return cell
      }
      
      guard let cell = collectionView.dequeueReusableCell(withReuseIdentifier: WebtoonPageCell.identifier, for: indexPath) as? WebtoonPageCell else {
        fatalError("Could not create image cell")
      }
      
      cell.configure(with: page) { [weak self] actualRatio in
        guard let self = self else { return }
        // ... (keep rest of image configure block)
        let currentRatio = self.dynamicAspectRatios[page.id] ?? page.aspectRatio
        
        if abs(currentRatio - actualRatio) > 0.01 {
          self.dynamicAspectRatios[page.id] = actualRatio
          
          DispatchQueue.main.async {
            if let currentIndexPath = self.dataSource.indexPath(for: page) {
              let context = UICollectionViewFlowLayoutInvalidationContext()
              context.invalidateItems(at: [currentIndexPath])
              self.collectionView.collectionViewLayout.invalidateLayout(with: context)
            }
          }
        }
      }
      return cell
    }
  }
  
  override func layoutSubviews() {
    super.layoutSubviews()
    if collectionView.frame != bounds {
      collectionView.frame = bounds
      if let layout = collectionView.collectionViewLayout as? UICollectionViewFlowLayout {
        // Invalidate layout to trigger size re-calculation if device rotates
        layout.invalidateLayout()
      }
    }
  }
  
  public func updateData(data: [[String: Any]]) {
    var snapshot = NSDiffableDataSourceSnapshot<Int, WebtoonPage>()
    snapshot.appendSections([0])
    
    // Default to aspect ratio of 1.0 (square) if not provided or invalid
    let pages = data.compactMap { dict -> WebtoonPage? in
      guard let id = dict["id"] as? String,
            let url = dict["url"] as? String,
            let chapterId = dict["chapterId"] as? String else { return nil }
      
      let aspectRatio = dict["aspectRatio"] as? CGFloat ?? 1.0
      let isTransition = dict["isTransition"] as? Bool ?? false
      let prevTitle = dict["previousChapterTitle"] as? String
      let nextTitle = dict["nextChapterTitle"] as? String
            
      return WebtoonPage(id: id, url: url, chapterId: chapterId, aspectRatio: aspectRatio, isTransition: isTransition, previousChapterTitle: prevTitle, nextChapterTitle: nextTitle)
    }
    
    // Map the highest index for each chapter to know where its "end" is.
    var currentChapterEndIndices: [String: Int] = [:]
    for (index, page) in pages.enumerated() {
      currentChapterEndIndices[page.chapterId] = index
    }
    self.chapterEndIndices = currentChapterEndIndices
    
    snapshot.appendItems(pages)
    
    // Apply changes WITHOUT animating differences to prevent UI flickering
    // as per explicitly requested in the prompt.
    dataSource.apply(snapshot, animatingDifferences: false)
  }
  
  public func scrollToIndex(chapterId: String, index: Int) {
    // Find the exact page matching the provided chapter and relative index
    // Assuming ID is format: "chapterId-index"
    let targetId = "\(chapterId)-\(index)"
    
    // Fallback: If transitioning, find the transition cell or nearest
    let identifier = dataSource.snapshot().itemIdentifiers.first {
        $0.id == targetId
    }
    
    guard let targetPage = identifier,
          let targetIndexPath = dataSource.indexPath(for: targetPage) else {
        return
    }
    
    DispatchQueue.main.async {
        // If we jump to an item far away, the UICollectionView will use the fallback viewport heights
        // we added in `sizeForItemAt` for unloaded intermediate items. We use `.top` so we land
        // exactly at the boundary of the placeholder block.
        self.collectionView.scrollToItem(at: targetIndexPath, at: .top, animated: false)
        self.emitPageVisible(page: targetPage)
    }
  }
  
  // MARK: - UICollectionViewDelegateFlowLayout
  
  // Need to implement layout delegate behavior separately from diffable data source.
  public func collectionView(_ collectionView: UICollectionView, layout collectionViewLayout: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
    // Get item from snapshot directly
    guard let page = dataSource.itemIdentifier(for: indexPath) else {
      return .zero
    }
    
    let width = collectionView.bounds.width
    let viewportHeight = collectionView.bounds.height
    
    if page.isTransition {
       return CGSize(width: width, height: 200) // Fixed height for Transition cell
    }
    
    // 1. If we have dynamically downloaded the image and tracked its true ratio, use it (highest priority)
    if let dynamicRatio = dynamicAspectRatios[page.id], dynamicRatio > 0 {
      return CGSize(width: width, height: width / dynamicRatio)
    }
    
    // 2. If React Native explicitly provided a non-default ratio (> 0 and != 1.0), use it
    if page.aspectRatio > 0 && page.aspectRatio != 1.0 {
      return CGSize(width: width, height: width / page.aspectRatio)
    }
    
    // 3. FALLBACK: The image is unloaded or has a default (1.0) ratio.
    // Like Mihon, we allocate exactly one viewport height for the placeholder.
    // This allows the layout to estimate the total scroll height without jumping 
    // when skipping over 10 unloaded gaps to reach page 15.
    let fallbackHeight = viewportHeight > 0 ? viewportHeight : width
    return CGSize(width: width, height: fallbackHeight)
  }
  
  // MARK: - Event Emission Helper
  
  private func emitPageVisible(page: WebtoonPage) {
    // Deduplicate identical events to prevent bridging spam during layout phases / resting state
    if page.id == lastEmittedPageId {
        return
    }
    lastEmittedPageId = page.id
    
    // Check if the current visible chapter has changed
    if page.chapterId != lastEmittedChapterId {
      lastEmittedChapterId = page.chapterId
      onChapterChanged([
        "chapterId": page.chapterId
      ])
    }
    
    // Extract relative page index within the chapter
    // (Assuming the ID follows "chapterId-index" format from React Native)
    let parts = page.id.components(separatedBy: "-")
    if let lastItem = parts.last, let pageIndex = Int(lastItem) {
        onPageChanged([
            "chapterId": page.chapterId,
            "pageIndex": pageIndex
        ])
    }
  }

  // MARK: - UIScrollViewDelegate (Scroll Tracking)
  
  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    let indexPaths = collectionView.indexPathsForVisibleItems.sorted()
    
    guard let firstIndexPath = indexPaths.first,
          let page = dataSource.itemIdentifier(for: firstIndexPath) else {
      return
    }
    
    emitPageVisible(page: page)
    
    // Fallback: Also check if the visible items trigger the preload threshold
    // just in case prefetching skipped a fast jump.
    if let lastIndexPath = indexPaths.last,
       let lastPage = dataSource.itemIdentifier(for: lastIndexPath),
       let endIndex = chapterEndIndices[lastPage.chapterId] {
      
      if lastIndexPath.item >= endIndex - 5 {
        if !preloadedChapters.contains(lastPage.chapterId) {
          preloadedChapters.insert(lastPage.chapterId)
          onEndReached(["chapterId": lastPage.chapterId])
        }
      }
    }
  }
  
  // MARK: - UICollectionViewDataSourcePrefetching (End Reached)
  
  func collectionView(_ collectionView: UICollectionView, prefetchItemsAt indexPaths: [IndexPath]) {
    for indexPath in indexPaths {
      guard let page = dataSource.itemIdentifier(for: indexPath),
            let endIndex = chapterEndIndices[page.chapterId] else {
        continue
      }
      
      // If we prefetch an item within 5 spots of this chapter's end, trigger preload.
      if indexPath.item >= endIndex - 5 {
        if !preloadedChapters.contains(page.chapterId) {
          preloadedChapters.insert(page.chapterId)
          onEndReached(["chapterId": page.chapterId])
        }
      }
    }
  }
}

// Extend our view to handle Flow Layout sizing protocol manually
extension WebtoonReaderView: UICollectionViewDelegateFlowLayout { }
