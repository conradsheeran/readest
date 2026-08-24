import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { jwtDecode } from 'jwt-decode';
import {
  getCustomizationPurchased,
  isAnkiAllowed,
  isCustomizationAllowed,
  isCustomTranslatorAllowed,
  isSelfHosted,
} from '@/utils/access';
import { getServerRuntimeConfig } from '@/services/runtimeConfig';

vi.mock('jwt-decode', () => ({ jwtDecode: vi.fn() }));

const mockToken = (claims: Record<string, unknown>) => {
  (jwtDecode as unknown as ReturnType<typeof vi.fn>).mockReturnValue(claims);
  return 'token';
};

describe('getCustomizationPurchased', () => {
  it('reads the claim minted by custom_access_token_hook', () => {
    expect(getCustomizationPurchased(mockToken({ customization_purchased: true }))).toBe(true);
  });

  it('is false when the claim is absent, so old tokens do not unlock it', () => {
    expect(getCustomizationPurchased(mockToken({ plan: 'free' }))).toBe(false);
  });
});

// P1 (deploy/docs/patch-ledger.md) makes `isSelfHosted()` default to true, so
// the paywall is off unless the deployment explicitly opts back in.
describe('isCustomizationAllowed (self-hosted default)', () => {
  it('is unlocked for every plan and purchase state', () => {
    expect(isCustomizationAllowed('free', false)).toBe(true);
    expect(isCustomizationAllowed('purchase', false)).toBe(true);
    expect(isCustomizationAllowed('plus', false)).toBe(true);
    expect(isCustomizationAllowed('pro', false)).toBe(true);
    expect(isCustomizationAllowed('free', true)).toBe(true);
  });
});

describe('isCustomizationAllowed (self-hosting explicitly disabled)', () => {
  beforeEach(() => {
    vi.stubEnv('SELF_HOSTED', 'false');
    vi.stubEnv('NEXT_PUBLIC_SELF_HOSTED', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows an explicit purchase on any plan', () => {
    expect(isCustomizationAllowed('free', true)).toBe(true);
  });

  it('allows subscription tiers without a separate purchase', () => {
    expect(isCustomizationAllowed('plus', false)).toBe(true);
    expect(isCustomizationAllowed('pro', false)).toBe(true);
  });

  // `getUserProfilePlan` reports 'purchase' for anyone holding ANY one-time
  // purchase, which is how a storage add-on presents. Treating that as
  // entitlement would hand Full Customization to every storage buyer.
  it('does not treat a storage-only buyer as entitled', () => {
    expect(isCustomizationAllowed('purchase', false)).toBe(false);
  });

  it('denies a free user who has not bought it', () => {
    expect(isCustomizationAllowed('free', false)).toBe(false);
  });
});

// A self-hosted deployment has no store to buy from, and the operator already
// runs the infrastructure the paywall funds, so everything is unlocked.
describe('self-hosted deployments', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is on by default', () => {
    expect(isSelfHosted()).toBe(true);
  });

  it('is off only when explicitly set to false', () => {
    vi.stubEnv('SELF_HOSTED', 'false');
    expect(isSelfHosted()).toBe(false);
  });

  it('stays on when NEXT_PUBLIC_SELF_HOSTED is explicitly true', () => {
    vi.stubEnv('NEXT_PUBLIC_SELF_HOSTED', 'true');
    expect(isSelfHosted()).toBe(true);
  });

  it('unlocks premium for a signed-in free user with no purchase', () => {
    expect(isCustomizationAllowed('free', false)).toBe(true);
  });

  it('unlocks premium with no login at all, where the plan reads free', () => {
    expect(isCustomizationAllowed('free', false)).toBe(true);
  });

  // Defaulting to on means an explicitly blank variable must not re-lock it.
  it('stays unlocked when SELF_HOSTED is an explicitly empty string', () => {
    vi.stubEnv('SELF_HOSTED', '');
    expect(isSelfHosted()).toBe(true);
  });
});

// P1 (deploy/docs/patch-ledger.md) ships the self-hosted flag to the browser
// through /runtime-config.js. An explicit `SELF_HOSTED=false` must reach the
// browser as `selfHosted: false`, or the container cannot opt back into the
// upstream paywall.
describe('runtime-config self-hosting (P1)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.__READEST_RUNTIME_CONFIG;
  });

  it('emits selfHosted: false when SELF_HOSTED is explicitly false', () => {
    vi.stubEnv('SELF_HOSTED', 'false');
    vi.stubEnv('NEXT_PUBLIC_SELF_HOSTED', undefined);
    expect(getServerRuntimeConfig().selfHosted).toBe(false);
  });

  it('emits selfHosted: true when SELF_HOSTED is explicitly true', () => {
    vi.stubEnv('SELF_HOSTED', 'true');
    vi.stubEnv('NEXT_PUBLIC_SELF_HOSTED', undefined);
    expect(getServerRuntimeConfig().selfHosted).toBe(true);
  });

  it('emits selfHosted: undefined when neither variable is set', () => {
    vi.stubEnv('SELF_HOSTED', undefined);
    vi.stubEnv('NEXT_PUBLIC_SELF_HOSTED', undefined);
    expect(getServerRuntimeConfig().selfHosted).toBeUndefined();
  });

  it('honors the runtime config opt-out in the browser even without env vars', () => {
    vi.stubEnv('SELF_HOSTED', undefined);
    vi.stubEnv('NEXT_PUBLIC_SELF_HOSTED', undefined);
    window.__READEST_RUNTIME_CONFIG = { selfHosted: false };
    expect(isSelfHosted()).toBe(false);
  });
});

// Custom translators (the user's own LLM endpoint or DeepL key) are premium.
// The reader decides from the session token alone, so a signed-out reader is
// locked unless the deployment is self-hosted.
describe('isCustomTranslatorAllowed', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows any signed-in reader and a signed-out reader by default', () => {
    expect(isCustomTranslatorAllowed(mockToken({ plan: 'free' }))).toBe(true);
    expect(isCustomTranslatorAllowed(mockToken({ plan: 'plus' }))).toBe(true);
    expect(isCustomTranslatorAllowed(null)).toBe(true);
  });

  describe('with self-hosting explicitly disabled', () => {
    beforeEach(() => {
      vi.stubEnv('SELF_HOSTED', 'false');
      vi.stubEnv('NEXT_PUBLIC_SELF_HOSTED', 'false');
    });

    it('allows a subscriber', () => {
      expect(isCustomTranslatorAllowed(mockToken({ plan: 'plus' }))).toBe(true);
    });

    it('allows a free user who bought Full Customization', () => {
      expect(isCustomTranslatorAllowed(mockToken({ customization_purchased: true }))).toBe(true);
    });

    it('denies a free user and a storage-only buyer', () => {
      expect(isCustomTranslatorAllowed(mockToken({ plan: 'free' }))).toBe(false);
      expect(
        isCustomTranslatorAllowed(mockToken({ plan: 'free', storage_purchased_bytes: 1e9 })),
      ).toBe(false);
    });

    it('denies a signed-out reader', () => {
      expect(isCustomTranslatorAllowed(null)).toBe(false);
    });
  });
});

// P1 (deploy/docs/patch-ledger.md) flips ANKI_REQUIRES_PREMIUM off, so the
// master gate short-circuits before any plan lookup.
describe('isAnkiAllowed', () => {
  it('is unlocked for every plan and purchase state', () => {
    expect(isAnkiAllowed('free', false)).toBe(true);
    expect(isAnkiAllowed('plus', false)).toBe(true);
    expect(isAnkiAllowed('pro', false)).toBe(true);
    expect(isAnkiAllowed('free', true)).toBe(true);
    expect(isAnkiAllowed('purchase', false)).toBe(true);
  });
});
