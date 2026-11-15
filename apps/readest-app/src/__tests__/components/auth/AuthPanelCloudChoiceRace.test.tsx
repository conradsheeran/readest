import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { SystemSettings } from '@/types/settings';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * AuthPanel unit tests.
 *
 * Historically tested the Readest Cloud opt-in vs web OAuth redirect race.
 * P20 removes third-party OAuth buttons and the "or continue with email" divider
 * from AuthPanel so only email/password workflows remain; these tests assert
 * the OAuth UI is omitted, email/password controls render and submit, and the
 * Readest Cloud opt-in checkbox still persists immediately.
 */

let releaseSave: () => void;
const savePending = () => new Promise<void>((resolve) => (releaseSave = resolve));
const saveSettings = vi.fn(savePending);
const loadSettings = vi.fn(async () => useSettingsStore.getState().settings);

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: { getAppService: async () => ({ saveSettings, loadSettings }) },
    appService: null,
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  // Interpolate so any provider button label would be distinguishable if rendered.
  useTranslation: () => (key: string, opts?: Record<string, string>) =>
    opts ? key.replace(/\{\{(\w+)\}\}/g, (_m, name) => opts[name] ?? _m) : key,
}));

vi.mock('@/utils/settingsSync', () => ({
  broadcastGlobalSettings: vi.fn(),
}));

import AuthPanel from '@/app/auth/components/AuthPanel';

const freshInstall = {
  version: 1,
  webdav: { enabled: false },
  googleDrive: { enabled: false },
} as unknown as SystemSettings;

beforeEach(() => {
  vi.clearAllMocks();
  useSettingsStore.setState({ settings: freshInstall } as never);
});

afterEach(() => {
  cleanup();
});

describe('AuthPanel email-only auth (P20)', () => {
  test('omits OAuth provider buttons and divider while keeping email and password controls', () => {
    render(
      <AuthPanel
        supabaseClient={{} as never}
        onProviderSignIn={vi.fn(async () => {})}
        magicLink={true}
      />,
    );

    for (const provider of ['Google', 'Apple', 'GitHub', 'Discord']) {
      expect(
        screen.queryByRole('button', { name: new RegExp(`Sign in with ${provider}`) }),
      ).toBeNull();
    }
    expect(screen.queryByText('or continue with email')).toBeNull();

    expect(screen.getByLabelText('Email address')).toBeTruthy();
    expect(screen.getByLabelText('Your Password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  test('submits email and password sign-in and persists the cloud opt-out toggle', async () => {
    const signInWithPassword = vi.fn(async () => ({ error: null }));
    render(
      <AuthPanel supabaseClient={{ auth: { signInWithPassword } } as never} magicLink={true} />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    releaseSave();
    await waitFor(() =>
      expect(useSettingsStore.getState().settings.readestCloud?.enabled).toBe(false),
    );

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'reader@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Your Password'), {
      target: { value: 'secret-pw' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: 'reader@example.com',
        password: 'secret-pw',
      }),
    );
  });
});
