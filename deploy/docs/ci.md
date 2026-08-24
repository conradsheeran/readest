# CI

Two workflows, both in `.github/workflows/`, both prefixed `selfhost-` because
that directory is the one place namespacing is impossible.

**Status: specification.** Neither workflow exists yet. Upstream's nine workflows
are deleted on `main` (patch ledger P7) — including the ones that would otherwise
fire on `release: published` and burn hours of runner time failing.

## `selfhost-image.yml` — the Docker image

**Triggers**: `workflow_dispatch`, `push` to `main`, `release: published`.

**Does**: builds `production-stage` from the root `Dockerfile` for
`linux/amd64` and pushes to GHCR.

**Build arguments**: only `NEXT_PUBLIC_APP_PLATFORM=web`. Everything else is
runtime configuration, so one generic image serves any deployment
(`architecture.md`). The exception is patch P5's placeholder Supabase values,
which exist purely to let the build get past `createClient` — see the caveat in
the ledger entry.

**Tags**: on a release, the selfhost version (which reuses upstream's version
number, ADR-0003) plus `<version>-<sha7>` plus `latest`. The `<version>-<sha7>`
form is immutable and is what an "already published, skip" check should test
against.

**Why this is the type-check gate**: `pnpm build-web` runs `next build`, which
runs the type-checker. That is what catches a stub from P2 or P3 whose props have
drifted from upstream. A patch can apply cleanly and still not compile — only
this job proves it does.

**Submodules**: check out recursively. The web build consumes several submodules
as *source*, not as prebuilt assets, so a missing one surfaces as a webpack
"Can't resolve" failure deep into the Docker build. Initialize everything rather
than curating a list.

## `selfhost-android.yml` — the APK

**Triggers**: `workflow_dispatch`, `release: published`.

Not on `push`. This is the most expensive job here — around an hour — and
building it on every commit to `main` is waste.

**Does**: what `android.md` documents, in order — toolchain setup, write
`.env.local`, `tauri android init`, reconstitute the keystore from secrets,
build, attach the APKs to the release.

**Secrets**: `ANDROID_KEY_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
The keystore is written to `$RUNNER_TEMP`, never into the workspace — the
repository is public.

**Artifacts**: `Readest_<version>_universal.apk` and
`Readest_<version>_arm64.apk`, uploaded to the GitHub release.

## Pulling the image on the host

The GHCR package needs credentials once per host:

1. Create a GitHub personal access token with the `read:packages` scope.
2. On the host:

   ```bash
   echo "<token>" | docker login ghcr.io -u conradsheeran --password-stdin
   ```

Docker persists this in `~/.docker/config.json`.

## What CI does not do

**It does not check that patches still apply.** The pre-fork repository had a
cheap "patch check" job for that, because patches were applied by a script at
build time. In a fork they are commits: the rebase in the upgrade runbook either
succeeds or stops with a conflict, on your machine, before anything reaches CI.
There is nothing left for a job to check.

**It does not release automatically.** Tagging and publishing are manual steps in
the runbook. The release event is what triggers these two workflows, so an
accidental release costs an hour of runner time and a wrong APK.

**It does not deploy.** The host pulls; nothing pushes to it.

## A trap specific to forks

In a fork, GitHub's "New pull request" button defaults its target to the
**upstream** repository. Opening a PR by reflex proposes our patches to
`readest/readest`. The release flow here never needs a PR — tag and release
directly on `main`.
