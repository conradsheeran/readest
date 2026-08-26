# Paywall residue — remediation spec

Work order for the second pass at removing upstream's billing surfaces. Verified
against the tree at `8eaedf2d` (upstream `v0.12.1` + patches P1–P9).

Ledger entry **O4** deferred the residual plan wording "until after the first
build". The build exists, so this spec resolves O4 and everything found next to
it.

## Goal

A signed-in user of this deployment should never be shown a plan name, a
consumption meter, a tier badge, or a message that names a paid tier — and
should never hit a limit they can perceive as a limit.

**In scope**: the frontend. What the user reads and clicks.

**Out of scope**: the server-side enforcement in `pages/api/**` and
`app/api/**`. Those routes stay as upstream wrote them; where enforcement is
tight enough to be felt, it is loosened by *configuration* (§T7), not by
patching. The one exception is `utils/access.ts`, which both sides import — a
change there is unavoidably shared, and §T6 takes advantage of that.

---

## How to work this spec

Each task below is self-contained and owns its **source** files exclusively. No
two tasks edit the same file under `apps/`, so all seven can be dispatched in
parallel; see the note below the table for the two documentation files they do
share.

| Task | Ledger | Owns |
| --- | --- | --- |
| T1 | *(correction to P1)* | `src/__tests__/utils/tts-cache-plan-gate.test.ts`, `src/__tests__/components/settings/cloudSync.test.ts` |
| T2 | P10 | `app/user/components/UsageStats.tsx`, `app/library/components/SettingsMenu.tsx` |
| T3 | P11 | `app/user/components/UserInfo.tsx` |
| T4 | P12 | `components/AboutWindow.tsx`, `helpers/updater.ts`, `src/__tests__/helpers/updater.test.ts` |
| T5 | P13, P14 | `components/settings/IntegrationsPanel.tsx`, `app/reader/components/tts/TTSPlayerSheet.tsx`, `src/__tests__/components/tts/TTSPlayerSheet.test.tsx` |
| T6 | P15 | `utils/access.ts`, `deploy/docs/android.md` |
| T7 | *(configuration)* | `deploy/.env.example`, `deploy/compose.yaml` |

Paths are relative to `apps/readest-app/src/` unless they start with `deploy/`.

**Two documentation files are shared and will collide.** Every task appends to
`deploy/docs/patch-ledger.md`, and T3 and T4 both edit
`deploy/docs/known-limitations.md`. Both are append-or-edit-at-the-end, so
parallel agents produce a conflict at the same hunk.

Handle it one of two ways:

- *Serialise the docs.* Agents make only the source change and hand back the
  ledger entry as text; the integrator appends all six in numeric order in one
  commit. Loses the ledger's same-commit guarantee, so do this only if the whole
  set lands together.
- *Serialise the merge.* Agents each write their own entry (preserving the
  same-commit rule) on their own branch, and whoever integrates resolves by
  keeping every entry, ordered P10 → P15. The conflicts are pure additions and
  resolve mechanically.

Prefer the second. `AGENTS.md` makes "register in the same commit that makes the
change" a hard rule, and a mechanical conflict is a cheaper price than breaking
it.

### Rules every task follows

1. **Register the patch in the same commit that makes it.** Add the entry to
   `deploy/docs/patch-ledger.md` Part 2 with `Status: applied`. `AGENTS.md` makes
   this non-negotiable: the ledger and `git diff upstream..main` must never
   disagree.
2. **Locate code by surrounding text, never by line number.** Line numbers in
   this spec are a starting point for a search and will drift.
3. **Do not add or change a user-visible string.** i18next uses the English text
   *as the key*, so editing `_('Some text')` orphans the translation in all 33
   locales and shows English to everyone else. Removing a string is free; the
   orphaned key in `public/locales/*/translation.json` is never looked up and
   costs nothing. Every task below is therefore specified as a deletion. If you
   believe a task needs a new string, stop and raise it instead.
4. **One commit per task**, message `patch(P<n>): <imperative summary>`, matching
   the existing history.

### Verification

Dependencies are not installed in this checkout, so **the test suite has never
been run against the patched tree.** Before anything else:

```
pnpm install
pnpm test -- --run 2>&1 | tee /tmp/baseline.txt
```

**Expect this baseline to be red.** P1 and P9 were both applied without
reconciling the upstream tests that assert the old behaviour — see T1 and T4,
which own that fallout. Keep `baseline.txt`: it is how you tell a pre-existing
failure from one you caused. The counts quoted in T1 and T4 are derived by
reading the assertions, not by running them; treat them as a starting point and
reconcile against what actually fails.

Then, from the repo root, after every task:

```
pnpm lint          # tsgo --noEmit && biome lint
pnpm test -- --run
```

Your task is done when the failures are a subset of `baseline.txt` minus the ones
you were assigned to fix.

A full `pnpm --filter @readest/readest-app build-web` is the last gate before the
set is considered done, but is too slow to run per task.

---

## T1 — Realign the tests P1 invalidated

**Not a new patch.** P1 flipped two master switches but left the tests that
assert their old values. This is pre-existing breakage on `main`, not something
the other tasks introduce.

| File | Failing assertion |
| --- | --- |
| `src/__tests__/utils/tts-cache-plan-gate.test.ts` | `expect(TTS_CACHE_REQUIRES_PREMIUM).toBe(true)` |
| `src/__tests__/components/settings/cloudSync.test.ts` | `expect(CLOUD_SYNC_REQUIRES_PREMIUM).toBe(true)` |

A third file, `src/__tests__/components/tts/TTSPlayerSheet.test.tsx`, is also a
P1 casualty — **T5 owns it**, because T5 changes the same component again. Do not
touch it here.

`src/__tests__/services/sync/cloudSyncProvider.test.ts` mocks `isCloudSyncAllowed`
and is unaffected. `src/__tests__/services/send-address-plan-gate.test.ts` tests
`isEmailInPlan`, which no task changes. Leave both alone.

**Change.** In each of the two files, rewrite the `describe('... (premium
paywall)')` block to assert the fork's behaviour: the master switch is `false`
and `isCloudSyncAllowed` / `isTTSCacheAllowed` return `true` for **every** plan
including `free`. Leave the `isCloudSyncInPlan` / `isTTSCacheInPlan` blocks
untouched — those test the underlying plan lists, which P1 deliberately did not
change, and they still pass.

Add a comment in each rewritten block pointing at `patch-ledger.md` (P1), so the
next reader knows the assertion is fork-specific and why.

**Ledger.** No new entry. Append to P1's entry:

> - **Tests**: `tts-cache-plan-gate.test.ts` and `cloudSync.test.ts` assert the
>   switches are off; `TTSPlayerSheet.test.tsx` asserts the free-user row is
>   unbadged. On rebase, upstream's versions assert the opposite — take ours.

**Why it matters beyond a green suite.** On the next upgrade these files
conflict. Whoever resolves that needs to know which side is correct; right now
nothing records it.

---

## T2 — P10: Remove the consumption meters

**Symptom.** Two surfaces show "Cloud Sync Storage 12.4 / 1024 MB" and
"Translation Characters 3 / 48 K" with a coloured progress bar, a "% used"
figure, and a "Resets in 5 hr 12 min" countdown:

- `/user`, under the avatar block
- the library dropdown → the logged-in submenu, above **Account**

Both render `components/Quota.tsx`. **Do not modify `Quota.tsx`.** Removing its
two call sites is the smaller patch, keeps `src/__tests__/components/Quota.test.tsx`
green, and adds no delete/modify conflict on a file upstream still edits.

**Change 1 — `app/user/components/UsageStats.tsx`.** Reduce to a component that
returns `null`, in the shape P3 established for `PlansComparison.tsx`: keep the
props interface but type the prop as `unknown`, so the untouched call site in
`app/user/page.tsx` keeps compiling when upstream changes `QuotaType`.

Stubbing here rather than editing `page.tsx` is deliberate and matches P2/P3 —
`page.tsx` is actively developed upstream and every line we touch there is paid
for again at every upgrade.

**Change 2 — `app/library/components/SettingsMenu.tsx`.** Remove the quota row
from the account submenu — the whole `readestEnabled ? (...) : null` conditional
whose body is a `<button onClick={handleUserProfile}>` wrapping `<Quota …>`.
Then remove what that leaves unused — the `Quota` import, the `useQuotaStats`
import, and its `const { quotas } = useQuotaStats(true);` call. `biome lint` will
name anything you miss.

**Keep `isReadestCloudEnabled` and `readestEnabled`.** The removed conditional is
not their only reader: `readestEnabled` also selects the `'readest'` entry in
`providers` and guards `nativeLastSyncedAt`, both feeding the sync row's label.
Deleting it would break "Synced {{time}}".

Leave the **Account** menu item and the sync row alone.

**Ledger.** New entry P10, following the established field order (Target /
Change / Effect / Why not configuration / Conflict risk / When it breaks /
Status). Record that `SettingsMenu.tsx` is now touched by both P4 and P10, and
carry over P4's conflict-risk note: **high**, an actively developed UI file,
re-apply by intent rather than by patch text.

---

## T3 — P11: Remove the plan name from the profile page

**Symptom.** `/user` renders a grey pill reading **Free Plan** (免费套餐) under
the user's email. This is ledger **O4**.

**Change — `app/user/components/UserInfo.tsx`.** Delete the `<div className='mt-3'>`
block containing the `<span>` that renders `planDetails.color` and
`_(planDetails.name)`. Keep the avatar, name, and email.

Keep the `planDetails` prop in the interface, unread. `app/user/page.tsx` still
computes and passes it, and this task does not touch `page.tsx` — same reasoning
as T2. Mark the prop with a short comment saying it is accepted and ignored, so
it does not read as an oversight.

Consequently `app/user/utils/plan.ts` and its test stay as they are: `page.tsx`
still calls `getPlanDetails`, so nothing there goes dead and
`src/__tests__/app/user/plan.test.ts` stays green. Do not delete either.

**Ledger.** New entry P11. Mark **O4 as resolved** in Part 3, pointing at P11.
Also update the "Everyone is on the `free` plan" section of
`deploy/docs/known-limitations.md`, whose last sentence still claims `UserInfo`
renders a plan name.

---

## T4 — P12: Retire the update-check UI

P9 made `checkForAppUpdates` a no-op, but left both entry points and a second,
separate path that still reaches Readest's servers.

**Symptom 1 — the About dialog.** "About Readest" shows a **Check Update**
button. In a Tauri build it now always answers "Already the latest version" — a
check that does not check. In a web build `appService?.hasUpdater` is false, so
the button calls `handleShowRecentUpdates` instead, which is not stubbed: it
fetches `https://download.readest.com/releases/release-notes.json` and opens the
**official** Readest changelog in the updater dialog.

**Symptom 2 — startup.** `app/library/page.tsx` and `app/reader/page.tsx` both
call `checkAppReleaseNotes()` on mount. It fires the same request whenever the
installed version is newer than the last one whose notes were shown — so the
first launch after any version bump pops "What's New in Readest" full of
upstream's release notes.

**Change 1 — `helpers/updater.ts`.** Make `checkAppReleaseNotes` a no-op
returning `false`, in the same shape and with the same kind of comment block P9
used for `checkForAppUpdates` directly above it. Keep the signature: three call
sites destructure nothing but do check the boolean.

Keep `setLastShownReleaseNotesVersion` / `getLastShownReleaseNotesVersion` —
`UpdaterWindow.tsx` imports the setter.

Stubbing it orphans exactly five imports, each of which has no other reader in
the file: `semver`, `isTauriAppPlatform`, `READEST_CHANGELOG_FILE`,
`setUpdaterWindowVisible`, and `getAppVersion`. Remove all five. `isUpdateNewer`,
`READEST_UPDATER_FILE`, and `READEST_NIGHTLY_UPDATER_FILE` are still used by
`resolveNightlyUpdate` / `fetchManifest` and must stay.

**Change 2 — `components/AboutWindow.tsx`.** Delete the `<div className='my-1 h-5'>`
block: the **Check Update** button and all four `updateStatus` branches. Then
remove what that orphans — the `updateStatus` state, `handleCheckUpdate`,
`handleShowRecentUpdates`, the `checkForAppUpdates` / `checkAppReleaseNotes`
imports, the `useSettingsStore` import if `settings` has no other reader, and the
`UpdateStatus` type. `handleClose` must stay but loses its `setUpdateStatus(null)`
line.

Keep the logo, the version string, and its copy-to-clipboard behaviour —
`src/__tests__/components/AboutWindow.test.tsx` covers exactly that and must stay
green. It mocks `@/helpers/updater` wholesale, so it is indifferent to Change 1.

Leave `UpdaterWindow.tsx`, `UpdaterContent`, and `app/updater/page.tsx` in place.
They become unreachable, which P9 already accepted; deleting them would add
conflict surface for no user-visible gain. Likewise keep `resolveNightlyUpdate`
and `getNightlyPlatformKey` in `updater.ts` — production-dead since P9, but their
tests inject a fake `fetchFn` and stay green, so they cost nothing.

**Change 3 — `src/__tests__/helpers/updater.test.ts`. This is the largest piece
of this task, and most of it is P9's unreconciled fallout, not yours.**

The file has roughly 26 cases across two `describe` blocks:

- `describe('checkForAppUpdates')` — ~20 cases written against the real
  implementation. P9 replaced it with `async () => false`. Cases asserting
  `result === false` still pass by luck; every case asserting that `mockCheck`
  was called, that the updater window opened, or that a failure *rejects*
  (`'Android fetch failure throws error'`) cannot pass against a stub.
- `describe('checkAppReleaseNotes')` — ~6 cases, which Change 1 invalidates the
  same way.

Do not try to keep these passing by weakening the stubs. Replace both blocks with
a small set of cases asserting what the fork actually guarantees:

- `checkForAppUpdates` resolves `false` for every channel and platform, and
  never calls the Tauri updater or `fetch`.
- `checkAppReleaseNotes` resolves `false` and never requests
  `READEST_CHANGELOG_FILE`.

That is the property worth protecting — **no request reaches
`download.readest.com`** — and it is what a future upgrade must not silently
undo. Assert the negative (`expect(mockTauriFetch).not.toHaveBeenCalled()`)
explicitly; a test that only checks the return value would still pass if someone
restored the fetch and discarded its result.

Keep the `describe('release notes version tracking')` and
`describe('getNightlyPlatformKey')` / `describe('resolveNightlyUpdate')` blocks
as they are — none of them touch the stubbed functions.

**Also update P9's ledger entry** to record this test reconciliation, in the same
form T1 adds to P1's.

**Ledger.** New entry P12, cross-referenced from P9 as its completion. Update
the "The in-app updater offers official builds" section of
`known-limitations.md`, which currently describes the un-neutered behaviour.

---

## T5 — P13 + P14: Integrations panel and the offline-audio row

Two ledger entries, one agent, because P13 and P14 both edit
`IntegrationsPanel.tsx`.

### P13 — Hide the Send-to-Readest email row

**Symptom.** Settings → Integrations → **Send to Readest** opens a card reading
*"Email books straight to your library / Forward attachments and articles to your
private Readest address. Available on the Plus, Pro, and Lifetime plans."* with a
**View plans** button routing to `/user`.

`EMAIL_IN_PLANS` in `utils/access.ts` has no master switch, so P1 never reached
it.

**Do not open this gate.** `known-limitations.md` already records why:
personal-address email-in depends on inbound email for `readest.com` and a
Cloudflare Worker that neither exists here nor can. Opening the gate would
replace a paywall card with a form that silently fails — worse, not better.

**Change — `components/settings/IntegrationsPanel.tsx`.** Remove the
`<IntegrationRow>` whose title is `_('Send to Readest')` and status is
`_('Email books to your library')`, near the OPDS Catalogs row. That is the only
navigation into the paywall: nothing else calls `setSubPage('send')`, and the
only writer of `requestedSubPage` is `app/opds/utils/opdsClose.ts`, which sets it
to `'opds'`.

Leave the now-unreachable `if (subPage === 'send')` branch, the `'send'` member
of the `SubPage` union, and `SendToReadestForm.tsx` in place. Removing them is a
larger patch across three files with no user-visible gain, and the union member
is load-bearing for the deep-link `useEffect`'s type-narrowing.

Do not touch `SendToReadestForm.tsx`, `pages/api/send/*.ts`, `EMAIL_IN_PLANS`, or
`src/__tests__/services/send-address-plan-gate.test.ts` — all stay green and
untouched.

The other Send channels — the in-app `/send` page, the mobile share sheet, the
browser extension — are unaffected and remain available.

### P14 — Stop badging open features as Premium

**Symptom.** Both surfaces below compute their badge as
`!user || (userProfilePlan !== undefined && !is…Allowed) ? _('Premium') : undefined`.
P1 made the second disjunct permanently false, but the **first one is
independent of the master switch**: a signed-out user still sees a **Premium**
(高级版) chip on features that are, in fact, open.

- `components/settings/IntegrationsPanel.tsx` — Google Drive, WebDAV, S3,
  OneDrive, iCloud rows
- `app/reader/components/tts/TTSPlayerSheet.tsx` — the **Offline Audio** row

**Change 1 — `IntegrationsPanel.tsx`.** Replace the `premiumBadge` computation
with `undefined`, keeping the binding so the five `badge={premiumBadge}` props
need no edit. Update the stale comment above it — it still describes the badge
as temporary while "the feature stabilises". Leave `isCloudSyncPremium` and its
`onOpen` ternaries alone; the predicate is already permanently `true`, so the
ternaries always take the open branch, and rewriting them would enlarge the
patch for no behaviour change.

**Change 2 — `TTSPlayerSheet.tsx`.** Same treatment for its `premiumBadge`. Then
fix `handleOpenDownloads`, which is *not* purely cosmetic: its `else if (user)` /
`else` arms route a signed-out user to `/auth`. The offline-audio cache is local,
so there is nothing to sign in for — reduce the handler to `setView('chapters')`.
Remove whatever that orphans (`navigateToProfile` / `navigateToLogin` imports,
`router`, `user`, `useQuotaStats`) only if `biome lint` reports it unused.

Note that `premiumBadge` also selects the row's subtitle — with it always
`undefined`, the row reads "{{done}} of {{total}} downloaded" for everyone, which
is correct.

**Change 3 — `src/__tests__/components/tts/TTSPlayerSheet.test.tsx`.** Two cases
encode the old gate and must be rewritten to the fork's behaviour; the tests do
not mock `@/utils/access`, so they exercise the real predicate:

- *"offline audio row: a free user sees a Premium badge and is routed to upgrade"*
  — **currently failing** (P1 casualty). A free user now sees no badge and opens
  the chapters view.
- *"offline audio row: a signed-out user is routed to sign-in"* — currently
  passing, will fail after Change 2. A signed-out user now opens the chapters
  view too.

Keep the premium-user case as-is; it already asserts the target behaviour.

**Ledger.** Two entries, P13 and P14. P14's should note that its shape —
neutralising a `!user ||` disjunct that a master switch cannot reach — is the
lesson: P1's switches are necessary but not sufficient, and a future gate wearing
the same pattern needs the same second look.

---

## T6 — P15: Make the fixed quotas reachable in Tauri builds

**This is the only task here that removes a real limit rather than a mention of
one, and it is the only Android-specific one.**

**Symptom.** On Android the deployment's configured quotas do not apply. Storage
falls back to 500 MB and translation to 10 240 characters/day — upstream's
free-plan defaults — regardless of what the server is set to. Uploads then fail
with "云存储空间不足" and translation dies after a few pages.

**Why.** `utils/access.ts` resolves both quotas as:

```ts
runtimeConfig?.storageFixedQuota ?? parseInt(process.env['STORAGE_FIXED_QUOTA'] ?? '0')
```

`getRuntimeConfig()` reads `window.__READEST_RUNTIME_CONFIG`, injected by the
server route `app/runtime-config.js/route.ts`. A Tauri build has no server, so it
is `undefined`. The fallback then reads `STORAGE_FIXED_QUOTA`, which has no
`NEXT_PUBLIC_` prefix and so is never inlined into the client bundle. Both terms
miss, `fixedQuota` is `0`, and `getStoragePlanData` falls through to
`DEFAULT_STORAGE_QUOTA['free']`.

This is exactly the failure P8 fixed for `OBJECT_STORAGE_TYPE`, in the same file
family. Note that `services/runtimeConfig.ts::getServerRuntimeConfig` *already*
reads the `NEXT_PUBLIC_` forms — but that function only ever runs on the server,
so it does not help the APK.

`deploy/docs/android.md` currently instructs the builder to set
`NEXT_PUBLIC_STORAGE_FIXED_QUOTA` and `NEXT_PUBLIC_TRANSLATION_FIXED_QUOTA`.
Nothing on the client path reads either. The documentation is describing a
mechanism that does not exist.

**Change — `utils/access.ts`.** Extend the fallback chain in both
`getStoragePlanData` and `getTranslationQuota` to try the `NEXT_PUBLIC_` form
before defaulting, mirroring P8's edit to `getStorageType()` exactly. Both must
stay literal `process.env['NEXT_PUBLIC_…']` member expressions — Next inlines
these by static text match, so a computed key or a destructured `process.env`
silently yields `undefined`.

Web is unaffected: `getRuntimeConfig()` still wins, and it is populated there.

**Also update `deploy/docs/android.md`** — annotate the two variables the way the
file already annotates `NEXT_PUBLIC_OBJECT_STORAGE_TYPE`: *"Required by patch
P15 — without the patch this value is not read at all."*

**Ledger.** New entry P15. Conflict risk **low** (two expressions in a stable
file), same as P8, and it should cross-reference P8 as the same defect class.

---

## T7 — Configuration: raise the quota ceilings

Not a patch. `deploy/` is ours.

The client's DeepL path enforces the daily translation quota server-side in
`pages/api/deepl/translate.ts::checkDailyUsage`, and that check runs *before* the
provider call — including on the self-hosted DeepLX path P6 added. The current
values are modest enough to be felt:

| Variable | Current | Meaning |
| --- | --- | --- |
| `STORAGE_FIXED_QUOTA` | `1073741824` | 1 GB of cloud library |
| `TRANSLATION_FIXED_QUOTA` | `50000` | 50 000 characters/day |

**Change.** Raise both defaults in `deploy/.env.example` and the `:-` fallbacks
in `deploy/compose.yaml`. Pick values with headroom for the deployment's actual
disk — a quota that cannot be reached in practice is what makes the limit
imperceptible, which is the whole objective.

Keep them finite. `0` is falsy in `parseInt(…) || DEFAULT_…`, so zero does not
mean unlimited — it means *fall back to the free-plan table*, the exact bug T6
fixes. A large number is the only way to express "no limit" here.

Whatever you choose, the same values must be baked into the Android build as
`NEXT_PUBLIC_STORAGE_FIXED_QUOTA` / `NEXT_PUBLIC_TRANSLATION_FIXED_QUOTA` — which
only takes effect once T6 lands. `android.md` already says "same as the server";
leave that wording.

---

## Accepted residue — do not "fix" these

Each was found in this pass and deliberately left. Listed so the next sweep does
not spend an afternoon rediscovering the reasoning.

| Residue | Why it stays |
| --- | --- |
| The payment handlers in `app/user/page.tsx` (`handleStripeSubscribe`, `handleIAPSubscribe`, `handleIAPRestorePurchase`, `handleManageSubscription`) and their `libs/payment/**` imports | Unreachable. `availablePlans` is `[]` (P2), so nothing can invoke checkout; "Restore Purchase" needs `iapAvailable` (false), "Manage Subscription" needs `userPlan !== 'free'` (never). Deleting them means a large edit to the most actively developed file on the profile page — the cost P2 and P3 were shaped to avoid. |
| `PlanCard.tsx`, `PlanActionButton.tsx`, `PlanNavigation.tsx`, `PlanIndicators.tsx`, `PurchaseCallToActions.tsx`, `Checkout.tsx` | Reachable only through `PlansComparison`, which P3 stubbed to `null`. Dead, and dead code costs nothing at runtime. |
| `app/user/subscription/success/page.tsx` ("Subscription Successful!") | A route with no link into it; reachable only by typing the URL. Delete it if you want, but it buys nothing. |
| `_('Paused — plan required')` in `components/settings/integrations/cloudSyncStatus.ts` | Unreachable: `paused` requires `!isCloudSyncAllowed(plan)`, permanently false since P1. |
| `_('Insufficient storage quota')` in `services/transferManager.ts` | A truthful error for a real server rejection. With T7's ceilings it should never fire; if it does, the user needs to know why the upload failed. |
| `_('Quota Exceeded')` on the translator dropdown label | Same: reflects a live 429 from the provider, not a plan. |
| `_('Manage your plan and stored files')` under Integrations → Readest Cloud | Says "plan", but changing it means a new i18n key and English text in 33 locales (§rule 3). Not worth it for one sub-page subtitle. |
| `aria-label={_('View account details and quota')}` in `SettingsMenu.tsx` | Screen-reader only, same i18n cost. |
| The `'Daily translation quota reached. Upgrade your plan…'` toast in `hooks/useTranslator.ts` | **Judgement call — flagged, not assigned.** The toast fires on `DAILY_QUOTA_EXCEEDED` and then silently falls back to the Azure provider, so translation continues either way. Deleting the `eventDispatcher.dispatch` while keeping `setSelectedProvider('azure')` removes the only remaining "upgrade your plan" sentence in the running app at the cost of a silent provider switch, and needs no new string. Recommended, but it changes behaviour the user can notice, so decide before assigning it. |
| Branding: "© Bilingify LLC", the `readest/readest` GitHub link, `SupportLinks` (official Discord/Reddit), `LegalLinks` (`readest.com/terms-of-service`, `/privacy-policy`), "Download Readest" → `readest.com?utm_source=readest_web` | Attribution, not paywall — and the AGPL v3 notice in the About dialog is a licence obligation, not residue. Out of scope for this spec. If the goal ever extends to de-branding, that is a separate spec with a different rationale. |

---

## Post-conditions

When T1–T7 are applied, a signed-in user of this deployment sees:

- `/user`: avatar, name, email, and the account action buttons. No plan pill, no
  meters, no comparison carousel.
- The library dropdown: transfers, sync status, **Account**. No meters.
- About Readest: logo, version, licence, links. No update check.
- Settings → Integrations: five cloud providers with no tier chips, and no
  Send-to-Readest row.
- The reader's Read Aloud sheet: **Offline Audio** opening directly, unbadged,
  signed in or not.
- On Android: the same storage and translation ceilings the server is configured
  with.

The remaining word "plan" anywhere in the running UI is the Readest Cloud
sub-page subtitle, and the only remaining meter is the storage figure inside
**Manage Storage**, which reports real usage against the configured quota and is
the one place a user might legitimately want it.
