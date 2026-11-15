import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowConnector } from '@/services/sync/dataFlow/connectors';
import type { ConnectorId } from '@/services/sync/dataFlow/types';
import { readFlowState, recordConnectionCheck, recordFlow } from '@/services/sync/dataFlow/log';
import { useABSServerStore } from '@/store/absServerStore';
import { useCustomOPDSStore } from '@/store/customOPDSStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { ABSServer } from '@/types/audiobookshelf';
import type { OPDSCatalog } from '@/types/opds';
import type { SystemSettings } from '@/types/settings';

const h = vi.hoisted(() => ({
  connectors: [] as unknown[],
  ask: vi.fn(),
  useReal: false,
  user: null as { id: string } | null,
  tauri: false,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, o?: Record<string, unknown>) =>
    s.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(o?.[k] ?? '')),
}));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: { ask: h.ask } }),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: h.user, token: null }),
}));
vi.mock('@/services/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/environment')>()),
  isTauriAppPlatform: () => h.tauri,
}));
vi.mock('@/components/settings/integrations/useFlowConnectors', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/components/settings/integrations/useFlowConnectors')>();
  return {
    ...actual,
    useFlowConnectors: () => {
      const real = actual.useFlowConnectors();
      return h.useReal ? real : h.connectors;
    },
  };
});

import DataFlowPage from '@/components/settings/integrations/DataFlowPage';

const kosync = (over: Partial<FlowConnector> = {}): FlowConnector => ({
  id: 'kosync',
  title: 'KOReader',
  sources: ['progress'],
  sinks: ['progress'],
  check: vi.fn(async () => ({ ok: true })),
  ...over,
});

const obsidian = (over: Partial<FlowConnector> = {}): FlowConnector => ({
  id: 'obsidian',
  title: 'Obsidian',
  sources: [],
  sinks: ['notes'],
  check: vi.fn(async () => ({ ok: true })),
  ...over,
});

const column = (name: string) => within(screen.getByRole('list', { name }));

const renderPage = async (onOpenSettings = vi.fn()) => {
  render(<DataFlowPage onBack={vi.fn()} onOpenSettings={onOpenSettings} />);
  await act(async () => {});
};

beforeEach(() => {
  localStorage.clear();
  h.connectors = [];
  h.useReal = false;
  h.user = null;
  h.tauri = false;
  useSettingsStore.setState({ settings: {} as SystemSettings });
  useABSServerStore.setState({ servers: [] });
  useCustomOPDSStore.setState({ catalogs: [] });
});

afterEach(() => {
  cleanup();
});

describe('DataFlowPage diagram', () => {
  it('puts sources on one side and sinks on the other', async () => {
    h.connectors = [kosync(), obsidian()];
    await renderPage();

    expect(column('Sources').getByText('KOReader')).toBeTruthy();
    expect(column('Sources').queryByText('Obsidian')).toBeNull();
    expect(column('Destinations').getByText('KOReader')).toBeTruthy();
    expect(column('Destinations').getByText('Obsidian')).toBeTruthy();
  });

  it('shows entries received on the source side and sent on the sink side', async () => {
    h.connectors = [kosync()];
    recordFlow({ connector: 'kosync', direction: 'pull', kind: 'progress', count: 7 });
    recordFlow({ connector: 'kosync', direction: 'push', kind: 'progress', count: 42 });
    await renderPage();

    expect(column('Sources').getByText('7')).toBeTruthy();
    expect(column('Destinations').getByText('42')).toBeTruthy();
  });

  it('says which integrations need attention in words', async () => {
    h.connectors = [kosync(), obsidian()];
    recordConnectionCheck('kosync', { ok: true });
    recordConnectionCheck('obsidian', { ok: true });
    recordFlow({
      connector: 'obsidian',
      direction: 'push',
      kind: 'notes',
      error: 'Folder not available',
    });
    await renderPage();

    expect(screen.getByText('Working: 1')).toBeTruthy();
    expect(screen.getByText('Needs attention: 1')).toBeTruthy();
    expect(column('Destinations').getByLabelText('Obsidian: Needs attention')).toBeTruthy();
    expect(column('Destinations').getByLabelText('KOReader: Working')).toBeTruthy();
  });

  it('flags only the side of a two-way integration that failed', async () => {
    h.connectors = [kosync()];
    recordConnectionCheck('kosync', { ok: true });
    recordFlow({ connector: 'kosync', direction: 'pull', kind: 'progress', count: 1 });
    recordFlow({ connector: 'kosync', direction: 'push', kind: 'progress', error: 'HTTP 500' });
    await renderPage();

    expect(column('Sources').getByLabelText('KOReader: Working')).toBeTruthy();
    expect(column('Destinations').getByLabelText('KOReader: Needs attention')).toBeTruthy();
    expect(screen.getByText('Working: 0')).toBeTruthy();
    expect(screen.getByText('Needs attention: 1')).toBeTruthy();
  });

  it('explains itself when nothing is set up', async () => {
    await renderPage();

    expect(screen.getByText('No integrations are set up yet')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('DataFlowPage reset', () => {
  const seed = async () => {
    h.connectors = [kosync()];
    recordConnectionCheck('kosync', { ok: true });
    recordFlow({ connector: 'kosync', direction: 'push', kind: 'progress', count: 42 });
    await renderPage();
  };

  it('clears the counts once confirmed', async () => {
    h.ask.mockResolvedValue(true);
    await seed();

    fireEvent.click(screen.getByRole('button', { name: 'Reset Counts' }));

    await waitFor(() => expect(column('Destinations').queryByText('42')).toBeNull());
    expect(readFlowState().entries).toEqual([]);
  });

  it('keeps the counts when the reader says no', async () => {
    h.ask.mockResolvedValue(false);
    await seed();

    fireEvent.click(screen.getByRole('button', { name: 'Reset Counts' }));

    await waitFor(() => expect(h.ask).toHaveBeenCalled());
    expect(column('Destinations').getByText('42')).toBeTruthy();
  });
});

describe('DataFlowPage connection checks', () => {
  it('checks every integration when the page opens', async () => {
    const first = kosync();
    const second = obsidian();
    h.connectors = [first, second];
    await renderPage();

    await waitFor(() => expect(readFlowState().checks.obsidian?.ok).toBe(true));
    expect(first.check).toHaveBeenCalledTimes(1);
    expect(second.check).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a check made in the last few minutes', async () => {
    const connector = kosync();
    h.connectors = [connector];
    recordConnectionCheck('kosync', { ok: true });
    await renderPage();

    expect(connector.check).not.toHaveBeenCalled();
  });

  it('rechecks on request', async () => {
    const connector = kosync();
    h.connectors = [connector];
    recordConnectionCheck('kosync', { ok: true });
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Check All' }));

    await waitFor(() => expect(connector.check).toHaveBeenCalledTimes(1));
  });
});

describe('DataFlowPage integration details', () => {
  const openObsidian = async () => {
    h.connectors = [obsidian()];
    await renderPage();
    fireEvent.click(column('Destinations').getByLabelText(/Obsidian/));
  };

  it('shows the connection and the sync history apart', async () => {
    recordConnectionCheck('obsidian', { ok: true });
    recordFlow({
      connector: 'obsidian',
      direction: 'push',
      kind: 'notes',
      count: 3,
      bookTitle: 'Dune',
    });
    recordFlow({
      connector: 'obsidian',
      direction: 'push',
      kind: 'notes',
      bookTitle: 'Emma',
      error: 'Folder not available',
    });
    await openObsidian();

    expect(screen.getByText('Connection')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('Sync History')).toBeTruthy();
    expect(screen.getByText('Dune')).toBeTruthy();
    expect(screen.getAllByText(/Folder not available/).length).toBeGreaterThan(0);
  });

  it('leaves out other integrations from the history', async () => {
    recordFlow({ connector: 'kosync', direction: 'push', kind: 'progress', bookTitle: 'Emma' });
    await openObsidian();

    expect(screen.queryByText('Emma')).toBeNull();
    expect(screen.getByText('Nothing has synced yet')).toBeTruthy();
  });

  it('opens the settings of the integration', async () => {
    const onOpenSettings = vi.fn();
    h.connectors = [obsidian()];
    await renderPage(onOpenSettings);
    fireEvent.click(column('Destinations').getByLabelText(/Obsidian/));

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));

    expect(onOpenSettings).toHaveBeenCalledWith('obsidian');
  });
});

describe('DataFlowPage supported connectors (P23)', () => {
  it('filters pruned connectors out of real useFlowConnectors even when configured in stores', async () => {
    h.useReal = true;
    h.user = { id: 'u1' };
    h.tauri = true;

    const keptIds: ConnectorId[] = [
      'readest-cloud',
      'webdav',
      's3',
      'obsidian',
      'kosync',
      'opds',
      'localsend',
    ];
    const prunedIds: ConnectorId[] = [
      'gdrive',
      'onedrive',
      'icloud',
      'notion',
      'audiobookshelf',
      'readwise',
      'hardcover',
      'pagebound',
      'bookorbit',
      'grimmory',
      'send',
    ];
    for (const id of keptIds) {
      recordConnectionCheck(id, { ok: true });
    }

    useSettingsStore.setState({
      settings: {
        readestCloud: { enabled: true },
        webdav: { enabled: true, syncProgress: true },
        s3: { enabled: true, syncProgress: true },
        obsidian: { enabled: true, folder: '/vault' },
        kosync: { enabled: true, username: 'reader' },
        googleDrive: { enabled: true },
        onedrive: { enabled: true },
        icloud: { enabled: true },
        notion: { enabled: true, accessToken: 't', databaseId: 'd' },
        readwise: { enabled: true, accessToken: 't' },
        hardcover: { enabled: true, accessToken: 't' },
        pagebound: { enabled: true, refreshToken: 'r' },
        bookorbit: { enabled: true, syncProgress: true },
        grimmory: {
          enabled: true,
          serverUrl: 'https://g',
          username: 'u',
          password: 'p',
          syncProgress: true,
        },
      } as unknown as SystemSettings,
    });
    useABSServerStore.setState({
      servers: [{ id: 'abs-1', name: 'ABS', url: 'https://abs.example' } as ABSServer],
    });
    useCustomOPDSStore.setState({
      catalogs: [{ id: 'opds-1', name: 'OPDS', url: 'https://opds.example' } as OPDSCatalog],
    });

    await renderPage();

    const checkedIds = Object.keys(readFlowState().checks);
    for (const id of prunedIds) {
      expect(checkedIds).not.toContain(id);
    }

    for (const title of [
      'Readest Cloud',
      'WebDAV',
      'S3',
      'Obsidian',
      'KOReader',
      'OPDS Catalogs',
      'Nearby BookDrop',
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
    for (const title of [
      'Google Drive',
      'OneDrive',
      'iCloud',
      'Notion',
      'Audiobookshelf',
      'Readwise',
      'Hardcover',
      'Pagebound',
      'BookOrbit',
      'Grimmory',
      'Send to Readest',
    ]) {
      expect(screen.queryByText(title)).toBeNull();
    }
  });
});
