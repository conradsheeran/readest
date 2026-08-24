# Context

Glossary for this fork. Use these terms; avoid the synonyms listed as rejected.

## Upstream release

A tagged, stable release of `readest/readest` (`v0.12.1`, `v0.13.0`, …). The
only thing this fork ever patches against. Upstream's `main` branch is **not** an
upstream release and is never a patch base.

Rejected: "upstream version" when a specific tag is meant.

## Patch base

The single upstream release commit that the current `main` is built on. Recorded
in `deploy/UPSTREAM` and pointed at by the `upstream` branch. There is exactly
one at any time.

## Patch

A change this fork makes to upstream source. Every patch is registered in the
patch ledger with its reason and its failure mode. A change to a file under
`deploy/` is **not** a patch — that directory is ours.

Rejected: "modification", "customization" — they blur the distinction between
"we changed upstream's file" and "we added our own file", which is precisely the
distinction that determines rebase cost.

## Patch ledger

`deploy/docs/patch-ledger.md`. The record of every patch: what it changes, why
configuration could not do it, and what happens when upstream moves the ground
under it. The ledger is the authority on what this fork does to upstream source;
the diff is the authority on what it currently *does*.

## Selfhost release

A release published from this fork, named after the upstream release it is built
on (`v0.13.0` here is our build of upstream's `v0.13.0`). Produces a Docker image
and an Android APK.

Rejected: "our version", "patched release".

## Deployment stack

The set of containers that make a running Readest: the **client** (web UI and
mobile backend in one Next.js server), plus Postgres, Kong, GoTrue and PostgREST.
Only the client image is built by this fork; the rest are upstream vendors'
images.

Rejected: "the server" — ambiguous between the client container and the stack.

## Baked configuration

A value fixed into the JavaScript bundle when `next build` runs, via a
`NEXT_PUBLIC_*` environment variable. It cannot be changed after the build. The
Android APK is configured entirely this way.

## Runtime configuration

A value the client container reads from its environment at request time and
injects into the page as `window.__READEST_RUNTIME_CONFIG`. It takes precedence
over baked configuration. The web deployment is configured this way, which is
why one generic image serves any site.

## Plan claim

The `plan` field in a user's access token, which upstream's paywalls read. A
self-hosted GoTrue does not issue it, so every self-hosted user is `free`. This
fork deliberately leaves it that way (ADR-0002).

## Plan gate

An upstream check that makes a feature conditional on the plan claim. Upstream
writes them as a `*_REQUIRES_PREMIUM` master switch paired with a `*_PLANS` list
(`apps/readest-app/src/utils/access.ts`). Opening a gate means flipping its
master switch, not changing the plan claim.

## Email allowlist

The set of email addresses permitted to register. Enforced in GoTrue's
`before_user_created` hook, in the database — never in the client, which a user
controls.
