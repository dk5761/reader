# Reader Sliding Window Plan (Down-Scroll Only)

## Scope
- Implement `prev/curr/next` chapter window for the reader.
- Support only downward reading flow for now.
- Keep React Query as the source of truth for network/loading/error state.

## Principles
- Do not duplicate API loading/error state in Zustand.
- Zustand tracks session/window pointers and reader UI transitions only.
- React Query tracks chapter-page fetch lifecycle and cache.

## Target State Model

```ts
interface ReaderWindowState {
  chapterOrder: string[]; // canonical order for this manga
  window: {
    prevId: string | null;
    currId: string;
    nextId: string | null; // resolved from chapterOrder
  } | null;
  currentPageIndex: number; // index within currId
  preload: {
    requestedNextId: string | null; // dedupe
  };
  transition: "hidden" | "loading_next" | "ready" | "error";
}
```

## Query Strategy
- Keep existing `chapterPages(sourceId, chapterId)` query key.
- `currId`: fetched with `useQuery` (blocking boot).
- `nextId`: warmed with `queryClient.prefetchQuery` when threshold is reached.
- Transition UI state derives from query cache status for `nextId`:
  - data exists -> `ready`
  - fetching/no data -> `loading_next`
  - error -> `error`

## Render Stream (Down-Scroll)
1. Render all pages of `currId`.
2. Render a transition cell after current chapter pages.
3. If `nextId` query has data, render first 2 pages of next chapter after transition.

Stable keys:
- `page:${chapterId}:${pageIndex}`
- `transition:${currId}->${nextId}`

## Trigger Rules

### Preload next chapter details
- Trigger when active page in `currId` reaches near-end threshold:
  - `currentPageIndex >= currTotalPages - 5`
- Guard:
  - `nextId` exists
  - no in-flight request already tracked in `preload.requestedNextId`
  - next query is not already loaded/fetching

### Transition behavior at chapter end
- When user reaches end of `currId`:
  - if next data not ready: transition cell shows loading/retry
  - if next data ready: transition cell + first 2 next pages visible

### Promotion (`curr -> prev`, `next -> curr`)
- Promote only when:
  - first visible anchor belongs to `nextId` (one of its visible pages), and
  - transition cell is no longer viewable.
- On promote:
  - `prevId = old currId`
  - `currId = old nextId`
  - `nextId = chapterOrder[currIndex + 1] ?? null`
  - `currentPageIndex` rebased to new `currId` visible index
  - `preload.requestedNextId = null`
  - recompute transition state

## Implementation Steps

1. **Reader session state**
- Expand `/Users/drshnk/Developer/personal/reader/readerv2/src/services/reader/reader.store.ts` with:
  - `chapterOrder`
  - `window` ids
  - `preload.requestedNextId`
  - `transition`
- Add actions:
  - `bootWindow`
  - `setCurrentPage`
  - `requestNextPreload`
  - `markTransitionState`
  - `promoteToNext`

2. **Boot path**
- Update `/Users/drshnk/Developer/personal/reader/readerv2/src/features/reader/ReaderScreen.tsx`:
  - fetch chapters list (`getSourceChapters`) to build `chapterOrder`
  - boot `window.currId` from route `chapterId`
  - derive initial `nextId`
  - keep current chapter pages query as initial blocking fetch

3. **WebtoonReader data composition**
- Update `/Users/drshnk/Developer/personal/reader/readerv2/src/features/reader/components/WebtoonReader.tsx`:
  - read window ids from store
  - pull curr/next data and status from React Query cache
  - compose mixed stream (`curr pages`, transition, optional next first 2 pages)
  - keep active-anchor updates and near-end preload trigger

4. **Transition cell**
- Add a dedicated transition component (loading/ready/error + retry).
- Retry button re-runs `prefetchQuery(nextId)`.

5. **Promotion**
- Extend viewability handler:
  - identify first visible mixed-stream item
  - detect when anchor moved into next chapter pages and transition is out
  - call `promoteToNext`

6. **Dedupe and race hardening**
- Ensure only one preload request per `nextId`.
- Ignore repeated near-end events while fetch is in progress.
- Protect against stale callbacks after promotion.

## Testing Plan

1. Unit tests for store transitions:
- boot initializes `window`
- near-end preload request dedupes
- promotion updates ids correctly

2. Integration tests for reader list behavior:
- near-end triggers next prefetch once
- transition shows loading when next not ready
- transition shows next first 2 pages when ready
- promotion occurs only after anchor enters next + transition out

3. Regression checks:
- no jump when promoting
- no duplicate keys
- no stale `currentPageIndex` leakage across chapters

## Out of Scope (Current Iteration)
- Up-scroll previous chapter loading/promotion.
- Zoom and gesture changes.
- Full page-level state machine rewrite (`queue/loading/download/...`).
- Multi-chapter memory compaction policies beyond minimal pointer shift.
