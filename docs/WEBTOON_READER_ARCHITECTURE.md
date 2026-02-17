# Mihon Webtoon Reader Architecture - React Developer Guide

This document explains how the Mihon Android webtoon reader works, translated into React/React Native concepts for easier understanding.

---

## Overview

The Mihon webtoon reader is essentially a **vertically scrolling image list** (like a FlatList in React Native) where:
- Each item is a full-width webtoon page image
- Chapters are appended sequentially
- Preloading happens seamlessly as you scroll

Think of it as a `FlatList` with infinite scrolling where:
- The data source automatically grows as you reach the end
- Images are lazy-loaded with placeholders
- Adjacent chapters are pre-pended/appended for seamless transitions

---

## Core Components (React Mapping)

| Android (Mihon) | React/React Native Equivalent | Purpose |
|-----------------|-------------------------------|---------|
| `WebtoonViewer` | Main Reader Component | Controller that manages state, scrolling, and preloading |
| `WebtoonRecyclerView` | `FlatList` with custom scroll | Scrollable list with zoom support |
| `WebtoonAdapter` | `FlatList` data source | Manages the list of pages and chapter transitions |
| `WebtoonPageHolder` | `ListItemRenderer` (Image component) | Renders individual page images |
| `WebtoonLayoutManager` | Virtualized list logic | Manages item positioning and recycling |
| `HttpPageLoader` | React Query / SWR | Fetches pages with caching and preloading |
| `ReaderChapter` | Chapter data model | Represents a single chapter with pages |
| `ReaderPage` | Page data model | Represents a single page/image |

---

## Data Models (TypeScript Interfaces)

### ReaderPage
```typescript
interface ReaderPage {
  index: number;           // Position in chapter (0, 1, 2...)
  url: string;             // Page URL identifier
  imageUrl: string;        // Actual image URL to load
  chapter: ReaderChapter; // Parent chapter reference
  state: PageState;       // Current loading state
}

type PageState =
  | { status: 'queue' }           // Waiting in download queue
  | { status: 'loading' }         // Currently loading
  | { status: 'download' }        // Downloading image
  | { status: 'ready'; image: ImageSource }  // Ready to display
  | { status: 'error'; error: Error };      // Failed to load
```

### ReaderChapter
```typescript
interface ReaderChapter {
  id: string;
  index: number;
  pages: ReaderPage[] | null;  // null until loaded
  state: ChapterState;
  pageLoader: PageLoader;       // Handles fetching pages
}

type ChapterState =
  | { status: 'wait' }          // Initial state, not loaded
  | { status: 'loading' }      // Fetching chapter pages
  | { status: 'loaded' }        // Successfully loaded
  | { status: 'error'; error: Error };
```

### ViewerChapters
```typescript
// The "viewport" - what the reader currently has loaded
interface ViewerChapters {
  currChapter: ReaderChapter;    // Currently reading
  prevChapter: ReaderChapter | null;  // Previous chapter (for back navigation)
  nextChapter: ReaderChapter | null; // Next chapter (for forward navigation)
}
```

---

## Chapter Loading & Preloading Strategy

### The Problem They're Solving
Webtoons have many chapters, each with many pages. You can't load everything at once. You need to:
1. Load current chapter pages
2. Preload next chapter before user finishes current
3. Keep previous chapter for backward navigation

### Their Solution (React Implementation Concept)

```typescript
// Simplified version of their preloading logic
class WebtoonViewer extends React.Component {
  state = {
    chapters: {
      currChapter: null,
      prevChapter: null,
      nextChapter: null,
    },
  };

  // Called when user scrolls near end of current chapter
  checkPreload(currentPageIndex: number, totalPages: number) {
    const { currChapter, nextChapter } = this.state.chapters;

    // If within 5 pages of the end, preload next chapter
    if (totalPages - currentPageIndex < 5 && !nextChapter?.pages) {
      this.loadChapter(nextChapter.id);
    }

    // If at the beginning and no previous chapter loaded
    if (currentPageIndex < 2 && !this.state.chapters.prevChapter) {
      this.loadChapter(this.state.chapters.prevChapter?.id);
    }
  }

  // Only allow preloading same chapter or next chapter
  canPreload(page: ReaderPage): boolean {
    const { currChapter, nextChapter } = this.state.chapters;

    if (!currChapter) return true; // Initial load allowed

    return (
      page.chapter.id === currChapter.id ||
      page.chapter.id === nextChapter?.id
    );
  }
}
```

### Key Preloading Rules

1. **5-Page Threshold**: Start preloading next chapter when user is 5 pages from the end
2. **Two-Chapter Limit**: Only current and next chapter pages can preload (saves memory)
3. **Previous Chapter**: Load previous chapter only when user scrolls to the top

---

## Image Loading & Display

### The PageLoader (Like React Query)

```typescript
// Simplified HttpPageLoader - handles image downloading
class HttpPageLoader {
  // Priority queue manages which pages to load first
  private queue: PriorityQueue<ReaderPage>;
  private preloadCount = 4; // Preload next 4 pages

  async getPages(chapterId: string): Promise<ReaderPage[]> {
    // 1. Fetch page list from API
    const pageUrls = await api.getChapterPages(chapterId);

    // 2. Create ReaderPage objects
    return pageUrls.map((url, index) => ({
      index,
      url,
      imageUrl: this.getImageUrl(url),
      state: { status: 'queue' },
    }));
  }

  // Called when page comes into viewport
  async loadPage(page: ReaderPage) {
    if (page.state.status !== 'queue') return;

    // Update state to loading
    page.state = { status: 'loading' };

    try {
      // Check cache first
      const cachedImage = await this.cache.get(page.imageUrl);
      if (cachedImage) {
        page.state = { status: 'ready', image: cachedImage };
        return;
      }

      // Download image
      page.state = { status: 'download' };
      const image = await this.downloadImage(page.imageUrl);

      // Cache it
      await this.cache.set(page.imageUrl, image);

      page.state = { status: 'ready', image };
    } catch (error) {
      page.state = { status: 'error', error };
    }
  }
}
```

### Image Display (WebtoonPageHolder)

```typescript
// Simplified WebtoonPageHolder - renders a single page
const WebtoonPageHolder = ({ page }: { page: ReaderPage }) => {
  const [image, setImage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Subscribe to page state changes
    const unsubscribe = page.subscribe((state) => {
      switch (state.status) {
        case 'queue':
        case 'loading':
          setImage(null);
          setProgress(0);
          break;
        case 'download':
          setProgress(state.progress || 0);
          break;
        case 'ready':
          setImage(state.image);
          setProgress(100);
          break;
        case 'error':
          setError(state.error);
          break;
      }
    });

    return unsubscribe;
  }, [page]);

  if (error) {
    return <RetryButton onPress={() => page.retry()} />;
  }

  return (
    <View style={styles.pageContainer}>
      {progress < 100 && <LoadingIndicator progress={progress} />}
      {image && <Image source={{ uri: image }} style={styles.pageImage} />}
    </View>
  );
};
```

---

## Chapter Transitions - The "Smooth List" Magic

### The Challenge
When you reach the end of Chapter 1, you want to seamlessly continue to Chapter 2 without jarring transitions. But:
- Chapter 1 might end at page 20
- Chapter 2 starts fresh at page 0
- There might be missing chapters between them

### Their Solution: Border Pages

The adapter **intentionally includes pages from adjacent chapters** at the boundaries:

```typescript
// Simplified WebtoonAdapter.setChapters()
const WebtoonAdapter = {
  items: [],

  setChapters(viewerChapters: ViewerChapters, forceTransition: boolean) {
    const newItems: any[] = [];

    // 1. Add LAST 2 pages from previous chapter (for seamless back-scroll)
    if (viewerChapters.prevChapter?.pages) {
      const prevPages = viewerChapters.prevChapter.pages;
      newItems.push(...prevPages.slice(-2)); // Last 2 pages
    }

    // 2. Add chapter transition marker if needed (gaps in chapters)
    if (hasMissingChapters || forceTransition) {
      newItems.push(new ChapterTransition.Prev(from, to));
    }

    // 3. Add ALL current chapter pages
    newItems.push(...viewerChapters.currChapter.pages);

    // 4. Add chapter transition marker if needed
    if (hasMissingChapters || forceTransition) {
      newItems.push(new ChapterTransition.Next(from, to));
    }

    // 5. Add FIRST 2 pages from next chapter (for seamless forward-scroll)
    if (viewerChapters.nextChapter?.pages) {
      const nextPages = viewerChapters.nextChapter.pages;
      newItems.push(...nextPages.slice(0, 2)); // First 2 pages
    }

    // Use DiffUtil for efficient updates (like React reconciliation)
    this.items = DiffUtil.calculateDiff(newItems);
  },
};
```

### Visual Representation

```
Chapter 1 (pages 0-19)
├── page 0
├── page 1
├── ...
└── page 19

←── Border: Add last 2 pages of Ch1 (18, 19)
←── Border: Add ChapterTransition component (if gap)

Chapter 2 (pages 0-25)
├── page 0  ←── Border: Add first 2 pages of Ch2 (0, 1)
├── page 1  ←── Border: Add first 2 pages of Ch2 (0, 1)
├── page 2
...
```

This creates the illusion of an **infinite continuous list** - as you scroll past the last page of Chapter 1, you're already seeing the first pages of Chapter 2.

---

## Scroll Handling & Zoom

### Custom RecyclerView (WebtoonRecyclerView)

This is a custom `FlatList` with enhanced touch handling:

```typescript
// Simplified WebtoonRecyclerView capabilities
const WebtoonRecyclerView = {
  // Pinch-to-zoom configuration
  zoom: {
    minScale: 0.5,
    maxScale: 3.0,
    doubleTapScale: 2.0,
  },

  // Gesture handling
  gestures: {
    // When zoomed in: pan around the image
    // When zoomed out: scroll to next/prev page
    onTouch: (event) => {
      if (currentScale > 1.0) {
        // Pan mode: translate the image
        return handlePan(event);
      } else {
        // Scroll mode: normal vertical scroll
        return handleScroll(event);
      }
    },
  },

  // Detect manual scroll vs auto-scroll
  scrollState: {
    IDLE: 'idle',        // Not scrolling
    DRAG: 'drag',        // User is actively scrolling
    FLING: 'fling',      // User let go with momentum
  },
};
```

### Chapter Transition Detection

```typescript
// Simplified scroll listener
const onScroll = (event) => {
  const { contentOffset, contentSize, layoutMeasurement } = event;
  const currentIndex = Math.floor(contentOffset.y / itemHeight);

  // Reached the end - trigger next chapter
  if (currentIndex >= totalPages - 1) {
    this.loadNextChapter();
  }

  // Reached the start - trigger previous chapter
  if (currentIndex <= 0 && hasPrevChapter) {
    this.loadPrevChapter();
  }
};
```

---

## State Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        READER ACTIVITY                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WEBTOON VIEWER                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ViewerChapters: { curr, prev, next }                    │   │
│  │  - curr: Current chapter being read                      │   │
│  │  - prev: Previous chapter (for back navigation)          │   │
│  │  - next: Next chapter (preloaded for seamless scroll)    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│  ┌─────────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │   PREV CHAPTER  │ │CURR CHAPTER │ │   NEXT     │            │
│  │   (last 2 pgs)  │ │  (all pgs)  │ │(first 2 pgs)│            │
│  └─────────────────┘ └─────────────┘ └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WEBTOON ADAPTER                              │
│  FlatList data source with DiffUtil for efficient updates       │
│  Items: [Page | ChapterTransition | Page | ...]                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   WEBTOON PAGE HOLDER                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Page State Machine:                                      │   │
│  │                                                              │   │
│  │    queue ──► loading ──► download ──► ready               │   │
│  │     │           │            │            │                │   │
│  │     └───────────┴────────────┴────────────┘ error          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Image Loading:                                           │   │
│  │  - Check cache first                                       │   │
│  │  - Download if not cached                                  │   │
│  │  - Progress callback during download                      │   │
│  │  - Store in cache when complete                            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     HTTP PAGE LOADER                            │
│  - PriorityQueue for managing load order                       │
│  - Preloads next 4 pages automatically                         │
│  - Chapter-level caching                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Implementation Details

### 1. Page State Machine

```typescript
// Each page has its own state machine
// React equivalent: useReducer for each list item

const PAGE_STATES = {
  QUEUE: 'queue',           // Waiting to be loaded
  LOAD_PAGE: 'loadPage',    // Fetching page info
  DOWNLOAD_IMAGE: 'downloadImage',  // Downloading image
  READY: 'ready',           // Image loaded and ready
  ERROR: 'error',          // Something failed
};
```

### 2. Priority Queue for Image Loading

```typescript
// HttpPageLoader uses PriorityBlockingQueue
// Loads pages based on proximity to current position

class PageLoader {
  private queue = new PriorityQueue((a, b) => {
    // Higher priority = closer to current page
    return Math.abs(a.index - currentPage) - Math.abs(b.index - currentPage);
  });

  // When current page is 5, pages 3-7 load first
  // Then continue outward: 2, 8, 1, 9...
}
```

### 3. Image Processing Options

Mihon supports various image transformations:

```typescript
interface ImageConfig {
  cropBorders: boolean;        // Remove white borders
  dualPageSplit: boolean;      // Split wide images into 2 pages
  dualPageRotateToFit: boolean; // Rotate for best fit
  dualPageInvert: boolean;     // For RTL languages
}
```

---

## Comparison: Mihon vs React Native FlatList

| Feature | Mihon (Android) | React Native |
|---------|-----------------|--------------|
| Scroll container | Custom RecyclerView | FlatList |
| Virtualization | Manual LayoutManager | Built-in |
| Image loading | HttpPageLoader | react-native-image / uri |
| Preloading | 5-page threshold | `initialNumToRender` + `onEndReached` |
| State management | LiveData/Flow | React state/hooks |
| Zoom | Custom PhotoView | react-native-gesture-handler |
| Chapter transitions | Border pages | `onEndReached` + pagination |

---

## How to Implement Something Similar in React Native

```typescript
// High-level implementation guide
import { FlatList, Image, View, Text, ActivityIndicator } from 'react-native';
import { useInfiniteScroll } from 'react-native-infinite-scroll';

const WebtoonReader = ({ chapterId }) => {
  const [chapters, setChapters] = useState({
    curr: null,
    prev: null,
    next: null,
  });

  const [pages, setPages] = useState([]);

  // 1. Load initial chapter
  useEffect(() => {
    loadChapter(chapterId).then((chapter) => {
      setChapters({ curr: chapter, prev: null, next: null });
      setPages(chapter.pages);
    });
  }, [chapterId]);

  // 2. Handle scroll - detect chapter boundaries
  const onScroll = ({ distanceFromEnd }) => {
    const currentIndex = pages.findIndex(/* current visible */);

    // Preload next chapter when 5 pages from end
    if (pages.length - currentIndex < 5 && chapters.next && !chapters.next.loaded) {
      loadChapter(chapters.next.id).then((nextChapter) => {
        // Append first 2 pages of next chapter
        setPages([...pages, ...nextChapter.pages.slice(0, 2)]);
        setChapters({ ...chapters, next: nextChapter });
      });
    }
  };

  // 3. Render page
  const renderPage = ({ item }) => {
    if (item.type === 'page') {
      return <WebtoonPage page={item} />;
    }
    // Chapter transition component
    return <ChapterTransition from={item.from} to={item.to} />;
  };

  return (
    <FlatList
      data={pages}
      renderItem={renderPage}
      onScroll={onScroll}
      keyExtractor={(item) => item.id}
      initialNumToRender={10}
      maxToRenderPerBatch={5}
      windowSize={11}
    />
  );
};
```

---

## Summary

The Mihon webtoon reader achieves smooth continuous reading through:

1. **Vertical FlatList Architecture**: Uses RecyclerView as a continuous scroll container instead of paginated views

2. **Border Pages**: Adds 2 pages from adjacent chapters at boundaries to create seamless transitions

3. **Progressive Preloading**:
   - Loads current chapter immediately
   - Preloads next chapter when 5 pages from end
   - Preloads previous chapter only when at top

4. **Priority-based Image Loading**: Uses priority queue to load images closest to current position first

5. **State Machines**: Each page has its own loading state (`queue → loading → download → ready`)

6. **Efficient Updates**: Uses DiffUtil to calculate minimal changes to the list

This architecture ensures users experience **smooth, continuous reading** without jarring chapter transitions or visible loading delays.
