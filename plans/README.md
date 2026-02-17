# Webtoon Reader TDD Plan

Source architecture reference:
- `/Users/drshnk/Developer/personal/reader/readerv2/docs/react-native-webtoon-reader-atomic-architecture.md`

Execution order:
1. `/Users/drshnk/Developer/personal/reader/readerv2/plans/phase-01-domain-and-projection.md`
2. `/Users/drshnk/Developer/personal/reader/readerv2/plans/phase-02-store-and-transactions.md`
3. `/Users/drshnk/Developer/personal/reader/readerv2/plans/phase-03-data-fetch-and-boot.md`
4. `/Users/drshnk/Developer/personal/reader/readerv2/plans/phase-04-list-render-and-active-anchor.md`
5. `/Users/drshnk/Developer/personal/reader/readerv2/plans/phase-05-cross-chapter-preload-and-promotion.md`
6. `/Users/drshnk/Developer/personal/reader/readerv2/plans/phase-06-stability-hardening-and-regression.md`

Global constraints:
- TDD first in every phase.
- Atomic state updates only for reader-critical transitions.
- Minimal `useEffect` (boot + scroll target + cleanup only).
- Phase 1 scope only: seamless vertical chapter flow.
- Explicitly out of scope until phase 2: zoom, advanced navigation controls, page seek UX.
