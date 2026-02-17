# Phase 01: Domain Model + Projection Engine

## Goal
Implement the normalized reader domain and pure projection logic that maps chapter window state into a single vertical item stream.

## Depends On
- None

## Must Cover
- Entity types: chapter/page/item/transition/window.
- Pure function `projectItems(sessionState)`.
- Constants parity with Mihon flow:
  - `prevTailCount = 2`
  - `nextHeadCount = 2`
  - transition inclusion rules

## Expected Behavior
- Given `prev/curr/next` and chapter load states, projection outputs deterministic ordered `ReaderItem[]` ids.
- Projection output is stable for identical inputs.

## Edge Cases
- `prev` missing, `next` missing.
- `prev` or `next` exists but not loaded.
- Current chapter loaded with empty page list.
- Missing chapter gap forces transition item.
- `alwaysShowTransition = true` forces transitions.

## TDD: Tests First
1. Unit tests: `projectItems` ordering matrix.
2. Unit tests: transition insertion matrix.
3. Unit tests: prev tail/head slice limits.
4. Unit tests: deterministic ids and no duplicate item ids.
5. Unit tests: id stability across equivalent states.

## Development (4 parts)
1. RED
- Write failing tests for all projection matrices.
2. GREEN
- Implement minimal types + `projectItems` to satisfy tests.
3. REFACTOR
- Extract helpers (`shouldShowPrevTransition`, `shouldShowNextTransition`, `sliceTailHead`).
4. HARDEN
- Add property-like tests for random chapter lengths and state combinations.

## Exit Criteria
- All projection tests pass.
- No React/UI code yet.
- Projection module is pure and side-effect free.

## Deliverables
- `src/features/reader/domain/reader.types.ts`
- `src/features/reader/domain/reader.projection.ts`
- `src/features/reader/domain/__tests__/reader.projection.test.ts`
