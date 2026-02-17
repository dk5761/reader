# Phase 05: Seamless Cross-Chapter Flow (Core Phase)

## Goal
Implement Mihon-style seamless chapter traversal: preload next/previous around boundaries and promote chapters without scroll discontinuity.

## Depends On
- Phase 01
- Phase 02
- Phase 03
- Phase 04

## Must Cover
- Preload triggers:
  - `NEAR_END`
  - `TRANSITION_ACTIVE`
  - `REVERSE_TOP`
- Preload command guard rules.
- Chapter promotion when active item enters different chapter.
- Reprojection + anchor preservation in the same transaction.

## Expected Behavior
- Scroll down crosses into next chapter smoothly.
- Scroll up crosses into previous chapter smoothly.
- Brief transition loader can appear while destination chapter is loading.
- No forced jump to top on adjacent chapter availability.

## Edge Cases
- Trigger fires repeatedly on same boundary.
- Preload chapter already loaded/loading.
- Preload failure then retry.
- Previous and next preload racing simultaneously.
- Promotion while list is still receiving momentum events.

## TDD: Tests First
1. Unit tests: preload trigger derivation from `(activeItem, direction, chapter state)`.
2. Unit tests: preload guards and dedupe tokens.
3. Integration tests: near-end trigger loads next and updates projection.
4. Integration tests: reverse-top trigger loads previous and updates projection.
5. Integration tests: promotion keeps anchor continuity.

## Development (4 parts)
1. RED
- Write failing trigger + promotion integration tests.
2. GREEN
- Implement command logic and transaction commits.
3. REFACTOR
- Centralize intent derivation and throttle/dedupe boundaries.
4. HARDEN
- Add stress tests for rapid scroll oscillation near boundaries.

## Exit Criteria
- Infinite-like bidirectional chapter traversal works.
- Trigger dedupe prevents request spam.
- No observable jump at chapter boundaries.

## Deliverables
- `src/features/reader/domain/reader.guards.ts`
- `src/features/reader/domain/reader.commands.ts` (preload/promotion paths)
- `src/features/reader/domain/__tests__/reader.preload-triggers.test.ts`
- `src/features/reader/ui/__tests__/reader.seamless-boundary.test.ts`
