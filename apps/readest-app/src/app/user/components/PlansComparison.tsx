/**
 * Self-hosted stub — see deploy/docs/patch-ledger.md (P3).
 *
 * Upstream's four-plan comparison carousel. `app/user/page.tsx` renders it
 * unconditionally — it does not check the user's plan — so without this it is
 * visible on every self-hosted deployment, offering subscriptions that cannot
 * be bought here.
 *
 * The props are `unknown` on purpose: the call site keeps passing all three, and
 * a stub that does not read them should not also re-declare upstream's types and
 * break whenever those move.
 */
interface PlansComparisonProps {
  availablePlans?: unknown;
  userPlan?: unknown;
  onSubscribe?: unknown;
}

const PlansComparison: React.FC<PlansComparisonProps> = () => null;

export default PlansComparison;
