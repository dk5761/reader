import ExpoModulesCore
import UIKit

struct WebtoonPage: Hashable {
  let id: String
  let localPath: String
  let pageIndex: Int
  let chapterId: String
  let aspectRatio: CGFloat
  let isTransition: Bool
  let previousChapterTitle: String?
  let nextChapterTitle: String?
  let headers: [String: String]?
}

class WebtoonReaderView: ExpoView, UICollectionViewDelegate, UICollectionViewDataSourcePrefetching {
  let onEndReached = EventDispatcher()
  let onChapterChanged = EventDispatcher()
  let onSingleTap = EventDispatcher()
  let onPageChanged = EventDispatcher()

  private var collectionView: UICollectionView!
  private var dataSource: UICollectionViewDiffableDataSource<Int, WebtoonPage>!

  private var lastEmittedChapterId: String? = nil
  private var lastEmittedPageId: String? = nil

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
    var snapshot = NSDiffableDataSourceSnapshot<Int, WebtoonPage>()
    snapshot.appendSections([0])

    let pages = data.compactMap { dict -> WebtoonPage? in
      guard let id = dict["id"] as? String,
            let chapterId = dict["chapterId"] as? String else { return nil }

      let localPath = (dict["localPath"] as? String) ?? (dict["localUri"] as? String) ?? ""
      let pageIndex = dict["pageIndex"] as? Int ?? -1
      let aspectRatio = dict["aspectRatio"] as? CGFloat ?? 1.0
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
        isTransition: isTransition,
        previousChapterTitle: prevTitle,
        nextChapterTitle: nextTitle,
        headers: headers
      )
    }

    var currentChapterEndIndices: [String: Int] = [:]
    for (index, page) in pages.enumerated() {
      currentChapterEndIndices[page.chapterId] = index
    }

    let previousChapterSet = Set(chapterEndIndices.keys)
    let currentChapterSet = Set(currentChapterEndIndices.keys)
    if previousChapterSet != currentChapterSet {
      preloadedChapters = preloadedChapters.intersection(currentChapterSet)
    }
    chapterEndIndices = currentChapterEndIndices

    let currentPageIds = Set(pages.map(\.id))
    if let lastPage = lastEmittedPageId, !currentPageIds.contains(lastPage) {
      lastEmittedPageId = nil
    }
    if let lastChapter = lastEmittedChapterId, !currentChapterSet.contains(lastChapter) {
      lastEmittedChapterId = nil
    }

    snapshot.appendItems(pages)
    dataSource.apply(snapshot, animatingDifferences: false)
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

    if page.pageIndex >= 0 {
      onPageChanged([
        "chapterId": page.chapterId,
        "pageIndex": page.pageIndex
      ])
    }
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    let indexPaths = collectionView.indexPathsForVisibleItems.sorted()

    guard let firstIndexPath = indexPaths.first,
          let page = dataSource.itemIdentifier(for: firstIndexPath) else {
      return
    }

    emitPageVisible(page: page)

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

  func collectionView(_ collectionView: UICollectionView, prefetchItemsAt indexPaths: [IndexPath]) {
    for indexPath in indexPaths {
      guard let page = dataSource.itemIdentifier(for: indexPath),
            let endIndex = chapterEndIndices[page.chapterId] else {
        continue
      }

      if indexPath.item >= endIndex - 5 {
        if !preloadedChapters.contains(page.chapterId) {
          preloadedChapters.insert(page.chapterId)
          onEndReached(["chapterId": page.chapterId])
        }
      }
    }
  }
}

extension WebtoonReaderView: UICollectionViewDelegateFlowLayout { }
