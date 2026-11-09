import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mocks for Tauri and internal modules ─────────────────────────
const mockCheck = vi.fn();
const mockTauriFetch = vi.fn();
const mockGlobalFetch = vi.fn();

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: (...args: unknown[]) => mockCheck(...args),
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: (...args: unknown[]) => mockTauriFetch(...args),
}));

const mockSetUpdaterWindowVisible = vi.fn();
vi.mock('@/components/UpdaterWindow', () => ({
  setUpdaterWindowVisible: (...args: unknown[]) => mockSetUpdaterWindowVisible(...args),
}));

vi.mock('@/services/constants', () => ({
  READEST_UPDATER_FILE: 'https://example.com/latest.json',
  READEST_NIGHTLY_UPDATER_FILE: 'https://example.com/nightly/latest.json',
  // Still exported so the pre-P12 implementation reaches its fetch call; the
  // contract test then proves it is never made.
  READEST_CHANGELOG_FILE: 'https://example.com/release-notes.json',
}));

// Force the release-notes path through the Tauri HTTP client. On the pre-P12
// implementation this is the branch that reaches download.readest.com, so the
// contract test fails unless the fetch is actually gone.
vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => true,
}));

import {
  checkForAppUpdates,
  checkAppReleaseNotes,
  setLastShownReleaseNotesVersion,
  getLastShownReleaseNotesVersion,
  resolveNightlyUpdate,
  getNightlyPlatformKey,
} from '@/helpers/updater';
import {
  buildNightlyManifest,
  buildStableManifest,
  baseVersion,
} from '../../../scripts/nightly-verify-harness/serve.mjs';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('fetch', mockGlobalFetch);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Helper to create a dummy TranslationFunc ─────────────────────
const dummyTranslate = (key: string) => key;

describe('updater', () => {
  // ── setLastShownReleaseNotesVersion / getLastShownReleaseNotesVersion ──
  describe('release notes version tracking', () => {
    test('getLastShownReleaseNotesVersion returns empty string when not set', () => {
      expect(getLastShownReleaseNotesVersion()).toBe('');
    });

    test('setLastShownReleaseNotesVersion stores value in localStorage', () => {
      setLastShownReleaseNotesVersion('2.0.0');
      expect(getLastShownReleaseNotesVersion()).toBe('2.0.0');
    });

    test('overwrites previous value', () => {
      setLastShownReleaseNotesVersion('1.0.0');
      setLastShownReleaseNotesVersion('2.0.0');
      expect(getLastShownReleaseNotesVersion()).toBe('2.0.0');
    });
  });

  // ── checkForAppUpdates / checkAppReleaseNotes ──────────────────
  // Both entry points are no-ops in this fork, so no request ever reaches
  // download.readest.com. See deploy/docs/patch-ledger.md (P9 and P12).
  describe('checkForAppUpdates', () => {
    test.each([
      'stable',
      'nightly',
    ] as const)('resolves false on the %s channel without calling the updater or fetching', async (channel) => {
      await expect(checkForAppUpdates(dummyTranslate, false, channel)).resolves.toBe(false);
      await expect(checkForAppUpdates(dummyTranslate, true, channel)).resolves.toBe(false);

      expect(mockCheck).not.toHaveBeenCalled();
      expect(mockTauriFetch).not.toHaveBeenCalled();
      expect(mockGlobalFetch).not.toHaveBeenCalled();
    });

    // The stub never consults the platform at all, so every platform resolves
    // false by construction. Keep the cases named for the platforms we ship to.
    test.each([
      'desktop',
      'android',
      'ios',
    ])('resolves false on %s without calling the updater or fetching', async () => {
      await expect(checkForAppUpdates(dummyTranslate, false)).resolves.toBe(false);

      expect(mockCheck).not.toHaveBeenCalled();
      expect(mockTauriFetch).not.toHaveBeenCalled();
      expect(mockGlobalFetch).not.toHaveBeenCalled();
    });
  });

  // ── checkAppReleaseNotes ───────────────────────────────────────
  describe('checkAppReleaseNotes', () => {
    test.each([
      true,
      false,
    ])('resolves false when isAutoCheck is %s without fetching or opening the updater', async (isAutoCheck) => {
      await expect(checkAppReleaseNotes(isAutoCheck)).resolves.toBe(false);

      expect(mockTauriFetch).not.toHaveBeenCalled();
      expect(mockGlobalFetch).not.toHaveBeenCalled();
      expect(mockSetUpdaterWindowVisible).not.toHaveBeenCalled();
    });
  });
});
describe('getNightlyPlatformKey', () => {
  test('android', () => {
    expect(getNightlyPlatformKey('android', 'aarch64', false, false)).toBe('android-arm64');
    expect(getNightlyPlatformKey('android', 'arm', false, false)).toBe('android-armv7');
    expect(getNightlyPlatformKey('android', 'x86_64', false, false)).toBe('android-legacy');
    expect(getNightlyPlatformKey('android', 'x86', false, false)).toBe('android-legacy');
  });
  test('windows nsis vs portable', () => {
    expect(getNightlyPlatformKey('windows', 'x86_64', false, false)).toBe('windows-x86_64');
    expect(getNightlyPlatformKey('windows', 'x86_64', true, false)).toBe('windows-x86_64-portable');
  });
  test('linux appimage vs deb', () => {
    expect(getNightlyPlatformKey('linux', 'x86_64', false, true)).toBe('linux-x86_64-appimage');
    expect(getNightlyPlatformKey('linux', 'x86_64', false, false)).toBeNull();
  });
  test('macos', () => {
    expect(getNightlyPlatformKey('macos', 'aarch64', false, false)).toBe('darwin-aarch64');
  });
  test('windows/linux aarch64 still map to their arm keys', () => {
    expect(getNightlyPlatformKey('windows', 'aarch64', false, false)).toBe('windows-aarch64');
    expect(getNightlyPlatformKey('windows', 'aarch64', true, false)).toBe(
      'windows-aarch64-portable',
    );
    expect(getNightlyPlatformKey('linux', 'aarch64', false, true)).toBe('linux-aarch64-appimage');
  });
  test('an unknown / 32-bit arch yields no nightly (no aarch64 mis-route)', () => {
    expect(getNightlyPlatformKey('windows', 'i686', false, false)).toBeNull();
    expect(getNightlyPlatformKey('windows', 'i686', true, false)).toBeNull();
    expect(getNightlyPlatformKey('linux', 'i686', false, true)).toBeNull();
  });
});

describe('resolveNightlyUpdate', () => {
  const mkRes = (body: unknown) => ({ ok: true, json: async () => body });
  const platformKey = 'darwin-aarch64';
  const entry = { url: 'https://x/app.tar.gz', signature: 'sig' };

  test('picks newer nightly over stable when stable is same-base', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('nightly')
        ? mkRes({ version: '0.11.4-2026061406', platforms: { [platformKey]: entry } })
        : mkRes({ version: '0.11.4', platforms: { [platformKey]: entry } }),
    );
    const r = await resolveNightlyUpdate('0.11.4', platformKey, fetchFn as never);
    expect(r?.version).toBe('0.11.4-2026061406');
    expect(r?.endpoint).toContain('nightly');
  });

  test('picks higher-base stable over older nightly', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('nightly')
        ? mkRes({ version: '0.11.4-2026061406', platforms: { [platformKey]: entry } })
        : mkRes({ version: '0.11.5', platforms: { [platformKey]: entry } }),
    );
    const r = await resolveNightlyUpdate('0.11.4-2026061406', platformKey, fetchFn as never);
    expect(r?.version).toBe('0.11.5');
    expect(r?.endpoint).not.toContain('nightly');
  });

  test('resolves the arm64 APK for an arm64 Android nightly', async () => {
    const key = getNightlyPlatformKey('android', 'aarch64', false, false)!;
    const apk = (abi: string) => ({
      url: `https://x/Readest_0.11.4-2026061406_${abi}.apk`,
      signature: abi,
    });
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('nightly')
        ? mkRes({
            version: '0.11.4-2026061406',
            platforms: {
              'android-arm64': apk('arm64'),
              'android-armv7': apk('armv7'),
              'android-legacy': apk('legacy'),
              'android-universal': apk('armv7'),
            },
          })
        : mkRes({ version: '0.11.4', platforms: {} }),
    );
    const r = await resolveNightlyUpdate('0.11.4', key, fetchFn as never);
    expect(r?.platformKey).toBe('android-arm64');
    expect(r?.url).toBe('https://x/Readest_0.11.4-2026061406_arm64.apk');
    expect(r?.signature).toBe('arm64');
  });

  test('ignores a manifest missing the current platform key', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('nightly')
        ? mkRes({ version: '0.11.4-2026061406', platforms: { [platformKey]: entry } })
        : mkRes({ version: '0.11.5', platforms: {} }),
    );
    const r = await resolveNightlyUpdate('0.11.4', platformKey, fetchFn as never);
    expect(r?.version).toBe('0.11.4-2026061406');
  });

  test('returns null when nothing is newer than installed', async () => {
    const fetchFn = vi.fn(async () =>
      mkRes({ version: '0.11.4', platforms: { [platformKey]: entry } }),
    );
    const r = await resolveNightlyUpdate('0.11.4', platformKey, fetchFn as never);
    expect(r).toBeNull();
  });

  test('returns null when both manifests fail to fetch', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network');
    });
    const r = await resolveNightlyUpdate('0.11.4', platformKey, fetchFn as never);
    expect(r).toBeNull();
  });
});

// Runs the REAL resolver against the local verify harness's own manifest
// builders (scripts/nightly-verify-harness/serve.mjs), so the harness and the
// production decision logic can't drift, and the "what would the app offer"
// decision for each scenario is asserted without the GUI.
describe('resolveNightlyUpdate — harness scenarios', () => {
  const platformKey = 'darwin-aarch64';
  const base = baseVersion();
  const [major, minor, patch] = base.split('.').map(Number) as [number, number, number];
  const mkFetch = (nightly: unknown, stable: unknown) =>
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.includes('nightly') ? nightly : stable),
    }));

  test('offers the nightly when stable is same-base (Tier 2 detection)', async () => {
    const r = await resolveNightlyUpdate(
      base,
      platformKey,
      mkFetch(buildNightlyManifest(), buildStableManifest()) as never,
    );
    expect(r?.version).toBe(`${base}-2099010100`);
    expect(r?.endpoint).toContain('nightly');
  });

  test('offers stable when stable surpasses the nightly (cross-channel)', async () => {
    const r = await resolveNightlyUpdate(
      base,
      platformKey,
      mkFetch(buildNightlyManifest(), buildStableManifest(true)) as never,
    );
    expect(r?.version).toBe(`${major}.${minor}.${patch + 1}`);
    expect(r?.endpoint).not.toContain('nightly');
  });

  test('offers nothing when already on the harness nightly', async () => {
    const r = await resolveNightlyUpdate(
      `${base}-2099010100`,
      platformKey,
      mkFetch(buildNightlyManifest(), buildStableManifest()) as never,
    );
    expect(r).toBeNull();
  });
});
