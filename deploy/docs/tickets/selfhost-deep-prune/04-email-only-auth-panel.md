# 04: Restrict authentication UI to email and password (P20)

**What to build:** Remove the unbacked third-party OAuth sign-in buttons and visual divider from the authentication view (`P20`) so signing in or signing up on Web and Android presents only the email and password workflows backed by the self-hosted GoTrue instance and its `email allowlist`.

**Blocked by:** None (can start immediately; register in `patch ledger` sequence as `P20` when committing to `main`)

**Status:** completed

- [x] The Google, Apple, GitHub, and Discord OAuth sign-in buttons and the `"or continue with email"` divider are not rendered in the authentication panel across Web and Tauri/Android modes.
- [x] Email and password sign-in, sign-up, terms/validation states, and password-reset flows continue to function normally.
- [x] No locale JSON files, dependency manifests, or server auth endpoints are modified.
- [x] Test-first component render assertions at the Rendered UI Surface seam fail before the change and pass after it; `pnpm test` and `pnpm lint` pass.
- [x] Committed atomically as `patch(P20)` with `P20` registered as `applied` in the `patch ledger` in the same commit.
