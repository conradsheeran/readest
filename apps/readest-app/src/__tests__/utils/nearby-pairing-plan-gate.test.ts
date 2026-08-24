import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  NEARBY_PAIRING_REQUIRES_PREMIUM,
  isNearbyPairingAllowed,
  isNearbyPairingInPlan,
} from '@/utils/access';

// P1 (deploy/docs/patch-ledger.md) makes `isSelfHosted()` default to true, which
// would unlock the plan table too. Pin upstream's paywall expectations by
// explicitly disabling self-hosting in this block.
describe('isNearbyPairingInPlan', () => {
  beforeEach(() => {
    vi.stubEnv('SELF_HOSTED', 'false');
    vi.stubEnv('NEXT_PUBLIC_SELF_HOSTED', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('any paid plan can pair Nearby BookDrop devices', () => {
    expect(isNearbyPairingInPlan('plus', false)).toBe(true);
    expect(isNearbyPairingInPlan('pro', false)).toBe(true);
    // A storage-only buyer reports `purchase` without being entitled.
    expect(isNearbyPairingInPlan('purchase', false)).toBe(false);
  });

  test('free plan cannot', () => {
    expect(isNearbyPairingInPlan('free', false)).toBe(false);
  });
});

// P1 (deploy/docs/patch-ledger.md) flips the master switch off, so every plan
// — including `free` and a storage-only `purchase` — may pair devices.
describe('isNearbyPairingAllowed (unlocked by P1)', () => {
  test('every plan can pair Nearby BookDrop devices', () => {
    expect(NEARBY_PAIRING_REQUIRES_PREMIUM).toBe(false);
    expect(isNearbyPairingAllowed('free', false)).toBe(true);
    expect(isNearbyPairingAllowed('plus', false)).toBe(true);
    expect(isNearbyPairingAllowed('pro', false)).toBe(true);
    expect(isNearbyPairingAllowed('purchase', false)).toBe(true);
  });

  test('the purchase flag no longer changes the result', () => {
    expect(isNearbyPairingAllowed('free', true)).toBe(true);
    expect(isNearbyPairingAllowed('purchase', true)).toBe(true);
  });
});
