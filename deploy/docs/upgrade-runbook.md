# Upgrade runbook

Follow this when upstream publishes a new release. It assumes you have read
`deploy/AGENTS.md` and `deploy/docs/patch-ledger.md`.

The whole procedure is one sentence: move `upstream` to the new release commit,
rebase `main` onto it, re-verify the assumptions the patches rest on, then
publish. Everything below is that sentence in detail.

---

## 0. Preconditions

Run once per clone:

```bash
git remote add upstream https://github.com/readest/readest.git
git config rerere.enabled true
```

`rerere` matters. It records how you resolved each conflict, so the second and
subsequent times you hit the same delete/modify conflict on a workflow file it
replays your resolution automatically.

## 1. Find the new release

```bash
gh api repos/readest/readest/releases/latest --jq '{tag: .tag_name, published: .published_at}'
```

Only tagged releases are valid patch bases. Never rebase onto upstream's `main`
— see the invariant in `deploy/AGENTS.md`.

## 2. Fetch it into the upstream ref namespace

```bash
git fetch upstream 'refs/tags/v*:refs/upstream/v*' --no-tags
git rev-parse refs/upstream/<NEW_TAG>
```

`--no-tags` and the explicit refspec are both required. A bare
`git fetch upstream --tags` writes upstream's tags into `refs/tags/` and collides
with our own releases.

## 3. Read what you are about to move

```bash
git log --oneline upstream..main          # our patch commits, in order
git diff --stat upstream..main            # every file we touch
```

That list is the work. Compare it against the ledger; if they disagree, the
ledger is stale and fixing it is part of this upgrade.

Then read upstream's own diff for the files you patch, so you know what is coming
before the rebase tells you:

```bash
git diff refs/upstream/<OLD_TAG>..refs/upstream/<NEW_TAG> -- \
  apps/readest-app/src/utils/access.ts \
  apps/readest-app/src/hooks/useAvailablePlans.ts \
  apps/readest-app/src/app/user/components/PlansComparison.tsx \
  apps/readest-app/src/app/library/components/SettingsMenu.tsx \
  apps/readest-app/src/pages/api/deepl/translate.ts \
  apps/readest-app/.env
```

## 4. Rebase

```bash
git rebase --onto refs/upstream/<NEW_TAG> upstream main
```

`--onto` is what keeps this clean: it replays exactly the commits in
`upstream..main` onto the new base, so the `deploy/` commits and the patch
commits arrive in their original order.

Resolve conflicts against the ledger entry for each patch, not against the patch
text. Each entry has a "when it breaks" line. Two recurring cases:

- **A deleted workflow that upstream edited** (P7) — resolution is always
  `git rm <path>`. Keep it deleted.
- **A UI patch whose surroundings moved** (P4 especially) — do not try to force
  the old hunk in. Re-apply the *intent*: find the upgrade entry, delete it,
  delete whatever becomes unused.

Then move the branch pointer:

```bash
git branch -f upstream refs/upstream/<NEW_TAG>
git rev-parse refs/upstream/<NEW_TAG> > /dev/null && \
  echo "$(git rev-parse refs/upstream/<NEW_TAG>) <NEW_TAG>" > deploy/UPSTREAM
```

Verify the invariant holds again before going further:

```bash
git diff --stat upstream..main
```

Nothing outside `deploy/`, `.github/workflows/`, and the ledger's target files
may appear. If something else shows up, a conflict resolution went wrong.

## 5. Re-verify the assumptions, not just the patches

A rebase that applies cleanly proves nothing about whether upstream *added*
something we need to handle. These four checks are the actual value of this
runbook — run all of them, every time.

### 5a. New plan gates

Upstream adds paywalls as a `*_REQUIRES_PREMIUM` master switch paired with a
`*_PLANS` list. P1 flips the two that existed at `v0.12.1`. Find any new ones:

```bash
grep -rn "REQUIRES_PREMIUM\|_PLANS *:" apps/readest-app/src/utils/access.ts
grep -rn "isEmailInPlan\|isCloudSyncAllowed\|isTTSCacheAllowed\|InPlan(" \
  apps/readest-app/src --include=*.ts --include=*.tsx | grep -v __tests__
```

Any switch not covered by P1 is a new decision. Add it to the ledger.

### 5b. New calls to Readest's own infrastructure

```bash
grep -rn "readest\.com" apps/readest-app/src --include=*.ts --include=*.tsx \
  | grep -v __tests__ | grep -vE "^\s*//|mailto:"
```

Compare against the known set: `download.readest.com` (O1),
`assets.readest.com` (O2), `cdn.readest.com/wordlens` (O3),
`node.readest.com` (handled by `NEXT_PUBLIC_NODE_BASE_URL`),
`storage.readest.com` (handled by `FONT_BASE_URL`), and `web.readest.com`
(share/deeplink defaults). A host outside that set is new — decide what to do
with it before releasing.

### 5c. New baked credentials

```bash
git show refs/upstream/<NEW_TAG>:apps/readest-app/.env
```

P5 blanks six values. If upstream has added a seventh obfuscated default, blank
it too and extend the ledger entry.

### 5d. New upstream workflows

```bash
git ls-tree --name-only refs/upstream/<NEW_TAG>:.github/workflows
```

P7 deletes nine files. Anything new here will run in the fork unless it is also
deleted.

## 6. Prove it still compiles

The rebase proves the patches *apply*. Only a build proves they still *compile* —
`next build` runs the type-checker, which is what catches a stub whose props have
drifted from upstream (P2, P3).

Push the branch and let `selfhost-image.yml` build it, or build locally:

```bash
docker build --target production-stage \
  --build-arg NEXT_PUBLIC_APP_PLATFORM=web -t readest-selfhost-check .
```

Do not publish a release until this passes.

## 7. Publish

```bash
git push --force-with-lease origin main
git push --force origin upstream
```

`--force-with-lease` on `main`, not `--force`: it refuses if the remote moved
under you. `main` is force-pushed on every upgrade by design (ADR-0001).

Then tag and release. Our tag reuses upstream's version number (ADR-0003):

```bash
git tag v<NEW_TAG_VERSION>
git push origin v<NEW_TAG_VERSION>
gh release create v<NEW_TAG_VERSION> --title "..." --notes "..."
```

The release triggers `selfhost-image.yml` and `selfhost-android.yml`. See
`deploy/docs/ci.md`.

## 8. Deploy the server

See `deploy/docs/deployment.md` for detail. The short form:

```bash
docker compose pull
docker compose up -d
docker compose exec db /docker-entrypoint-initdb.d/zz-readest-migrations.sh
```

The migration step is not optional and not automatic. Upstream's first-boot hook
only runs on an empty database volume, so on every upgrade the migrations have to
be applied by hand. The script records what it applied in
`readest_meta.migrations` and skips those next time, so re-running it is safe.

Check `docker/volumes/db/migrations/` in the new release for files that are new
since the last one — that tells you whether this upgrade carries schema changes
at all.

## 9. Ship the APK

See `deploy/docs/android.md`. The APK is built from the same `main` commit and
must be signed with the same keystore as every previous release, or existing
installs cannot upgrade in place.

---

## What "done" means

- [ ] `git diff --stat upstream..main` shows only expected files
- [ ] all four checks in step 5 run, and anything new is recorded in the ledger
- [ ] the image build passes
- [ ] `deploy/UPSTREAM` names the new release
- [ ] every ledger entry's status reflects reality
- [ ] the image and the APK are published from the same commit
- [ ] migrations applied on the server
