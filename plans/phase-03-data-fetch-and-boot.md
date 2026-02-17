# Phase 03: Query/Axios Integration + Boot Pipeline

## Goal
Implement command-driven data loading with TanStack Query and axios, including initial boot gate (load initial chapter data before rendering reader stream).

## Depends On
- Phase 01
- Phase 02

## Must Cover
- Query key conventions.
- `fetchChapterPages` adapter.
- `boot()` command flow:
  - mark initial chapter `LOADING`
  - fetch pages
  - commit chapter `LOADED` atomically
  - set initial scroll target

## Expected Behavior
- Reader list is not shown until boot chapter pages are committed.
- Query cache may fulfill fetch, but state commit path remains command-driven.

## Edge Cases
- boot called twice quickly.
- query failure on initial chapter.
- invalid chapter id from route.
- empty pages returned.
- cache hit with stale chapter metadata.

## TDD: Tests First
1. Unit tests: `boot()` state transition order.
2. Unit tests: boot failure path commits error state.
3. Integration tests (mock query client): list gated until boot success.
4. Integration tests: duplicate boot calls are deduped/guarded.

## Development (4 parts)
1. RED
- Write command tests with mocked query client/axios.
2. GREEN
- Implement reader API + query functions + `boot()`.
3. REFACTOR
- Isolate DTO -> entity normalization.
4. HARDEN
- Add retry policy tests and timeout/error mapping tests.

## Exit Criteria
- Boot sequence is deterministic and tested.
- No reader mount-time effect chain beyond one boot effect.

## Deliverables
- `src/features/reader/infra/reader.api.ts`
- `src/features/reader/infra/reader.query.ts`
- `src/features/reader/domain/reader.commands.ts` (boot path)
- `src/features/reader/domain/__tests__/reader.boot.test.ts`
