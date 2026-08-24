import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTTSQuota, isTTSInPlan, isVoiceTierInPlan, TTS_PLANS } from '@/utils/access';

// P1 (deploy/docs/patch-ledger.md) makes isSelfHosted() default to true, so
// Readest Voice is unlocked even if a voice catalog is present or cached.
describe('TTS plan gating (self-hosted default)', () => {
  it('unlocks every plan and voice tier by default', () => {
    expect(isTTSInPlan('free')).toBe(true);
    expect(isVoiceTierInPlan('pro', 'free')).toBe(true);
  });
});

describe('TTS plan gating (self-hosting explicitly disabled)', () => {
  beforeEach(() => {
    vi.stubEnv('SELF_HOSTED', 'false');
    vi.stubEnv('NEXT_PUBLIC_SELF_HOSTED', 'false');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('includes exactly plus and pro', () => {
    expect(TTS_PLANS).toEqual(['plus', 'pro']);
    expect(isTTSInPlan('plus')).toBe(true);
    expect(isTTSInPlan('pro')).toBe(true);
    expect(isTTSInPlan('free')).toBe(false);
    expect(isTTSInPlan('purchase')).toBe(false);
  });

  it('unlocks Plus voices for Plus and Pro, Pro voices for Pro only', () => {
    expect(
      ['free', 'purchase', 'plus', 'pro'].map((p) => isVoiceTierInPlan('plus', p as never)),
    ).toEqual([false, false, true, true]);
    expect(
      ['free', 'purchase', 'plus', 'pro'].map((p) => isVoiceTierInPlan('pro', p as never)),
    ).toEqual([false, false, false, true]);
  });
});

describe('getTTSQuota', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns per-plan daily character quotas', () => {
    expect(getTTSQuota('plus')).toBe(500_000);
    expect(getTTSQuota('pro')).toBe(1_000_000);
    expect(getTTSQuota('free')).toBe(0);
    expect(getTTSQuota('purchase')).toBe(0);
  });

  it('honors the TTS_FIXED_QUOTA env override', () => {
    vi.stubEnv('TTS_FIXED_QUOTA', '12345');
    expect(getTTSQuota('plus')).toBe(12345);
    expect(getTTSQuota('free')).toBe(12345);
  });
});
