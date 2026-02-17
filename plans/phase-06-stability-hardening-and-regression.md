# Phase 06: Stability, Regression Suite, and Release Gate

## Goal
Lock in behavior with regression tests, performance checks, and deterministic acceptance criteria for Phase 1 seamless reading.

## Depends On
- Phase 01 to Phase 05

## Must Cover
- Regression matrix for all boundary paths.
- Atomicity assertions for critical commands.
- Rerender and anchor drift guardrails.
- Device-level sanity checklist (low memory + slow network).

## Expected Behavior
- Core seamless flow remains stable under heavy scrolling and delayed network.
- No chapter duplication, no skipped transitions, no anchor snapping.

## Edge Cases
- very long chapters
- empty chapter surrounded by valid chapters
- intermittent network failures mid-scroll
- chapter list updates while session active
- app background/foreground during preload

## TDD: Tests First
1. Regression integration tests for all previously fixed bugs.
2. Atomicity tests: command emits one logical store transaction.
3. Performance tests: selector-level rerender budget.
4. Contract tests: projection invariants always hold.

## Development (4 parts)
1. RED
- Add regression tests for known failure modes.
2. GREEN
- Patch defects revealed by regression suite.
3. REFACTOR
- Tighten selectors and memoization hotspots.
4. HARDEN
- Create release checklist and freeze criteria.

## Exit Criteria
- Full suite green (unit + integration + regression).
- Acceptance checklist signed:
  - down-scroll chapter crossing
  - up-scroll chapter crossing
  - preload error recovery
  - no boundary jump

## Deliverables
- `src/features/reader/**/__tests__/regression/*.test.ts`
- `plans/phase-06-release-checklist.md`
- CI test command updates for reader test subsets
