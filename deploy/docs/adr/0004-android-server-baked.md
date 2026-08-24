# The Android app's server is baked at build time

The APK is built with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_NODE_BASE_URL` inlined into the
bundle. There is no in-app field for choosing a server; pointing the app at a
different deployment means rebuilding it.

Upstream is often described as "not allowing third-party servers" on mobile. That
is not quite right: nothing forbids it, and the Tauri CSP already permits any
`https` origin. The obstacle is that a Tauri build has no server to inject runtime
configuration, so every lookup falls through to a build-time value — and upstream
commits a base64-obfuscated default pointing at `readest.supabase.co`, which is
what makes an unconfigured build silently official.

## Considered options

**A runtime server switcher.** Rejected on cost. `utils/supabase.ts` constructs
its client as a module-level singleton at import time, and it is imported almost
everywhere; making the server switchable means introducing a getter layer and
changing every call site — a large patch, in files upstream actively develops,
that would conflict on most upgrades. It would also raise questions this
deployment does not need answered: what happens to the local library and session
when the server changes underneath them.

## Consequences

Rotating `JWT_SECRET` on the server invalidates `ANON_KEY`, which is baked into
every installed APK, so it requires rebuilding and redistributing. Treat that
secret as long-lived.

This decision is worth revisiting only if the APK is ever distributed to people
running their own servers. For a single deployment it is strictly simpler.

The build-time model also caused a bug worth remembering, because it is not
obvious: only `NEXT_PUBLIC_`-prefixed variables reach the client bundle, so
`OBJECT_STORAGE_TYPE` is invisible to the Android app and `getStorageType()`
silently defaults to `r2`. Since `getRemoteBookFilename` derives cloud object keys
from it, Android and web computed different keys for the same book. Patch P8 fixes
it. The general lesson: on Tauri, any configuration that matters must be both
`NEXT_PUBLIC_`-prefixed *and* actually read on the client path.
