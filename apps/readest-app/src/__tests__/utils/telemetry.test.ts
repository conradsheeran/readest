import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createElement, Fragment, type ReactNode } from 'react';
import type { SystemSettings } from '@/types/settings';
import type { AppService } from '@/types/system';

vi.mock('posthog-js', () => ({
  default: {
    __loaded: true,
    capture: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
  },
}));

const providerMocks = vi.hoisted(() => ({
  exists: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
  loadSettings: vi.fn<() => Promise<SystemSettings>>(),
  saveSettings: vi.fn<(settings: SystemSettings) => Promise<void>>().mockResolvedValue(undefined),
  initPostHog: vi.fn(),
}));

vi.mock('@/utils/polyfill', () => ({}));
vi.mock('@/i18n/i18n', () => ({
  default: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('@/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
}));
vi.mock('@/context/PHContext', () => ({
  CSPostHogProvider: ({ children }: { children: ReactNode }) =>
    createElement(Fragment, null, children),
  initPostHog: () => providerMocks.initPostHog(),
}));
vi.mock('@/context/SyncContext', () => ({
  SyncProvider: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
}));
vi.mock('@/context/DropdownContext', () => ({
  DropdownProvider: ({ children }: { children: ReactNode }) =>
    createElement(Fragment, null, children),
}));
vi.mock('@/components/command-palette', () => ({
  CommandPaletteProvider: ({ children }: { children: ReactNode }) =>
    createElement(Fragment, null, children),
  CommandPalette: () => null,
}));
vi.mock('@/components/WindowResizeHandles', () => ({ default: () => null }));
vi.mock('@/components/WindowOutline', () => ({ default: () => null }));
vi.mock('@/components/AtmosphereOverlay', () => ({ default: () => null }));
vi.mock('@/components/AppLockScreen', () => ({ default: () => null }));
vi.mock('@/components/settings/AppLockDialog', () => ({ default: () => null }));
vi.mock('@/components/PassphrasePrompt', () => ({ default: () => null }));
vi.mock('@/components/TelemetryConsentDialog', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? createElement('div', { 'data-testid': 'telemetry-consent-dialog' }) : null,
}));
vi.mock('@/store/themeStore', () => ({
  initSystemThemeListener: vi.fn(),
  loadDataTheme: vi.fn(),
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ applyUILanguage: vi.fn() }),
}));
vi.mock('@/store/customTextureStore', () => ({
  useCustomTextureStore: { getState: () => ({ setTextures: vi.fn() }) },
}));
vi.mock('@/store/appLockStore', () => ({
  useAppLockStore: () => ({ isInitialized: true, isUnlocked: true, initialize: vi.fn() }),
}));
vi.mock('@/hooks/useSafeAreaInsets', () => ({ useSafeAreaInsets: vi.fn() }));
vi.mock('@/hooks/useSettingsSync', () => ({ useSettingsSync: vi.fn() }));
vi.mock('@/hooks/useResponsiveSize', () => ({ useDefaultIconSize: () => 16 }));
vi.mock('@/hooks/useBackgroundTexture', () => ({
  useBackgroundTexture: () => ({ applyBackgroundTexture: vi.fn() }),
}));
vi.mock('@/hooks/useEinkMode', () => ({
  useEinkMode: () => ({ applyEinkMode: vi.fn() }),
}));
vi.mock('@/utils/misc', () => ({ getLocale: () => 'en', stubTranslation: (s: string) => s }));
vi.mock('@/utils/rtl', () => ({ getDirFromUILanguage: () => 'ltr' }));
vi.mock('@/utils/viewport', () => ({ getAndroidPatchedViewportContent: () => null }));
vi.mock('@/helpers/settings', () => ({ getLibraryViewSettings: () => ({}) }));
vi.mock('@/libs/crypto/passphrase', () => ({
  upgradeToKeychainIfAvailable: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/libs/crypto/session', () => ({
  cryptoSession: { tryRestoreFromStore: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/services/sync/replicaSettingsSync', () => ({ initSettingsSync: vi.fn() }));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: {
      exists: providerMocks.exists,
      loadSettings: providerMocks.loadSettings,
      saveSettings: providerMocks.saveSettings,
    } as unknown as AppService,
  }),
}));

import posthog from 'posthog-js';
import Providers from '@/components/Providers';
import { DEFAULT_SYSTEM_SETTINGS } from '@/services/constants';
import {
  applyPostHogConsent,
  getTelemetryDecision,
  hasOptedOutTelemetry,
  optInTelemetry,
  optOutTelemetry,
  reconcileTelemetryConsent,
  rollIntoTelemetryPromptBucket,
  setTelemetryDecision,
  TELEMETRY_DECISION_KEY,
  TELEMETRY_OPT_OUT_KEY,
  TELEMETRY_PROMPT_BUCKET_RATE,
} from '@/utils/telemetry';

describe('telemetry decision storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('returns null when no decision is stored', () => {
    expect(getTelemetryDecision()).toBeNull();
  });

  it('round-trips the three valid decisions', () => {
    setTelemetryDecision('opt-in');
    expect(getTelemetryDecision()).toBe('opt-in');
    setTelemetryDecision('opt-out');
    expect(getTelemetryDecision()).toBe('opt-out');
    setTelemetryDecision('pending');
    expect(getTelemetryDecision()).toBe('pending');
  });

  it('ignores garbage values written directly to the key', () => {
    localStorage.setItem(TELEMETRY_DECISION_KEY, 'something-else');
    expect(getTelemetryDecision()).toBeNull();
  });
});

describe('optInTelemetry / optOutTelemetry', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('opt-in records opt-in decision, clears opt-out flag, and calls posthog', () => {
    optInTelemetry();
    expect(localStorage.getItem(TELEMETRY_OPT_OUT_KEY)).toBe('false');
    expect(getTelemetryDecision()).toBe('opt-in');
    expect(hasOptedOutTelemetry()).toBe(false);
    expect(posthog.opt_in_capturing).toHaveBeenCalledOnce();
  });

  it('opt-out records opt-out decision, sets opt-out flag, and calls posthog', () => {
    optOutTelemetry();
    expect(localStorage.getItem(TELEMETRY_OPT_OUT_KEY)).toBe('true');
    expect(getTelemetryDecision()).toBe('opt-out');
    expect(hasOptedOutTelemetry()).toBe(true);
    expect(posthog.opt_out_capturing).toHaveBeenCalledOnce();
  });
});

describe('rollIntoTelemetryPromptBucket', () => {
  it('is true when the rng falls under the bucket rate', () => {
    expect(rollIntoTelemetryPromptBucket(() => 0)).toBe(true);
    expect(rollIntoTelemetryPromptBucket(() => TELEMETRY_PROMPT_BUCKET_RATE - 1e-9)).toBe(true);
  });

  it('is false at or above the bucket rate', () => {
    expect(rollIntoTelemetryPromptBucket(() => TELEMETRY_PROMPT_BUCKET_RATE)).toBe(false);
    expect(rollIntoTelemetryPromptBucket(() => 0.99)).toBe(false);
  });

  it('places roughly 10% of uniform draws into the bucket', () => {
    const n = 10000;
    let inBucket = 0;
    for (let i = 0; i < n; i++) {
      if (rollIntoTelemetryPromptBucket(() => i / n)) inBucket++;
    }
    // Deterministic uniform sweep: floor(n * rate) = 1000.
    expect(inBucket).toBe(Math.floor(n * TELEMETRY_PROMPT_BUCKET_RATE));
  });
});

describe('reconcileTelemetryConsent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('opts out when the saved settings have telemetry disabled', () => {
    optInTelemetry();
    vi.clearAllMocks();

    expect(reconcileTelemetryConsent(false)).toBe(false);

    expect(posthog.opt_out_capturing).toHaveBeenCalledOnce();
    expect(hasOptedOutTelemetry()).toBe(true);
    expect(getTelemetryDecision()).toBe('opt-out');
  });

  it('keeps a recorded opt-out when the settings file says telemetry is on', () => {
    optOutTelemetry();
    vi.clearAllMocks();

    // Returns false so the boot code can turn the settings switch off too.
    expect(reconcileTelemetryConsent(true)).toBe(false);

    expect(posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled();
    expect(hasOptedOutTelemetry()).toBe(true);
    expect(getTelemetryDecision()).toBe('opt-out');
  });

  it('leaves the consent alone when it already matches the settings', () => {
    optOutTelemetry();
    vi.clearAllMocks();

    reconcileTelemetryConsent(false);

    expect(posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled();
  });

  it('reports telemetry as enabled when the consent is opt-in', () => {
    optInTelemetry();

    expect(reconcileTelemetryConsent(true)).toBe(true);
  });
});

describe('applyPostHogConsent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('restores an opt-in without sending an $opt_in event', () => {
    setTelemetryDecision('opt-in');

    applyPostHogConsent();

    expect(posthog.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false });
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled();
  });

  it('opts out for any other decision', () => {
    setTelemetryDecision('pending');

    applyPostHogConsent();

    expect(posthog.opt_out_capturing).toHaveBeenCalledOnce();
    expect(posthog.opt_in_capturing).not.toHaveBeenCalled();
  });
});

describe('consent calls before PostHog starts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    posthog.__loaded = false;
  });

  afterEach(() => {
    posthog.__loaded = true;
  });

  it('records the decision but leaves PostHog alone until init', () => {
    optOutTelemetry();
    optInTelemetry();

    expect(getTelemetryDecision()).toBe('opt-in');
    expect(posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled();
  });
});

describe('Providers boot telemetry consent', () => {
  const makeSettings = (telemetryEnabled = true): SystemSettings =>
    ({
      ...DEFAULT_SYSTEM_SETTINGS,
      globalViewSettings: {
        uiLanguage: '',
        isEink: false,
      },
      telemetryEnabled,
    }) as SystemSettings;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    providerMocks.exists.mockResolvedValue(false);
    providerMocks.saveSettings.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('silently opts out a brand-new user without showing the consent prompt even when RNG rolls into the prompt bucket', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const settings = makeSettings(true);
    providerMocks.exists.mockResolvedValue(false);
    providerMocks.loadSettings.mockResolvedValue(settings);

    render(createElement(Providers, null, createElement('div', { 'data-testid': 'app-child' })));

    await waitFor(() => expect(providerMocks.initPostHog).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('telemetry-consent-dialog')).toBeNull();
    expect(getTelemetryDecision()).toBe('opt-out');
    expect(hasOptedOutTelemetry()).toBe(true);
    expect(settings.telemetryEnabled).toBe(false);
    expect(providerMocks.saveSettings).toHaveBeenCalledWith(settings);
  });

  it('silently opts out a stale pending profile without showing the consent prompt', async () => {
    setTelemetryDecision('pending');
    const settings = makeSettings(true);
    providerMocks.exists.mockResolvedValue(true);
    providerMocks.loadSettings.mockResolvedValue(settings);

    render(createElement(Providers, null, createElement('div', { 'data-testid': 'app-child' })));

    await waitFor(() => expect(providerMocks.initPostHog).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('telemetry-consent-dialog')).toBeNull();
    expect(getTelemetryDecision()).toBe('opt-out');
    expect(hasOptedOutTelemetry()).toBe(true);
    expect(settings.telemetryEnabled).toBe(false);
    expect(providerMocks.saveSettings).toHaveBeenCalledWith(settings);
  });

  it('opts out an existing user without a recorded decision even when telemetryEnabled was true', async () => {
    const settings = makeSettings(true);
    providerMocks.exists.mockResolvedValue(true);
    providerMocks.loadSettings.mockResolvedValue(settings);

    render(createElement(Providers, null, createElement('div', { 'data-testid': 'app-child' })));

    await waitFor(() => expect(providerMocks.initPostHog).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('telemetry-consent-dialog')).toBeNull();
    expect(getTelemetryDecision()).toBe('opt-out');
    expect(hasOptedOutTelemetry()).toBe(true);
    expect(settings.telemetryEnabled).toBe(false);
    expect(providerMocks.saveSettings).toHaveBeenCalledWith(settings);
  });

  it('reconciles a stale opt-in decision back to opt-out', async () => {
    optInTelemetry();
    vi.clearAllMocks();
    const settings = makeSettings(true);
    providerMocks.exists.mockResolvedValue(true);
    providerMocks.loadSettings.mockResolvedValue(settings);

    render(createElement(Providers, null, createElement('div', { 'data-testid': 'app-child' })));

    await waitFor(() => expect(providerMocks.initPostHog).toHaveBeenCalledOnce());
    expect(getTelemetryDecision()).toBe('opt-out');
    expect(hasOptedOutTelemetry()).toBe(true);
    expect(settings.telemetryEnabled).toBe(false);
    expect(providerMocks.saveSettings).toHaveBeenCalledWith(settings);
  });
});
