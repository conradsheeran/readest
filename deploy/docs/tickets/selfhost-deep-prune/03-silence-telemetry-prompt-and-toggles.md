# 03: Silence telemetry consent prompts and hide user-facing telemetry controls (P19)

**What to build:** Remove all user-visible telemetry consent prompts and analytics toggle surfaces (`P19`) so fresh or undecided profiles on Web and Android silently record an opted-out telemetry decision without ever rolling into the 10% consent modal bucket, and readers never see dead telemetry switches in Settings or the Command Palette while PostHog remains disabled via `P5`.

**Blocked by:** 02: Disable Android Auto across all flavors and unmount car-media runtime bridge (P18)

**Status:** completed

- [x] Boot-time telemetry consent resolution in the root providers tree unconditionally records silent `opt-out` for undecided (`null` or stale `pending`) profiles and never invokes the telemetry consent prompt modal regardless of random bucket roll or new-user status.
- [x] Settings → Control no longer renders the telemetry opt-in switch.
- [x] The Command Palette no longer exposes a telemetry toggle action.
- [x] Underlying persisted settings serialization types remain unchanged and no locale files or new user-visible strings are added or modified.
- [x] Test-first assertions at the Root Provider / Rendered UI Surface seam fail before the change and pass after it; `pnpm test` and `pnpm lint` pass.
- [x] Committed atomically as `patch(P19)` with `P19` registered as `applied` in the `patch ledger` in the same commit.
