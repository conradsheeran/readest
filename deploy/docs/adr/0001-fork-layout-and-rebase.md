# Fork with `main` patched, rebased onto each upstream release

The pre-fork approach applied patches with a Python script that held whole
upstream files as string constants; it could not survive the larger changes this
project needs, and its patches were unreviewable as diffs. So this repository is
a real fork: `upstream` holds the pristine upstream release commit, `main` holds
that plus our patches and `deploy/`, and each upstream release is absorbed by
`git rebase --onto` rather than by re-running a script.

## Considered options

**Merge instead of rebase.** Merging upstream into `main` avoids force-pushing
and records each conflict resolution permanently. Rejected because it destroys
the property that makes this maintainable for an agent-driven workflow: after a
rebase, `git log upstream..main` is a short ordered list of single-purpose patch
commits — exactly the artifact an agent needs to understand and replay. A merge
history answers "what did we change?" only through a diff.

**Keep the overlay script.** Rejected: git's three-way merge and `rerere` are the
only mechanisms that scale to a large patch set against a moving upstream, and a
string-constant overlay rots silently whenever upstream touches a patched file.

## Consequences

`main` is force-pushed on every upgrade, so a stale clone must reset rather than
pull. Old release tags keep their commits reachable, so previous releases stay
reproducible. `rerere` must be enabled per clone or the same conflicts are
re-resolved by hand every time.

Two follow-on decisions belong to this one. Upstream's nine workflows are
**deleted** on `main` rather than disabled in the GitHub UI, because UI state is
invisible to an agent reading the repository and is silently bypassed when an
upstream release adds a workflow — at the cost of a mechanical delete/modify
conflict whenever upstream edits one. And schema migrations went back to
upstream's `readest_meta.migrations` ledger, because the pre-fork stack's
parallel ledger had no executor left once its script was deleted, and two
ledgers is the worst possible state during an upgrade.
