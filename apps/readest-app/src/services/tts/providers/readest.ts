import type { TTSVoice } from '../types';
import {
  type PrefetchOptions,
  type SpeechProvider,
  SpeechSynthesisPermanentError,
  type SpeechSynthesisRequest,
  type SpeechSynthesisResult,
  type TTSLane,
} from './types';

/**
 * Self-hosted no-op — see deploy/docs/patch-ledger.md (P22).
 *
 * Upstream `Readest Voice` synthesizes through Readest Cloud's GPU service
 * (`/api/tts/readest`, `/stream`, `/jobs`), which a self-hosted deployment
 * cannot host and must never contact or advertise. Short-circuiting here keeps
 * `BufferedTTSClient`, `TTSController`, and `voiceLibrary` signatures intact
 * while emitting zero network requests and omitting the `Readest Voice` group.
 */
export const fetchReadestVoicePreview = async (
  _req: { text: string; voice: string; lang: string },
  _signal: AbortSignal,
): Promise<ArrayBuffer> => {
  throw new SpeechSynthesisPermanentError('Readest Voice is disabled');
};

export class ReadestVoiceProvider implements SpeechProvider {
  readonly id = 'readest-tts';
  readonly label = 'Readest Voice';
  readonly cacheable = true;
  readonly sameLanguageVoicesOnly = true;

  // biome-ignore lint/complexity/noUselessConstructor: preserves constructor(events?: EventTarget) signature for callers
  constructor(_events?: EventTarget) {}

  async getAllVoices(): Promise<TTSVoice[]> {
    return [];
  }

  async init(): Promise<boolean> {
    return false;
  }

  // Plus voices before Pro ones, each by name.
  compareVoices(a: TTSVoice, b: TTSVoice): number {
    const rank = (voice: TTSVoice) => (voice.tier === 'pro' ? 1 : 0);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  }

  warmup(): void {}

  async synthesize(
    _req: SpeechSynthesisRequest,
    _signal: AbortSignal,
    _options?: PrefetchOptions,
  ): Promise<SpeechSynthesisResult> {
    throw new SpeechSynthesisPermanentError('Readest Voice is disabled');
  }

  prefetch(
    _reqs: SpeechSynthesisRequest[],
    _lane: TTSLane,
    _signal: AbortSignal,
    _options?: PrefetchOptions,
  ): void {}

  fulfill(_req: SpeechSynthesisRequest, _result: SpeechSynthesisResult): void {}

  async shutdown(): Promise<void> {}
}
