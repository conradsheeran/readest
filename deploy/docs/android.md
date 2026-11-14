# Android build

How the APK is produced and why it is configured the way it is. Read the
"baked configuration" section of `architecture.md` first.

## The one thing to understand

A Tauri build has no server, so nothing injects configuration at runtime.
`getRuntimeConfig()` returns `undefined` and every lookup falls through to
`process.env['NEXT_PUBLIC_*']`, which Next inlined when the bundle was built.

**The APK's server is therefore fixed at build time.** There is no in-app server
field, and adding one would mean refactoring `utils/supabase.ts` — where the
client is a module-level singleton constructed at import — plus every site that
imports it. That was considered and rejected; see ADR-0004.

Only variables carrying the `NEXT_PUBLIC_` prefix reach the client bundle. A
non-prefixed variable is simply absent, which is the root of patch P8.

## Baked configuration

Written to `apps/readest-app/.env.local` before the build. Next gives `.env.local`
precedence over the committed `.env`, which is how patch P5's blanked defaults
and these values coexist.

```env
NEXT_PUBLIC_APP_PLATFORM=tauri
NEXT_PUBLIC_SELF_HOSTED=true
# Disables the updater UI: the APK has no update channel of its own.
NEXT_PUBLIC_DISABLE_UPDATER=true

# Which server this APK talks to. All four point at the same origin.
NEXT_PUBLIC_SUPABASE_URL=https://read.conraaad.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the deployment's ANON_KEY>
NEXT_PUBLIC_API_BASE_URL=https://read.conraaad.com
NEXT_PUBLIC_NODE_BASE_URL=https://read.conraaad.com

# Required by patch P8 — without the patch this value is not read at all.
NEXT_PUBLIC_OBJECT_STORAGE_TYPE=s3

# Required by patch P15 — without the patch this value is not read at all.
NEXT_PUBLIC_STORAGE_FIXED_QUOTA=107374182400
# Required by patch P15 — without the patch this value is not read at all.
NEXT_PUBLIC_TRANSLATION_FIXED_QUOTA=10000000
NEXT_PUBLIC_FONT_BASE_URL=https://read.conraaad.com/fonts
```

Why each of the four server URLs is needed:

| Variable | Consumed by | Without it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `utils/supabase.ts` | Falls back to the baked official default. P5 replaces that default with `https://placeholder.invalid`, so leaving this unset bakes an unreachable placeholder rather than upstream's Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `utils/supabase.ts` | Same |
| `NEXT_PUBLIC_API_BASE_URL` | `services/environment.ts::getBaseUrl` | Falls back to `https://web.readest.com` |
| `NEXT_PUBLIC_NODE_BASE_URL` | `services/environment.ts::getNodeBaseUrl` | Falls back to `https://node.readest.com`. Used for the OPDS proxy, which our image serves at `/api/opds/proxy` |
| `NEXT_PUBLIC_SELF_HOSTED` | `utils/access.ts::isSelfHosted` | Falls back to P1's `true` default. Baked explicitly so a build environment that sets it to `false` cannot silently re-enable the paywalls |
| `NEXT_PUBLIC_DISABLE_UPDATER` | `services/nativeAppService.ts::hasUpdater` | Without it, `hasUpdater` stays `true` on Android, so Settings → Control renders dead "Check Updates on Start" and "Nightly Builds" switches. Setting it to `true` disables them without a source patch |

Deliberately **not** set:

- `SENTRY_DSN` — leaving it unset is what disables crash reporting.
  `sentry_config.rs::dsn_from_env` maps unset or empty to `None`, and
  `scripts/upload-sourcemaps.mjs` no-ops without `SENTRY_AUTH_TOKEN`. Upstream
  wrote both paths for fork builds.
- `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` — and note that setting these to empty is
  *not* how PostHog is disabled, because an empty override falls through to the
  baked default. Patch P5 removes the default.

`ANON_KEY` is baked into the APK. Rotating `JWT_SECRET` on the server therefore
invalidates every installed app, and requires rebuilding and redistributing.
Treat it as long-lived.

## Toolchain

Taken from upstream's own release workflow at `v0.12.1`. These versions are not
arbitrary — the NDK version in particular must match what Tauri expects.

| Component | Version |
| --- | --- |
| Java | 17 (Zulu) |
| Android SDK | via `android-actions/setup-android` |
| NDK | `28.2.13676358` |
| Node | 24 |
| Rust targets | `aarch64-linux-android`, `armv7-linux-androideabi`, `i686-linux-android`, `x86_64-linux-android` |

`NDK_HOME` must be set to `$ANDROID_HOME/ndk/28.2.13676358`.

## Build sequence

```bash
pnpm install --frozen-lockfile --prefer-offline
pnpm --filter @readest/readest-app setup-vendors

cd apps/readest-app
rm -rf src-tauri/gen/android
pnpm tauri android init
pnpm tauri icon ../../data/icons/readest-book.png
git checkout .            # tauri android init rewrites tracked files; discard that
```

`tauri android init` regenerates the Gradle project from scratch every build,
which is why the keystore configuration below is written *after* it and not
committed. The `git checkout .` afterwards is upstream's own step: `init` and
`icon` modify tracked files, and those changes are not wanted.

Then signing configuration and the build:

```bash
pushd src-tauri/gen/android
cat > keystore.properties <<CONF
keyAlias=$ANDROID_KEY_ALIAS
password=$ANDROID_KEY_PASSWORD
storeFile=$RUNNER_TEMP/keystore.jks
CONF
popd

pnpm tauri android build              # universal APK
pnpm tauri android build -t aarch64   # arm64-only APK
```

Both land in
`src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`
— the second build overwrites the first, so copy the artifact out between runs.

## Signing

The APK must be signed with a **stable keystore**. Android identifies an app by
its signature: a differently signed APK cannot upgrade an existing install, and
the user has to uninstall first, losing local data.

**If the keystore is lost, every installed copy is stranded.** There is no
recovery. Back it up somewhere that is not this repository and not the CI
provider.

Generate it once:

```bash
keytool -genkeypair -v \
  -keystore readest-selfhost.jks \
  -alias readest-selfhost \
  -keyalg RSA -keysize 4096 \
  -validity 10000 \
  -storetype JKS
```

Then store these as GitHub Actions secrets:

| Secret | Value |
| --- | --- |
| `ANDROID_KEY_BASE64` | `base64 -w0 readest-selfhost.jks` |
| `ANDROID_KEY_ALIAS` | The alias used above |
| `ANDROID_KEY_PASSWORD` | The keystore/key password |

The repository is public. The keystore must never be committed — only ever
reconstituted from the secret inside a workflow run.

## Cost

Four Rust targets plus two Gradle builds is the slowest job in this repository —
budget around an hour. It is worth building the arm64-only variant separately
only if that reduction matters; otherwise the universal APK covers every device.

## Known gaps

Anything under "Open decisions" in the patch ledger that touches the app affects
the APK too. The in-app updater is the notable closed one: P9 makes the update
check a no-op, and P12 retires the About dialog's update button and the startup
release-notes fetch. `NEXT_PUBLIC_DISABLE_UPDATER=true` is baked into the APK as
well, which sets `hasUpdater` to `false` and hides the Settings → Control
"Check Updates on Start" and "Nightly Builds" toggles instead of leaving them to
do nothing. An installed APK therefore does not offer **official** Readest
builds and cannot update itself into the stock app. There is no in-app update
path; ship and install a new APK.
