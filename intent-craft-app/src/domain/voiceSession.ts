// Dictation without browser speech services: the microphone level decides where a phrase starts and ends,
// each phrase is recorded and sent to the local Whisper service, and the text comes back in speaking order.
// No React and no browser globals here: the component passes a Mic and a transcriber, tests pass fakes.

export type DictationState = 'idle' | 'starting' | 'listening' | 'paused' | 'error';

export interface Mic {
  /** Current loudness, 0..1 (RMS of the last few milliseconds). */
  level(): number;
  startRecording(): void;
  /** Stops the current recording and resolves its audio (null when nothing was recorded). */
  stopRecording(): Promise<Blob | null>;
  close(): void;
}

export interface SegmenterOptions {
  /** Loudness that counts as speech, above the measured background noise. */
  minLevel: number;
  /** A phrase ends after this much quiet. */
  silenceMs: number;
  /** Shorter sounds (a cough, a click) are thrown away. */
  minSpeechMs: number;
  /** A phrase is cut here even without a pause, so text keeps arriving during long speech. */
  maxPhraseMs: number;
}

export const DEFAULT_SEGMENTER: SegmenterOptions = { minLevel: 0.015, silenceMs: 800, minSpeechMs: 250, maxPhraseMs: 20_000 };

/** Pure phrase detector: feed it loudness samples, it says when a phrase started or ended. */
export class PhraseSegmenter {
  private speaking = false;
  private startedAt = 0;
  private lastLoudAt = 0;
  private noise = 0;
  private readonly opts: SegmenterOptions;

  constructor(opts: Partial<SegmenterOptions> = {}) {
    this.opts = { ...DEFAULT_SEGMENTER, ...opts };
  }

  get inPhrase() {
    return this.speaking;
  }

  feed(level: number, t: number): 'start' | 'end' | 'discard' | null {
    // Background noise follows quiet moments slowly, so a fan or a humming room does not count as speech.
    // It starts at zero, so speaking the moment the microphone opens is never mistaken for background.
    if (!this.speaking) this.noise = this.noise * 0.95 + level * 0.05;
    const loud = level > Math.max(this.opts.minLevel, this.noise * 2.5);
    if (!this.speaking) {
      if (!loud) return null;
      this.speaking = true;
      this.startedAt = this.lastLoudAt = t;
      return 'start';
    }
    if (loud) this.lastLoudAt = t;
    const quietFor = t - this.lastLoudAt;
    const longFor = t - this.startedAt;
    if (quietFor < this.opts.silenceMs && longFor < this.opts.maxPhraseMs) return null;
    this.speaking = false;
    return this.lastLoudAt - this.startedAt >= this.opts.minSpeechMs ? 'end' : 'discard';
  }
}

export interface SessionDeps {
  openMic: () => Promise<Mic>;
  transcribe: (audio: Blob) => Promise<string>;
  onText: (text: string) => void;
  onState: (state: DictationState, detail?: string) => void;
  /** Number of phrases sent but not written yet. */
  onPending?: (n: number) => void;
  /** Called after the user stops dictating, once every phrase is written. */
  onFinished?: () => void;
  segmenter?: Partial<SegmenterOptions>;
}

/**
 * One dictation session. The owner calls tick(now) every ~50 ms while listening.
 * Text is delivered strictly in speaking order even when transcriptions finish out of order.
 */
export class DictationSession {
  private mic: Mic | null = null;
  private seg: PhraseSegmenter;
  private state: DictationState = 'idle';
  private chain: Promise<void> = Promise.resolve();
  private pending = 0;
  private quietSince = 0;

  private readonly deps: SessionDeps;

  constructor(deps: SessionDeps) {
    this.deps = deps;
    this.seg = new PhraseSegmenter(deps.segmenter);
  }

  get current() {
    return this.state;
  }

  private set(state: DictationState, detail?: string) {
    this.state = state;
    this.deps.onState(state, detail);
  }

  async start(): Promise<void> {
    if (this.state === 'listening' || this.state === 'starting') return;
    this.set('starting');
    try {
      this.mic = await this.deps.openMic();
    } catch (e) {
      this.set('error', e instanceof Error ? e.message : String(e));
      return;
    }
    if (this.current !== 'starting') {
      this.mic.close(); // stopped while the microphone was opening
      this.mic = null;
      return;
    }
    this.seg = new PhraseSegmenter(this.deps.segmenter);
    this.quietSince = 0;
    this.mic.startRecording();
    this.set('listening');
  }

  tick(now: number): void {
    if (this.state !== 'listening' || !this.mic) return;
    const event = this.seg.feed(this.mic.level(), now);
    if (event === 'end') this.flush(true);
    else if (event === 'discard') void this.restart();
    else if (!this.seg.inPhrase) {
      // Long silence: drop the recording so it does not grow without bound.
      if (!this.quietSince) this.quietSince = now;
      else if (now - this.quietSince > 10_000) {
        this.quietSince = now;
        void this.restart();
      }
    } else this.quietSince = 0;
  }

  private async restart() {
    const mic = this.mic;
    if (!mic) return;
    await mic.stopRecording();
    if (this.mic === mic && this.state === 'listening') mic.startRecording();
  }

  /** Close the current phrase and queue its transcription; keep listening when `continueAfter`. */
  private flush(continueAfter: boolean): Promise<void> {
    const mic = this.mic;
    if (!mic) return this.chain;
    const audio = mic.stopRecording();
    if (continueAfter) mic.startRecording();
    this.pending++;
    this.deps.onPending?.(this.pending);
    const text = audio.then((a) => (a && a.size > 0 ? this.deps.transcribe(a) : ''));
    // Chain on the previous phrase so text lands in speaking order.
    this.chain = this.chain.then(async () => {
      try {
        const t = (await text).trim();
        if (t) this.deps.onText(t);
      } catch (e) {
        this.deps.onState(this.state, e instanceof Error ? e.message : String(e));
      } finally {
        this.pending--;
        this.deps.onPending?.(this.pending);
      }
    });
    return this.chain;
  }

  /** Pause keeps what was said so far: the open phrase is written, then the microphone is released. */
  async pause(): Promise<void> {
    if (this.state !== 'listening') return;
    this.set('paused');
    await this.release();
  }

  async stop(): Promise<void> {
    const wasActive = this.state === 'listening' || this.state === 'paused' || this.state === 'starting';
    this.set('idle');
    await this.release();
    if (wasActive) this.deps.onFinished?.();
  }

  private async release() {
    const done = this.seg.inPhrase ? this.flush(false) : this.mic?.stopRecording().then(() => undefined);
    this.seg = new PhraseSegmenter(this.deps.segmenter);
    const mic = this.mic;
    this.mic = null;
    await done;
    await this.chain;
    mic?.close();
  }
}
