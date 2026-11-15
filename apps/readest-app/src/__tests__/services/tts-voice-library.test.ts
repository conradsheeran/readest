import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TTSVoice, TTSVoicesGroup } from '@/services/tts/types';
import type { AppService } from '@/types/system';

const state = vi.hoisted(() => ({
  edgeVoices: [] as TTSVoice[],
  customVoices: [] as TTSVoice[],
  webVoices: [] as TTSVoice[],
  webGroups: [] as TTSVoicesGroup[],
  nativeVoices: [{ id: 'espeak-de', name: 'German', lang: 'de' }] as TTSVoice[],
  nativeGroups: [
    {
      id: 'native-tts',
      name: 'System TTS',
      engine: 'native-tts',
      voices: [{ id: 'espeak-de', name: 'German', lang: 'de' }],
    },
  ] as TTSVoicesGroup[],
}));

const nativeClient = vi.hoisted(() => ({
  initialized: false,
  init: vi.fn(async () => {
    nativeClient.initialized = true;
    return true;
  }),
  getAllVoices: vi.fn(async () => state.nativeVoices),
  getVoices: vi.fn(async (lang: string) =>
    state.nativeGroups
      .map((group) => ({
        ...group,
        voices: group.voices.filter((v) => v.lang.split('-')[0] === lang.split('-')[0]),
      }))
      .filter((group) => group.voices.length > 0),
  ),
}));

vi.mock('@/services/tts/voicePreview', () => ({
  READEST_TTS_ENGINE: 'readest-tts',
  getNativeClient: () => nativeClient,
}));
vi.mock('@/services/tts/providers/edge', () => ({
  EdgeSpeechProvider: class {
    id = 'edge-tts';
    label = 'Edge TTS';
    getAllVoices = async () => state.edgeVoices;
  },
}));
vi.mock('@/services/tts/providers/openaiCompatible', () => ({
  CUSTOM_TTS_PROVIDER_ID: 'custom-tts',
  OpenAICompatibleSpeechProvider: class {
    label = 'Custom TTS';
    getAllVoices = async () => state.customVoices;
    groupVoices = (voices: TTSVoice[]) =>
      voices.length > 0 ? [{ id: 'custom-tts:svc', name: 'Custom Service', voices }] : [];
  },
}));
vi.mock('@/services/tts/WebSpeechClient', () => ({
  WebSpeechClient: class {
    init = async () => true;
    getAllVoices = async () => state.webVoices;
    getVoices = async (lang: string) =>
      state.webGroups
        .map((group) => ({
          ...group,
          voices: group.voices.filter((v) => v.lang.split('-')[0] === lang.split('-')[0]),
        }))
        .filter((group) => group.voices.length > 0);
  },
}));

import { loadVoiceLibrary } from '@/services/tts/voiceLibrary';

const load = (platform: Partial<AppService>) =>
  loadVoiceLibrary({
    appService: platform as AppService,
    customServices: () => [],
    customAllowed: false,
  });

describe('loadVoiceLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
    nativeClient.initialized = false;
    state.edgeVoices = [];
    state.customVoices = [];
    state.webVoices = [];
    state.webGroups = [];
    state.nativeVoices = [{ id: 'espeak-de', name: 'German', lang: 'de' }];
    state.nativeGroups = [
      {
        id: 'native-tts',
        name: 'System TTS',
        engine: 'native-tts',
        voices: [{ id: 'espeak-de', name: 'German', lang: 'de' }],
      },
    ];
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each([
    ['Android', { isAndroidApp: true }],
    ['iOS', { isIOSApp: true }],
    ['Linux', { isLinuxApp: true }],
  ])('offers the system voices on %s', async (_platform, appService) => {
    const library = await load(appService);
    expect(library.languages).toEqual(['de']);
    expect((await library.getVoices('de')).map((group) => group.id)).toEqual(['native-tts']);
  });

  test('leaves the native engine alone where reading has none', async () => {
    const library = await load({ isMacOSApp: true });
    expect(nativeClient.init).not.toHaveBeenCalled();
    expect(library.languages).toEqual([]);
    expect(await library.getVoices('de')).toEqual([]);
  });

  test('excludes Readest voices while keeping Edge, Custom OpenAI, and System voices', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        voices: [
          { id: 'kokoro:af_heart', name: 'Heart', lang: 'en-US', tier: 'plus' },
          { id: 'kokoro:ff_siwis', name: 'Siwis', lang: 'fr-FR', tier: 'plus' },
        ],
      }),
    );

    state.edgeVoices = [{ id: 'en-US-AriaNeural', name: 'Aria', lang: 'en-US' }];
    state.customVoices = [{ id: 'svc:nova', name: 'nova', lang: 'en-US', literalName: true }];
    state.webVoices = [{ id: 'web-en', name: 'Samantha', lang: 'en-US' }];
    state.webGroups = [
      {
        id: 'web-speech',
        name: 'System TTS',
        engine: 'web-speech',
        voices: state.webVoices,
      },
    ];
    state.nativeVoices = [{ id: 'espeak-en', name: 'English', lang: 'en-US' }];
    state.nativeGroups = [
      {
        id: 'native-tts',
        name: 'System TTS',
        engine: 'native-tts',
        voices: state.nativeVoices,
      },
    ];

    const library = await loadVoiceLibrary({
      appService: { isAndroidApp: true } as AppService,
      customServices: () => [],
      customAllowed: true,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(library.languages).toEqual(['en']);
    expect((await library.getVoices('en')).map((group) => group.id)).toEqual([
      'custom-tts:svc',
      'edge-tts',
      'native-tts',
      'web-speech',
    ]);
    expect(await library.getVoices('fr')).toEqual([]);
  });
});
