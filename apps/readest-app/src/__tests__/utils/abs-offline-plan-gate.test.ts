import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  ABS_OFFLINE_REQUIRES_PREMIUM,
  isAbsOfflineAllowed,
  isAbsOfflineInPlan,
} from '@/utils/access';

// P1 (deploy/docs/patch-ledger.md) makes `isSelfHosted()` default to true, which
// would unlock the plan table too. Pin upstream's paywall expectations by
// explicitly disabling self-hosting in this block.
describe('isAbsOfflineInPlan', () => {
  beforeEach(() => {
    vi.stubEnv('SELF_HOSTED', 'false');
    vi.stubEnv('NEXT_PUBLIC_SELF_HOSTED', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('any paid plan can download Audiobookshelf books for offline use', () => {
    expect(isAbsOfflineInPlan('plus', false)).toBe(true);
    expect(isAbsOfflineInPlan('pro', false)).toBe(true);
    // A storage-only buyer reports `purchase` without being entitled.
    expect(isAbsOfflineInPlan('purchase', false)).toBe(false);
  });

  test('free plan cannot', () => {
    expect(isAbsOfflineInPlan('free', false)).toBe(false);
  });
});

// P1 (deploy/docs/patch-ledger.md) flips the master switch off, so every plan
// — including `free` and a storage-only `purchase` — may download offline.
describe('isAbsOfflineAllowed (unlocked by P1)', () => {
  test('every plan can download Audiobookshelf books for offline use', () => {
    expect(ABS_OFFLINE_REQUIRES_PREMIUM).toBe(false);
    expect(isAbsOfflineAllowed('free', false)).toBe(true);
    expect(isAbsOfflineAllowed('plus', false)).toBe(true);
    expect(isAbsOfflineAllowed('pro', false)).toBe(true);
    expect(isAbsOfflineAllowed('purchase', false)).toBe(true);
  });

  test('the purchase flag no longer changes the result', () => {
    expect(isAbsOfflineAllowed('free', true)).toBe(true);
  });
});
