import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import PlansComparison from '@/app/user/components/PlansComparison';

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
