# Phase 04: Vertical List Rendering + Active Anchor Engine

## Goal
Render projected stream with transition/page cells and establish deterministic active-item detection as source of truth for reader progression.

## Depends On
- Phase 01
- Phase 02
- Phase 03

## Must Cover
- `ReaderProvider` with stable commands + session context.
- `ReaderScreen` subscribing only to minimal selectors.
- `ReaderList` (`FlatList`/`FlashList`) using `projectedItemIds`.
- Active item derivation from `onViewableItemsChanged`.

## Expected Behavior
- Active anchor updates consistently while scrolling.
- No chapter jump from render churn.
- Transition items render between chapters.

## Edge Cases
- Rapid fling produces unstable visible sets.
- List re-renders with same ids should not reset position.
- Transition item as active anchor.
- initial scroll target application before layout ready.

## TDD: Tests First
1. Unit tests: active-item picker function (`pickActiveItem`).
2. Unit tests: scroll direction detector.
3. Integration tests: active anchor updates on simulated viewable changes.
4. Integration tests: stable key behavior across projection recompute.

## Development (4 parts)
1. RED
- Write tests for active-item and scroll intent derivation.
2. GREEN
- Implement list + cell skeletons + active anchor command wiring.
3. REFACTOR
- Memoize selectors/cell props; ensure itemId-only renderer input.
4. HARDEN
- Add instrumentation assertions for rerender counts and anchor drift.

## Exit Criteria
- Deterministic active anchor under normal and fast scroll.
- Cells are memoized and keyed by `itemId`.

## Deliverables
- `src/features/reader/ui/ReaderProvider.tsx`
- `src/features/reader/ui/ReaderScreen.tsx`
- `src/features/reader/ui/ReaderList.tsx`
- `src/features/reader/ui/cells/PageCell.tsx`
- `src/features/reader/ui/cells/TransitionCell.tsx`
- `src/features/reader/ui/__tests__/reader.active-anchor.test.ts`
