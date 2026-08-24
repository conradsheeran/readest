import type { AvailablePlan } from '@/types/quota';

interface UseAvailablePlansParams {
  hasIAP: boolean;
  onError?: (message: string) => void;
}

/**
 * Self-hosted stub — see deploy/docs/patch-ledger.md (P2).
 *
 * Upstream fetches Stripe plans, or probes Google Play IAP, on every mount of
 * the profile page. Neither exists in a self-hosted deployment: `/api/stripe/plans`
 * has no Stripe key and answers 500, whose failure path dispatches a
 * "Failed to load subscription plans." toast.
 *
 * The parameter and return shapes match upstream so `app/user/page.tsx` needs no
 * change. `iapAvailable: false` is load-bearing: it is what keeps the
 * "Restore Purchase" button hidden.
 */
export const useAvailablePlans = (_params: UseAvailablePlansParams) => {
  const availablePlans: AvailablePlan[] = [];
  const error: Error | null = null;
  return { availablePlans, iapAvailable: false, loading: false, error };
};
