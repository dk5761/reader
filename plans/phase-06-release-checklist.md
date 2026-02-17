# Phase 06 Release Checklist (Phase 1 Scope)

## Functional
- [ ] Opening chapter loads initial chapter pages before rendering stream.
- [ ] Scrolling down reaches next chapter seamlessly.
- [ ] Scrolling up reaches previous chapter seamlessly.
- [ ] Transition/loading state appears and resolves correctly.
- [ ] Preload retry works after network failure.

## Correctness
- [ ] No duplicate item ids in projected stream.
- [ ] No invalid active anchor after reprojection.
- [ ] No chapter promotion loops.
- [ ] No unbounded preload requests for same chapter.

## Performance
- [ ] `ReaderScreen` rerenders within expected budget while scrolling.
- [ ] `PageCell` rerenders only when its own page state changes.
- [ ] No obvious dropped frames around chapter boundary.

## Technical
- [ ] Unit + integration + regression suites pass.
- [ ] No new side-effect chains added beyond approved effects.
- [ ] Commands remain single-write atomic for critical transitions.
