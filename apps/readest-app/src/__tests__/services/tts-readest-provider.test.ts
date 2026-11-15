import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  fetchWithAuth: vi.fn(),
}));

vi.mock('@/utils/fetch', () => ({ fetchWithAuth: m.fetchWithAuth }));

import { BufferedTTSClient } from '@/services/tts/BufferedTTSClient';
import { fetchReadestVoicePreview, ReadestVoiceProvider } from '@/services/tts/providers/readest';
import {
  SpeechSynthesisPermanentError,
  type SpeechSynthesisRequest,
} from '@/services/tts/providers/types';

const req = (text: string, lang = 'en-US'): SpeechSynthesisRequest => ({
  lang,
  text,
  voice: 'kokoro:af_heart',
  pitch: 1,
});

describe('ReadestVoiceProvider (disabled in self-hosted builds)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let provider: ReadestVoiceProvider;

  beforeEach(() => {
    localStorage.clear();
    m.fetchWithAuth.mockReset();
    m.fetchWithAuth.mockResolvedValue(
      Response.json({
        voices: [{ id: 'kokoro:af_heart', name: 'Heart', lang: 'en-US', tier: 'plus' }],
      }),
    );
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        voices: [{ id: 'kokoro:af_heart', name: 'Heart', lang: 'en-US', tier: 'plus' }],
      }),
    );
    provider = new ReadestVoiceProvider(new EventTarget());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports its stable id and label', () => {
    expect(provider.id).toBe('readest-tts');
    expect(provider.label).toBe('Readest Voice');
  });

  it('short-circuits init() to false without network calls', async () => {
    expect(await provider.init()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(m.fetchWithAuth).not.toHaveBeenCalled();
  });

  it('returns an empty voice list from getAllVoices() even with a cached catalog', async () => {
    localStorage.setItem(
      'readest-voice-catalog',
      JSON.stringify([{ id: 'kokoro:af_heart', name: 'Heart', lang: 'en-US', tier: 'plus' }]),
    );
    expect(await provider.getAllVoices()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(m.fetchWithAuth).not.toHaveBeenCalled();
  });

  it('treats warmup(), prefetch(), fulfill(), and shutdown() as network-free no-ops', async () => {
    const signal = new AbortController().signal;
    provider.warmup();
    provider.prefetch([req('Hello.')], 'listen', signal);
    provider.fulfill(req('Hello.'), { audio: new ArrayBuffer(4), boundaries: [] });
    await provider.shutdown();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(m.fetchWithAuth).not.toHaveBeenCalled();
  });

  it('fails synthesize() fast without issuing network requests', async () => {
    await expect(
      provider.synthesize(req('Hello.'), new AbortController().signal),
    ).rejects.toBeInstanceOf(SpeechSynthesisPermanentError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(m.fetchWithAuth).not.toHaveBeenCalled();
  });

  it('fails fetchReadestVoicePreview() without issuing network requests', async () => {
    await expect(
      fetchReadestVoicePreview(
        { text: 'Hello.', voice: 'kokoro:af_heart', lang: 'en-US' },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(SpeechSynthesisPermanentError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(m.fetchWithAuth).not.toHaveBeenCalled();
  });

  it('orders voices Plus before Pro, each by name', () => {
    const v = (name: string, tier: 'plus' | 'pro', lang = 'en-US') => ({
      id: name,
      name,
      lang,
      tier,
    });
    const sorted = [
      v('Clara', 'pro'),
      v('Emma', 'plus', 'en-GB'),
      v('Arthur', 'pro', 'en-GB'),
      v('Bella', 'plus'),
    ]
      .sort((a, b) => provider.compareVoices(a, b))
      .map((voice) => voice.name);
    expect(sorted).toEqual(['Bella', 'Emma', 'Arthur', 'Clara']);
  });

  it('keeps BufferedTTSClient uninitialized with no voices and zero requests', async () => {
    const client = new BufferedTTSClient(provider);
    expect(await client.init()).toBe(false);
    expect(client.initialized).toBe(false);
    expect(await client.getAllVoices()).toEqual([]);
    const groups = await client.getVoices('en');
    expect(groups.flatMap((g) => g.voices)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(m.fetchWithAuth).not.toHaveBeenCalled();
  });
});
