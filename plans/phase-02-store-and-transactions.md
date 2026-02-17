# Phase 02: Zustand Session Store + Atomic Transactions

## Goal
Create session store architecture where every reader-critical mutation is atomic and projection is recomputed inside the same transaction.

## Depends On
- Phase 01

## Must Cover
- `ReaderSessionState` normalized slices.
- Transaction reducers for:
  - chapter loading state changes
  - chapter loaded commit
  - chapter error commit
  - active anchor commit
  - chapter promotion commit
- Single-write semantics (`set` once per command commit).

## Expected Behavior
- No intermediate state where entities and projected list diverge.
- Chapter loaded commit updates both entities and projected items in one transaction.

## Edge Cases
- Re-committing a chapter already `LOADED`.
- Concurrent preload intents for same chapter.
- Invalid chapter id in commit.
- Promotion when chapter not in current window.
- Active anchor points to removed item.

## TDD: Tests First
1. Unit tests: reducer transitions for chapter lifecycle.
2. Unit tests: chapter loaded commit updates entities + projection atomically.
3. Unit tests: idempotent commits.
4. Unit tests: preload guard (`LOADED/LOADING` ignored).
5. Unit tests: promotion updates window and projection coherently.

## Development (4 parts)
1. RED
- Write reducer/transaction tests with fixture states.
2. GREEN
- Implement store slice + pure transaction helpers.
3. REFACTOR
- Separate command-intent derivation from transaction execution.
4. HARDEN
- Add race-condition simulation tests for duplicate preloads.

## Exit Criteria
- All transaction tests pass.
- Store exposes narrow selectors.
- No direct component mutation path.

## Deliverables
- `src/features/reader/state/reader.store.ts`
- `src/features/reader/state/reader.session.slice.ts`
- `src/features/reader/state/reader.selectors.ts`
- `src/features/reader/state/__tests__/reader.transactions.test.ts`
