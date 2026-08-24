import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { TTS_CACHE_REQUIRES_PREMIUM, isTTSCacheAllowed, isTTSCacheInPlan } from '@/utils/access';

// P1 (deploy/docs/patch-ledger.md) makes `isSelfHosted()` default to true, which
// would unlock the plan table too. Pin upstream's paywall expectations by
// explicitly disabling self-hosting in this block.
describe('isTTSCacheInPlan', () => {
  beforeEach(() => {
    vi.stubEnv('SELF_HOSTED', 'false');
    vi.stubEnv('NEXT_PUBLIC_SELF_HOSTED', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('any paid plan can use the offline TTS audio cache', () => {
    expect(isTTSCacheInPlan('plus', false)).toBe(true);
    expect(isTTSCacheInPlan('pro', false)).toBe(true);
    // A storage-only buyer reports `purchase` without being entitled.
    expect(isTTSCacheInPlan('purchase', false)).toBe(false);
  });

  test('free plan cannot', () => {
    expect(isTTSCacheInPlan('free', false)).toBe(false);
  });
});

// P1 (deploy/docs/patch-ledger.md) flips the master switch off, so every plan
// — including `free` and a storage-only `purchase` — may download TTS audio.
describe('isTTSCacheAllowed (unlocked by P1)', () => {
  test('every plan can download TTS audio for offline playback', () => {
    expect(TTS_CACHE_REQUIRES_PREMIUM).toBe(false);
    expect(isTTSCacheAllowed('free', false)).toBe(true);
    expect(isTTSCacheAllowed('plus', false)).toBe(true);
    expect(isTTSCacheAllowed('pro', false)).toBe(true);
    expect(isTTSCacheAllowed('purchase', false)).toBe(true);
  });
});

// The customization purchase cannot change an already-unlocked gate.
describe('isTTSCacheAllowed — customization unlock', () => {
  test('the purchase flag no longer changes the result', () => {
    expect(isTTSCacheAllowed('free', true)).toBe(true);
    expect(isTTSCacheAllowed('purchase', true)).toBe(true);
    expect(isTTSCacheAllowed('purchase', false)).toBe(true);
  });
});
