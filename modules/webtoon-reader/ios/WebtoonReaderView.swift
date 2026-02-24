import ExpoModulesCore
import UIKit

struct WebtoonPage: Hashable {
  let id: String
  let localPath: String
  let pageIndex: Int
  let chapterId: String
  let aspectRatio: CGFloat
  let loadState: String?
  let errorMessage: String?
  let isTransition: Bool
  let previousChapterTitle: String?
  let nextChapterTitle: String?
  let headers: [String: String]?

  static func == (lhs: WebtoonPage, rhs: WebtoonPage) -> Bool {
    lhs.id == rhs.id
  }

  func hash(into hasher: inout Hasher) {
    hasher.combine(id)
  }

  func hasRenderableChanges(comparedTo other: WebtoonPage) -> Bool {
    localPath != other.localPath ||
      pageIndex != other.pageIndex ||
      chapterId != other.chapterId ||
      aspectRatio != other.aspectRatio ||
      loadState != other.loadState ||
      errorMessage != other.errorMessage ||
      isTransition != other.isTransition ||
      previousChapterTitle != other.previousChapterTitle ||
      nextChapterTitle != other.nextChapterTitle ||
      headers != other.headers
  }
}

class WebtoonReaderView: ExpoView, UICollectionViewDelegate, UICollectionViewDataSourcePrefetching {
  private let preloadLeadPages = 4

  private struct ScrollAnchor {
    let pageId: String
    let intraItemOffset: CGFloat
  }

  let onEndReached = EventDispatcher()
  let onChapterChanged = EventDispatcher()
  let onSingleTap = EventDispatcher()
  let onPageChanged = EventDispatcher()
  let onScrollBegin = EventDispatcher()
  let onLoadingStateChanged = EventDispatcher()
  let onImageError = EventDispatcher()
  let onRetryRequested = EventDispatcher()

  private var collectionView: UICollectionView!
  private var dataSource: UICollectionViewDiffableDataSource<Int, WebtoonPage>!

  private var lastEmittedChapterId: String? = nil
  private var lastEmittedPageId: String? = nil

  private var chapterMaxPageIndices: [String: Int] = [:]
  private var preloadedChapters: Set<String> = []
  private var pendingScrollAnchorRestore: ScrollAnchor? = nil

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

    let singleTapGesture = UITapGestureRecognizer(target: self, action: #selector(handleSingleTap(_:)))
    singleTapGesture.numberOfTapsRequired = 1
    singleTapGesture.cancelsTouchesInView = false

    let doubleTapBlocker = UITapGestureRecognizer(target: nil, action: nil)
    doubleTapBlocker.numberOfTapsRequired = 2
    doubleTapBlocker.cancelsTouchesInView = false

    singleTapGesture.require(toFail: doubleTapBlocker)

    collectionView.addGestureRecognizer(singleTapGesture)
    collectionView.addGestureRecognizer(doubleTapBlocker)

    addSubview(collectionView)
  }

  @objc private func handleSingleTap(_ gesture: UITapGestureRecognizer) {
    guard gesture.state == .ended else { return }
    guard !collectionView.isDragging, !collectionView.isDecelerating else { return }

    let location = gesture.location(in: collectionView)
    if let indexPath = collectionView.indexPathForItem(at: location),
       let page = dataSource.itemIdentifier(for: indexPath),
       !page.isTransition,
       let cell = collectionView.cellForItem(at: indexPath) as? WebtoonPageCell,
       cell.shouldSuppressReaderTap {
      return
    }

    onSingleTap([:])
  }

  private func setupDataSource() {
    dataSource = UICollectionViewDiffableDataSource<Int, WebtoonPage>(collectionView: collectionView) {
      (collectionView, indexPath, page) -> UICollectionViewCell? in

      if page.isTransition {
        guard let cell = collectionView.dequeueReusableCell(
          withReuseIdentifier: WebtoonTransitionCell.identifier,
          for: indexPath
        ) as? WebtoonTransitionCell else {
          fatalError("Could not create transition cell")
        }
        cell.configure(previousTitle: page.previousChapterTitle, nextTitle: page.nextChapterTitle)
        return cell
      }

      guard let cell = collectionView.dequeueReusableCell(
        withReuseIdentifier: WebtoonPageCell.identifier,
        for: indexPath
      ) as? WebtoonPageCell else {
        fatalError("Could not create image cell")
      }

      cell.configure(with: page)
      cell.onLoadingStateChanged = { [weak self] pageId, isLoading in
        self?.onLoadingStateChanged(["pageId": pageId, "isLoading": isLoading])
      }
      cell.onImageError = { [weak self] pageId, error in
        self?.onImageError(["pageId": pageId, "error": error])
      }
      cell.onRetryRequested = { [weak self] pageId in
        self?.onRetryRequested(["pageId": pageId])
      }
      return cell
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    if collectionView.frame != bounds {
      collectionView.frame = bounds
      if let layout = collectionView.collectionViewLayout as? UICollectionViewFlowLayout {
        layout.invalidateLayout()
      }
    }
  }

  public func updateData(data: [[String: Any]]) {
    let previousSnapshotItems = dataSource.snapshot().itemIdentifiers
    let previousItemsById = Dictionary(
      uniqueKeysWithValues: previousSnapshotItems.map { ($0.id, $0) }
    )
    let previousItemIds = previousSnapshotItems.map(\.id)
    let scrollAnchor = captureScrollAnchor()

    var snapshot = NSDiffableDataSourceSnapshot<Int, WebtoonPage>()
    snapshot.appendSections([0])

    let pages = data.compactMap { dict -> WebtoonPage? in
      guard let id = dict["id"] as? String,
            let chapterId = dict["chapterId"] as? String else { return nil }

      let localPath = (dict["localPath"] as? String) ?? (dict["localUri"] as? String) ?? ""
      let pageIndex = dict["pageIndex"] as? Int ?? -1
      let aspectRatio = dict["aspectRatio"] as? CGFloat ?? 1.0
      let loadState = dict["loadState"] as? String
      let errorMessage = dict["errorMessage"] as? String
      let isTransition = dict["isTransition"] as? Bool ?? false
      let prevTitle = dict["previousChapterTitle"] as? String
      let nextTitle = dict["nextChapterTitle"] as? String
      let headers = dict["headers"] as? [String: String]

      return WebtoonPage(
        id: id,
        localPath: localPath,
        pageIndex: pageIndex,
        chapterId: chapterId,
        aspectRatio: aspectRatio,
        loadState: loadState,
        errorMessage: errorMessage,
        isTransition: isTransition,
        previousChapterTitle: prevTitle,
        nextChapterTitle: nextTitle,
        headers: headers
      )
    }

    var currentChapterMaxPageIndices: [String: Int] = [:]
    for page in pages where !page.isTransition && page.pageIndex >= 0 {
      let existingMax = currentChapterMaxPageIndices[page.chapterId] ?? -1
      currentChapterMaxPageIndices[page.chapterId] = max(existingMax, page.pageIndex)
    }

    let previousChapterSet = Set(chapterMaxPageIndices.keys)
    let currentChapterSet = Set(currentChapterMaxPageIndices.keys)
    if previousChapterSet != currentChapterSet {
      preloadedChapters = preloadedChapters.intersection(currentChapterSet)
    }
    chapterMaxPageIndices = currentChapterMaxPageIndices

    let currentPageIds = Set(pages.map(\.id))
    if let lastPage = lastEmittedPageId, !currentPageIds.contains(lastPage) {
      lastEmittedPageId = nil
    }
    if let lastChapter = lastEmittedChapterId, !currentChapterSet.contains(lastChapter) {
      lastEmittedChapterId = nil
    }

    snapshot.appendItems(pages)

    let currentItemIds = pages.map(\.id)
    let hasStructuralChanges = hasStructuralChanges(previousIds: previousItemIds, currentIds: currentItemIds)

    let changedItems = pages.filter { page in
      guard let previousPage = previousItemsById[page.id] else {
        return false
      }
      return page.hasRenderableChanges(comparedTo: previousPage)
    }
    if !changedItems.isEmpty {
      snapshot.reloadItems(changedItems)
    }

    dataSource.apply(snapshot, animatingDifferences: false) { [weak self] in
      guard let self = self else { return }
      self.collectionView.layoutIfNeeded()
      guard hasStructuralChanges else { return }
      guard let scrollAnchor else { return }

      if self.collectionView.isDragging || self.collectionView.isDecelerating {
        self.pendingScrollAnchorRestore = scrollAnchor
        return
      }

      self.restoreScrollAnchor(scrollAnchor)
    }
  }

  public func scrollToIndex(chapterId: String, index: Int) {
    let targetPage = dataSource.snapshot().itemIdentifiers.first {
      !$0.isTransition && $0.chapterId == chapterId && $0.pageIndex == index
    }

    guard let page = targetPage,
          let targetIndexPath = dataSource.indexPath(for: page) else {
      return
    }

    DispatchQueue.main.async {
      self.collectionView.scrollToItem(at: targetIndexPath, at: .top, animated: false)
      self.emitPageVisible(page: page)
    }
  }

  public func getCurrentPosition() -> [String: Any] {
    guard let chapterId = lastEmittedChapterId,
          let pageId = lastEmittedPageId else {
      return ["chapterId": "", "pageIndex": -1]
    }

    let snapshot = dataSource.snapshot()
    guard let page = snapshot.itemIdentifiers.first(where: { $0.id == pageId }) else {
      return ["chapterId": chapterId, "pageIndex": -1]
    }

    return [
      "chapterId": chapterId,
      "pageIndex": page.pageIndex
    ]
  }

  public func setZoomScale(scale: CGFloat) {
    let indexPaths = collectionView.indexPathsForVisibleItems
    for indexPath in indexPaths {
      if let cell = collectionView.cellForItem(at: indexPath) as? WebtoonPageCell {
        cell.setZoomScale(scale, animated: true)
      }
    }
  }

  public func resetZoom() {
    let indexPaths = collectionView.indexPathsForVisibleItems
    for indexPath in indexPaths {
      if let cell = collectionView.cellForItem(at: indexPath) as? WebtoonPageCell {
        cell.resetZoom(animated: true)
      }
    }
  }

  public func collectionView(
    _ collectionView: UICollectionView,
    layout collectionViewLayout: UICollectionViewLayout,
    sizeForItemAt indexPath: IndexPath
  ) -> CGSize {
    guard let page = dataSource.itemIdentifier(for: indexPath) else {
      return .zero
    }

    let width = collectionView.bounds.width
    let viewportHeight = collectionView.bounds.height

    if page.isTransition {
      return CGSize(width: width, height: 200)
    }

    if page.aspectRatio > 0 {
      return CGSize(width: width, height: width / page.aspectRatio)
    }

    let fallbackHeight = viewportHeight > 0 ? viewportHeight : width
    return CGSize(width: width, height: fallbackHeight)
  }

  private func emitPageVisible(page: WebtoonPage) {
    // Ignore synthetic transition cells for chapter/page position tracking.
    // They should not become the canonical reading position.
    if page.isTransition || page.pageIndex < 0 {
      return
    }

    if page.id == lastEmittedPageId {
      return
    }
    lastEmittedPageId = page.id

    if page.chapterId != lastEmittedChapterId {
      lastEmittedChapterId = page.chapterId
      onChapterChanged([
        "chapterId": page.chapterId
      ])
    }

    onPageChanged([
      "chapterId": page.chapterId,
      "pageIndex": page.pageIndex
    ])
  }

  private func primaryVisiblePage(from visibleIndexPaths: [IndexPath]) -> WebtoonPage? {
    guard !visibleIndexPaths.isEmpty else { return nil }

    // Use the first real page intersecting the top viewport region as canonical current page.
    // This avoids jumping to a deeper page index when transition/short pages are visible.
    let topBoundaryY = collectionView.contentOffset.y + 8
    for indexPath in visibleIndexPaths.sorted() {
      guard let attributes = collectionView.layoutAttributesForItem(at: indexPath),
            let page = dataSource.itemIdentifier(for: indexPath),
            !page.isTransition,
            page.pageIndex >= 0 else {
        continue
      }

      if attributes.frame.maxY >= topBoundaryY {
        return page
      }
    }

    // Fallback: probe upper viewport region, but only for real pages.
    let probePoint = CGPoint(
      x: collectionView.bounds.midX,
      y: collectionView.contentOffset.y + (collectionView.bounds.height * 0.12)
    )

    if let probeIndexPath = collectionView.indexPathForItem(at: probePoint),
       let probePage = dataSource.itemIdentifier(for: probeIndexPath),
       !probePage.isTransition,
       probePage.pageIndex >= 0 {
      return probePage
    }

    let visibleRect = CGRect(origin: collectionView.contentOffset, size: collectionView.bounds.size)
    var bestPage: WebtoonPage?
    var bestIntersectionArea: CGFloat = 0

    for indexPath in visibleIndexPaths {
      guard let attributes = collectionView.layoutAttributesForItem(at: indexPath),
            let page = dataSource.itemIdentifier(for: indexPath),
            !page.isTransition,
            page.pageIndex >= 0 else {
        continue
      }

      let intersection = visibleRect.intersection(attributes.frame)
      if intersection.isNull || intersection.isEmpty {
        continue
      }

      let area = intersection.width * intersection.height
      if area > bestIntersectionArea {
        bestIntersectionArea = area
        bestPage = page
      }
    }

    if let bestPage = bestPage {
      return bestPage
    }

    for indexPath in visibleIndexPaths.sorted() {
      if let page = dataSource.itemIdentifier(for: indexPath),
         !page.isTransition,
         page.pageIndex >= 0 {
        return page
      }
    }

    return nil
  }

  private func shouldPreload(chapterId: String, pageIndex: Int) -> Bool {
    guard pageIndex >= 0,
          let maxPageIndex = chapterMaxPageIndices[chapterId] else {
      return false
    }

    // Trigger preload when the user is within `preloadLeadPages` of the end.
    // Example: 16 pages (0...15) with lead=4 -> trigger at index 11 (page 12).
    let triggerPageIndex = max(0, maxPageIndex - preloadLeadPages)
    return pageIndex >= triggerPageIndex
  }

  private func emitEndReachedIfNeeded(chapterId: String, pageIndex: Int) {
    guard shouldPreload(chapterId: chapterId, pageIndex: pageIndex) else {
      return
    }

    if !preloadedChapters.contains(chapterId) {
      preloadedChapters.insert(chapterId)
      onEndReached(["chapterId": chapterId])
    }
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    let indexPaths = collectionView.indexPathsForVisibleItems

    guard let page = primaryVisiblePage(from: indexPaths) else {
      return
    }

    emitPageVisible(page: page)
    emitEndReachedIfNeeded(chapterId: page.chapterId, pageIndex: page.pageIndex)
  }

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    onScrollBegin([:])
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    if !decelerate {
      applyPendingScrollAnchorRestoreIfNeeded()
    }
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    applyPendingScrollAnchorRestoreIfNeeded()
  }

  func collectionView(_ collectionView: UICollectionView, prefetchItemsAt indexPaths: [IndexPath]) {
    // Intentionally no-op.
    // Prefetch callbacks are predictive and can include pages the user has not reached yet.
    // Emitting `onEndReached` from here causes chapter preload updates to run early, which can
    // mutate reader state while the user is still mid-chapter.
  }

  private func captureScrollAnchor() -> ScrollAnchor? {
    let viewportTop = collectionView.contentOffset.y + collectionView.adjustedContentInset.top
    let visibleIndexPaths = collectionView.indexPathsForVisibleItems.sorted()

    for indexPath in visibleIndexPaths {
      guard let page = dataSource.itemIdentifier(for: indexPath),
            !page.isTransition,
            page.pageIndex >= 0,
            let attributes = collectionView.layoutAttributesForItem(at: indexPath) else {
        continue
      }

      if attributes.frame.maxY <= viewportTop {
        continue
      }

      return ScrollAnchor(
        pageId: page.id,
        intraItemOffset: viewportTop - attributes.frame.minY
      )
    }

    return nil
  }

  private func restoreScrollAnchor(_ anchor: ScrollAnchor?) {
    guard let anchor = anchor else { return }

    let snapshot = dataSource.snapshot()
    guard let page = snapshot.itemIdentifiers.first(where: { $0.id == anchor.pageId }),
          let indexPath = dataSource.indexPath(for: page),
          let attributes = collectionView.layoutAttributesForItem(at: indexPath) else {
      return
    }

    let rawY = attributes.frame.minY + anchor.intraItemOffset - collectionView.adjustedContentInset.top
    let minY = -collectionView.adjustedContentInset.top
    let maxY = max(
      minY,
      collectionView.contentSize.height
        - collectionView.bounds.height
        + collectionView.adjustedContentInset.bottom
    )
    let clampedY = min(max(rawY, minY), maxY)

    if abs(collectionView.contentOffset.y - clampedY) > 0.5 {
      collectionView.setContentOffset(
        CGPoint(x: collectionView.contentOffset.x, y: clampedY),
        animated: false
      )
    }
  }

  private func hasStructuralChanges(previousIds: [String], currentIds: [String]) -> Bool {
    guard previousIds.count == currentIds.count else {
      return true
    }

    for (index, previousId) in previousIds.enumerated() {
      if previousId != currentIds[index] {
        return true
      }
    }

    return false
  }

  private func applyPendingScrollAnchorRestoreIfNeeded() {
    guard !collectionView.isDragging, !collectionView.isDecelerating else {
      return
    }

    guard let anchor = pendingScrollAnchorRestore else {
      return
    }

    pendingScrollAnchorRestore = nil
    collectionView.layoutIfNeeded()
    restoreScrollAnchor(anchor)
  }
}

extension WebtoonReaderView: UICollectionViewDelegateFlowLayout { }
