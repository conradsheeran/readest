# Releases reuse upstream's version numbers

A selfhost release is named after the upstream release it is built on: our
`v0.13.0` is our build of upstream's `v0.13.0`. This makes "which upstream version
am I running?" answerable from an image tag or an APK filename, which is the
question that actually gets asked in operations.

It works only because this fork was created without upstream's tags — GitHub did
not copy them, so `refs/tags/` was empty and is ours. Upstream's tags are fetched
into a separate namespace instead:

```
git fetch upstream 'refs/tags/v*:refs/upstream/v*' --no-tags
```

## Considered options

**`v0.13.0-selfhost.1`** would distinguish our releases from upstream's and allow
a second patch round on the same upstream version. Rejected as noise for a
single-operator deployment; if a second build of the same upstream release is ever
needed, the immutable `<version>-<sha7>` image tag already identifies it.

**Prefixing the git tag** (`selfhost/v0.13.0`) was the safe answer before we
confirmed the fork had no tags. Unnecessary once that was verified.

## Consequences

`refs/tags/v0.12.1` and `refs/upstream/v0.12.1` are different commits, on
purpose, and a reader who assumes otherwise will be confused. `deploy/UPSTREAM`
records the current patch base explicitly for that reason.

The fragile part is the fetch discipline: a single `git fetch upstream --tags`
writes upstream's tags into `refs/tags/` and collides with our releases. This is
documented in `deploy/AGENTS.md` and in the runbook, but it is enforced by
convention alone.
