# 06: Disable official Readest Voice cloud TTS provider (P22)

**What to build:** Disable the official cloud `Readest Voice` text-to-speech provider (`P22`) so opening TTS settings, the voice library, or the Read Aloud player sheet never makes `/tts/readest` warmup or synthesis requests and never lists `Readest Voice` options, leaving only working engines (System TTS, Edge TTS, and Custom OpenAI-compatible TTS) while keeping all text translation providers intact.

**Blocked by:** None (can start immediately; register in `patch ledger` sequence as `P22` when committing to `main`)

**Status:** completed

- [x] The `Readest Voice` provider reports unavailable, returns an empty voice list on voice queries, short-circuits initialization to `false`, and issues zero network requests during initialization, voice loading, or synthesis.
- [x] Loading the unified TTS voice library omits the `Readest` voice group while continuing to expose System TTS (Web Speech / native Android TTS), Edge TTS, and Custom OpenAI-compatible TTS voices.
- [x] All text translation providers (built-in translation fallbacks, the `P6` DeepLX adapter, and Custom LLM translation) remain completely untouched.
- [x] Test-first assertions at the Service & Hook Boundary seam fail before the change and pass after it; `pnpm test` and `pnpm lint` pass with zero dependency or locale churn.
- [x] Committed atomically as `patch(P22)` with `P22` registered as `applied` in the `patch ledger` in the same commit.
