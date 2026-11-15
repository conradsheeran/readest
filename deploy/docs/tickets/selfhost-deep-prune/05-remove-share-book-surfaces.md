# 05: Remove Share Book across Reader, Bookshelf, and Book Detail surfaces (P21)

**What to build:** Remove the `Share Book` remote-link action (`P21`) from every book and reader menu where it appears so readers on Web, Android phones, and BOOX E-ink devices never encounter broken share links pointing at `web.readest.com`, while preserving all reading layout controls, OS-level file sending (`Send`), and `Save Book Cover` for E-ink sleep screens.

**Blocked by:** None (can start immediately; register in `patch ledger` sequence as `P21` when committing to `main`)

**Status:** completed

- [x] `Share Book` (along with any orphaned adjacent divider) is absent from the Reader View Menu, the Library bookshelf item context/action menu, and the Book Detail metadata view.
- [x] All Reader View Menu reading/layout controls (scrolled vs paginated, dual-page, page-turn animations, margins, E-ink mode), multi-select OS file `Send`, and `Save Book Cover` remain intact and functional.
- [x] No locale JSON files or new user-visible strings are added or modified.
- [x] Test-first component render assertions across all three surfaces at the Rendered UI Surface seam fail before the change and pass after it; `pnpm test` and `pnpm lint` pass.
- [x] Committed atomically as `patch(P21)` with `P21` registered as `applied` in the `patch ledger` in the same commit.
