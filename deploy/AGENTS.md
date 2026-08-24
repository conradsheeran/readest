# Working in this fork

## What this repository is

`conradsheeran/readest` is a public fork of `readest/readest` (AGPL-3.0). Its
product is a **pure self-hosted Readest**: the official application with its
paywalls, third-party telemetry, and hardcoded calls to Readest's own
infrastructure removed, and with signup restricted to an email allowlist.

Two artifacts ship from it:

1. a **Docker image** serving the web client *and* the mobile backend
2. an **Android APK** built to talk to that server

Publishing the fork publicly is deliberate. Readest is AGPL-3.0; serving a
modified version over a network obliges us to offer the corresponding source to
its users, and a public fork satisfies that by construction.

## Branch layout

| Branch | Contents | How it moves |
| --- | --- | --- |
| `upstream` | The pristine upstream **release** commit that `main` is patched on top of. Never carries a local change. | Reset to the next release commit during an upgrade |
| `main` | `upstream` + every patch + `deploy/`. The default branch — a clone gives you the self-hosted build. | Rebased onto the new `upstream`, then force-pushed |
| `legacy-deploy` | Archive of the pre-fork overlay repo (`conradsheeran/readest-patch`). Reference only; nothing here is live. | Never |

## The invariant

```
git diff upstream..main
```

**is the complete set of changes this fork makes.** If a change does not appear
in that diff, it does not exist as far as this repository is concerned.

Two rules keep it true, and both are load-bearing.

**`upstream` points at a release commit, never at upstream's `main`.** Upstream's
`main` runs ahead of its latest release — 110 commits ahead of `v0.12.1` when
this fork was created. Pointing `upstream` there would file upstream's
unreleased work as *our* changes and destroy the invariant.

**Nothing that matters lives outside git.** A workflow disabled through the
GitHub UI, a variable set only on the server, a database patched by hand: an
agent reading this repository cannot see any of it, so on the next upgrade it
is silently lost. If it matters, it is a file under `deploy/` or a step in a
runbook.

## Upstream tags are not in `refs/tags/`

Our releases reuse upstream's version numbers — our `v0.13.0` means "our build
of upstream v0.13.0" (ADR-0003). `refs/tags/` therefore belongs to us. Upstream's
tags are fetched into a separate namespace:

```
git fetch upstream 'refs/tags/v*:refs/upstream/v*' --no-tags
```

`refs/upstream/v0.12.1` is upstream's tag. `refs/tags/v0.12.1` is our release of
it. They point at different commits, on purpose.

> **Never run `git fetch upstream --tags`.** It writes upstream's tags straight
> into `refs/tags/` and collides with our releases. The namespaced refspec above
> is the only supported way to fetch them.

## Where files go

`deploy/` is the only directory this fork adds. Upstream will not create a
directory by that name, so nothing inside it can conflict during a rebase.

Do **not** put anything in the root `patches/` directory. Upstream already owns
it — those are pnpm dependency patches, consumed by `COPY patches/ ./patches/`
in the root `Dockerfile`. Writing there corrupts the build.

`.github/workflows/` is the one path where namespacing is impossible, because
GitHub requires it. Our workflows are prefixed `selfhost-`; upstream's have been
deleted on `main` (ADR-0001 covers why, and what that costs at rebase time).

## Before you add a patch

The ordering below is not advisory. Every source patch is a tax paid at every
future upgrade; configuration is free.

1. **Deployment configuration** — container environment, a GoTrue hook, a
   database object. Can the change be made here? Then make it here.
2. **Build input** — a value in `.env.local` that `next build` bakes in. Can the
   change be made here? Then make it here.
3. **Source patch** — only when neither of the above can do it. Add the ledger
   entry in the same commit as the patch.

`deploy/docs/patch-ledger.md` records what was decided for every change this
fork makes, including the ones that turned out to need no patch at all. Read it
before concluding that something requires source surgery — several obvious
candidates do not.

## Commit shape

**One patch, one commit.** This is a rule, not a style preference — the rebase
workflow depends on it. `git log upstream..main` has to read as an ordered list of
single-purpose changes, because that list is what a rebase replays and what the
next agent reads to understand the fork. A commit that carries two patches cannot
be reordered, reverted, or dropped independently, and a conflict in one half
blocks the other.

Conventions that follow from that:

- Name the commit after the ledger ID: `patch(P4): remove the upgrade entry from
  the settings menu`.
- Put the ledger status change (`not applied` → `applied`) in the **same commit**
  as the patch. A ledger that disagrees with the diff is worse than no ledger.
- Keep `deploy/` changes in their own commits, separate from patches.
- Never mix a patch with a refactor of the surrounding upstream code. The diff
  against upstream is read on every upgrade; noise in it is paid for repeatedly.

## Document map

| File | Read it when |
| --- | --- |
| `deploy/docs/architecture.md` | You need to know what runs where, and whether a value is baked or runtime. Read before the two below |
| `deploy/docs/patch-ledger.md` | Before writing, changing, or removing any patch. Also lists what needs *no* patch |
| `deploy/docs/upgrade-runbook.md` | Upstream released. This is the procedure |
| `deploy/docs/deployment.md` | Setting up or operating the server, including the signup allowlist and migrations |
| `deploy/docs/android.md` | Building or signing the APK |
| `deploy/docs/ci.md` | Changing the workflows |
| `deploy/docs/known-limitations.md` | Something does not work and you want to know whether that is expected |
| `deploy/docs/adr/` | You are about to reverse a decision, or wondering why something is the way it is |

## Domain vocabulary

`deploy/CONTEXT.md` is the glossary. Use its terms in commit messages, issues,
and documentation. Decisions that were expensive to reach live in
`deploy/docs/adr/`; if you are about to contradict one, say so explicitly rather
than quietly overriding it.
