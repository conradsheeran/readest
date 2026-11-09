import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import PlansComparison from '@/app/user/components/PlansComparison';
import UsageStats from '@/app/user/components/UsageStats';

afterEach(cleanup);

// P3 (deploy/docs/patch-ledger.md): the stub removes the plan comparison
// carousel from the profile page, so it must render nothing even with the full
// set of props the v0.12.20 call site passes.
describe('PlansComparison', () => {
  it('renders nothing', () => {
    const { container } = render(
      <PlansComparison
        availablePlans={[]}
        userPlan='free'
        customizationPurchased={false}
        onSubscribe={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});

// P10 (deploy/docs/patch-ledger.md): the stub removes the cloud-storage and
// translation consumption meters from the profile page, so it must render
// nothing even with the quotas the v0.12.20 call site passes.
describe('UsageStats', () => {
  it('renders nothing', () => {
    const { container } = render(
      <UsageStats
        quotas={[
          {
            name: 'Cloud Sync Storage',
            tooltip: '',
            used: 12.4,
            total: 1024,
            unit: 'MB',
          },
        ]}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
