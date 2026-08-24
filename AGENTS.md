# Agent Instructions

This repository is a **fork of `readest/readest`**, patched into a pure
self-hosted deployment of Readest. It is not upstream.

Before changing anything, read **`deploy/AGENTS.md`**. It defines the branch
layout, the single invariant you must not break, and the rule for deciding
whether a change belongs in configuration or in a source patch.

| Question | Where the answer is |
| --- | --- |
| What does this fork actually change? | `git diff upstream..main` — and nothing else |
| Where may I add files? | `deploy/` only |
| Which upstream release is `main` built on? | `deploy/UPSTREAM` |
| Why does a given patch exist? | `deploy/docs/patch-ledger.md` |
| Upstream just released. Now what? | `deploy/docs/upgrade-runbook.md` |
| What is broken when self-hosting? | `deploy/docs/known-limitations.md` |

Everything outside `deploy/` is upstream source. Change it only through a patch
registered in the ledger, and register it in the same commit that makes the
change.
