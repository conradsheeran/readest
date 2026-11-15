# 09: Stub upstream Support/Legal link blocks and disable logged-out demo books (P25)

**What to build:** Remove residual outbound links to Readest's official support/legal pages and stop unauthenticated Web sessions from downloading official sample books (`P25`), so neither the About window nor the User Profile screen displays upstream community/legal URLs and opening the Web deployment while signed out shows an empty library with zero requests to `storage.readest.com`.

**Blocked by:** None (can start immediately; register in `patch ledger` sequence as `P25` when committing to `main`)

**Status:** completed

- [x] The shared Support Links and Legal Links components render nothing (`null`), removing Discord, GitHub, feedback, translation, Terms of Service, Privacy Policy, and Contact external links from both the About dialog and the User Profile view while keeping app version information intact.
- [x] The demo-books hook returns an empty array immediately without fetching remote demo book metadata or `.epub` files from `storage.readest.com` when no user is signed in.
- [x] Signed-in library loading, local book imports, and cloud sync remain unaffected, and no locale JSON files or dependencies are modified.
- [x] Test-first assertions at the Rendered UI Surface seam and Service & Hook Boundary seam fail before the change and pass after it; `pnpm test` and `pnpm lint` pass.
- [x] Committed atomically as `patch(P25)` with `P25` registered as `applied` in the `patch ledger` in the same commit.
