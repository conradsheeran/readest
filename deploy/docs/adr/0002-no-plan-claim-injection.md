# Leave every user on the `free` plan

Every upstream paywall reads the `plan` claim in the access token, so the obvious
move is to have self-hosted GoTrue issue `plan: 'pro'` and open all of them at
once — with no source patch, and immune to upstream refactoring the individual
gates. We do not do that: the paywalls are opened by flipping their master
switches in `utils/access.ts` instead, and plans stay `free`.

The reason is that injecting a paid plan *reveals* UI as well as unlocking
features. The "Manage Subscription" button in `AccountActions.tsx` is shown when
`userPlan !== 'free'`, so a `pro` claim makes it appear — and it calls a Stripe
endpoint that cannot work in a self-hosted deployment. Against the goal of a
clean interface, injecting the claim costs more than it saves: it removes one
patch (the upgrade entry in the settings menu, which self-hides for paid plans)
and adds two (hiding the subscription button and the plan name).

This is a deliberate exception to this project's general rule that configuration
beats source patches. The rule still holds; here the configuration mechanism
happens to carry a side effect worse than the patches it avoids.

## Consequences

Upstream can add a new paywall that we do not notice, because nothing opens gates
generically any more. The upgrade runbook therefore carries a mandatory grep for
new `*_REQUIRES_PREMIUM` switches and `*_PLANS` lists. Upstream's pattern has been
consistent enough that this is reliable, but it is a check that must actually be
run — if upstream abandons the master-switch pattern, this decision should be
revisited rather than patched around.
