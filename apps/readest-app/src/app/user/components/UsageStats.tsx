/**
 * Self-hosted stub — see deploy/docs/patch-ledger.md (P10).
 *
 * Upstream's cloud-storage and daily-translation consumption meters on `/user`.
 * With fixed quotas raised to imperceptible ceilings, these meters only surface
 * artificial quota anxiety.
 *
 * The prop is `unknown` on purpose so `app/user/page.tsx` can keep passing
 * `quotas` without this stub re-declaring `QuotaType`.
 */
interface UsageStatsProps {
  quotas?: unknown;
}

const UsageStats: React.FC<UsageStatsProps> = () => null;

export default UsageStats;
