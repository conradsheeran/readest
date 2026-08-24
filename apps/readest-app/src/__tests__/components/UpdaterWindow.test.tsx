/**
 * UpdaterContent — the "What's New in Readest" changelog.
 *
 * When the UI locale is non-English, the release notes are auto-translated in
 * place. These tests cover the "Show original" toggle that lets the reader flip
 * the auto-translated changelog back to the source English text (and back).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const { mockInstallNightlyUpdate } = vi.hoisted(() => ({
  mockInstallNightlyUpdate: vi.fn(),
}));

// ── Locale + translation controls ────────────────────────────────
let mockLocale = 'en';
let mockOS = 'macos';
let mockArch = 'aarch64';
const mockTranslate = vi.fn(async (input: string[]) => input.map((s) => `[zh] ${s}`));

vi.mock('@/utils/misc', () => ({
  getLocale: () => mockLocale,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string) => s,
}));

vi.mock('@/hooks/useTranslator', () => ({
  useTranslator: () => ({
    translate: mockTranslate,
    translator: null,
    translators: [],
    loading: false,
  }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: {
      hasUpdater: true,
      isIOSApp: false,
      isMacOSApp: false,
      isAndroidApp: mockOS === 'android',
      resolveFilePath: async (name: string) => `/cache/${name}`,
    },
  }),
}));

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => false,
}));

const mockAppVersion = '0.11.0';
vi.mock('@/utils/version', async () => {
  const actual = await vi.importActual<typeof import('@/utils/version')>('@/utils/version');
  return { ...actual, getAppVersion: () => mockAppVersion };
});

vi.mock('@/helpers/updater', async () => {
  const actual = await vi.importActual<typeof import('@/helpers/updater')>('@/helpers/updater');
  return {
    setLastShownReleaseNotesVersion: vi.fn(),
    getAndroidPlatformKey: actual.getAndroidPlatformKey,
  };
});

vi.mock('@/services/constants', () => ({
  READEST_UPDATER_FILE: 'https://example.com/latest.json',
  READEST_CHANGELOG_FILE: 'https://example.com/release-notes.json',
  READEST_UPDATER_PUBKEY: 'pk',
}));

// ── Tauri / heavy modules pulled in by UpdaterWindow's top-level imports ──
vi.mock('@tauri-apps/plugin-os', () => ({ type: () => mockOS, arch: () => mockArch }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn(), Update: class {} }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn(), exit: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-shell', () => ({ Command: { create: vi.fn() } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({ desktopDir: vi.fn(), join: vi.fn() }));
vi.mock('@/utils/transfer', () => ({ tauriDownload: vi.fn() }));
vi.mock('@/utils/bridge', () => ({
  installPackage: vi.fn(),
  verifyUpdateSignature: vi.fn(),
  installNightlyUpdate: mockInstallNightlyUpdate,
}));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/components/Dialog', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/Link', () => ({ default: () => null }));

import { UpdaterContent } from '@/components/UpdaterWindow';
import { tauriDownload } from '@/utils/transfer';
import { installPackage } from '@/utils/bridge';

const RELEASE_NOTES = {
  releases: {
    '0.11.18': { date: '2026-07-08', notes: ['First feature', 'Second feature'] },
  },
};

beforeEach(() => {
  mockLocale = 'en';
  mockOS = 'macos';
  mockArch = 'aarch64';
  vi.mocked(tauriDownload).mockReset();
  vi.mocked(installPackage).mockReset();
  mockTranslate.mockClear();
  mockInstallNightlyUpdate.mockReset();
  window.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => RELEASE_NOTES,
  })) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
});

describe('UpdaterContent — auto-translated changelog', () => {
  // P9 (deploy/docs/patch-ledger.md) retires the in-app updater: UpdaterContent
  // no longer reads a release manifest or downloads an official APK. With no
  // update to consume, the button is inert and no partial install can run.
  it('does not download or install an official APK', async () => {
    mockOS = 'android';
    render(<UpdaterContent latestVersion='0.11.20' />);

    const button = await screen.findByRole('button', { name: 'DOWNLOAD & INSTALL' });
    expect(button.className).toContain('btn-disabled');
    fireEvent.click(button);

    expect(tauriDownload).not.toHaveBeenCalled();
    expect(installPackage).not.toHaveBeenCalled();
    expect(vi.mocked(window.fetch)).not.toHaveBeenCalledWith('https://example.com/latest.json');
    expect(screen.queryByText('Failed to download and install update')).toBeNull();
  });

  // P9 (deploy/docs/patch-ledger.md) stops consuming `nightlyUpdate`, so a
  // caller that still passes one gets no installer run and no error.
  it('ignores a nightlyUpdate instead of running the official installer', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <UpdaterContent
        latestVersion='0.11.20'
        nightlyUpdate={{
          endpoint: 'https://example.com/nightly.json',
          version: '0.11.20',
          platformKey: 'windows-x86_64',
          url: 'https://example.com/readest.exe',
          signature: 'signature',
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'DOWNLOAD & INSTALL' }));

    expect(mockInstallNightlyUpdate).not.toHaveBeenCalled();
    expect(tauriDownload).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(screen.queryByText('Failed to download and install update')).toBeNull();
  });

  it('shows a "Show original" toggle that swaps the translation for the source English', async () => {
    mockLocale = 'zh-CN';
    render(<UpdaterContent checkUpdate={false} latestVersion='0.11.18' lastVersion='0.11.0' />);

    // The translated notes render by default (current behavior preserved).
    await waitFor(() => expect(screen.getByText('[zh] First feature')).toBeTruthy());
    expect(mockTranslate).toHaveBeenCalled();
    // The original English is hidden until the reader asks for it.
    expect(screen.queryByText('First feature')).toBeNull();

    const toggle = screen.getByRole('button', { name: 'Show original' });
    fireEvent.click(toggle);

    // Now the source English is shown, the translation is hidden, label flips.
    await waitFor(() => expect(screen.getByText('First feature')).toBeTruthy());
    expect(screen.queryByText('[zh] First feature')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show translation' })).toBeTruthy();
  });

  it('renders no toggle when the locale is English (nothing was translated)', async () => {
    mockLocale = 'en';
    render(<UpdaterContent checkUpdate={false} latestVersion='0.11.18' lastVersion='0.11.0' />);

    await waitFor(() => expect(screen.getByText('First feature')).toBeTruthy());
    expect(mockTranslate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Show original' })).toBeNull();
  });
});
