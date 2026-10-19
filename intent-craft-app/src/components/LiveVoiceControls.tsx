import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DictationSession, type DictationState, type Mic } from '../domain/voiceSession.ts';
import { useT } from '../i18n.ts';
import { Icon } from './Icon.tsx';

/** Microphone with a loudness meter; each recording is a complete audio file the STT service can read. */
async function openBrowserMic(): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  return {
    level() {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      return Math.sqrt(sum / samples.length);
    },
    startRecording() {
      const mine: Blob[] = (chunks = []);
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => e.data.size && mine.push(e.data);
      recorder.start();
    },
    stopRecording() {
      const r = recorder;
      const mine = chunks;
      recorder = null;
      if (!r || r.state === 'inactive') return Promise.resolve(null);
      return new Promise((resolve) => {
        r.onstop = () => resolve(mine.length ? new Blob(mine, { type: r.mimeType }) : null);
        r.stop();
      });
    },
    close() {
      if (recorder?.state === 'recording') recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}

interface Props {
  onText: (chunk: string) => void;
  /** After Stop, once every phrase is written: split the thought into points. */
  onFinished: () => void;
  /** The main action only while nothing is written yet. */
  primary: boolean;
  /** Language of the thought so far; unknown (empty text): the speech service detects it. */
  speechLang?: string;
}

export function LiveVoiceControls({ onText, onFinished, primary, speechLang }: Props) {
  const { t } = useT();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [state, setState] = useState<DictationState>('idle');
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Latest props and spoken language, read by the long-lived session (no stale closures).
  const latest = useRef({ onText, onFinished, speechLang });
  useLayoutEffect(() => {
    latest.current = { onText, onFinished, speechLang };
  });
  const sessionRef = useRef<DictationSession | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/health/stt')
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => alive && setAvailable(!!h?.ok))
      .catch(() => alive && setAvailable(false));
    return () => {
      alive = false;
      void sessionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (state !== 'listening') return;
    const id = setInterval(() => sessionRef.current?.tick(performance.now()), 50);
    return () => clearInterval(id);
  }, [state]);

  const session = () =>
    (sessionRef.current ??= new DictationSession({
      openMic: openBrowserMic,
      transcribe: async (audio) => {
        // Never the interface language: an English interface must not make Whisper translate Turkish speech.
        const res = await fetch(`/api/stt?lang=${latest.current.speechLang ?? ''}`, { method: 'POST', body: audio });
        const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok) throw new Error(body.error ?? `speech service HTTP ${res.status}`);
        return body.text ?? '';
      },
      onText: (text) => {
        setError(null);
        latest.current.onText(text);
      },
      onState: (s, detail) => {
        setState(s);
        if (detail) setError(s === 'error' && /denied|not allowed|notfound|permission/i.test(detail) ? t.voiceMic : detail);
      },
      onPending: setPending,
      onFinished: () => latest.current.onFinished(),
    }));

  const start = () => {
    setError(null);
    void session().start();
  };

  if (available === false) {
    return (
      <div className="voice-controls-container">
        <p className="voice-disclosure small muted" role="note">{t.voiceNone}</p>
      </div>
    );
  }

  return (
    <div className="voice-controls-container" aria-label={t.voiceStart}>
      <div className="row between voice-bar">
        <div className="row voice-actions">
          {(state === 'idle' || state === 'error' || state === 'starting') && (
            <button id="voice-start" type="button" className={`btn ${primary ? 'primary' : ''}`} onClick={start} disabled={!available || state === 'starting'}>
              <Icon name="mic" /> {state === 'error' ? t.voiceRetry : t.voiceStart}
            </button>
          )}
          {state === 'listening' && (
            <button id="voice-pause" type="button" className="btn" onClick={() => void sessionRef.current?.pause()}>
              <Icon name="pause" /> {t.voicePause}
            </button>
          )}
          {state === 'paused' && (
            <button id="voice-resume" type="button" className="btn primary" onClick={start}>
              <Icon name="play" /> {t.voiceResume}
            </button>
          )}
          {(state === 'listening' || state === 'paused') && (
            <button id="voice-stop" type="button" className="btn ghost" onClick={() => void sessionRef.current?.stop()}>
              <Icon name="stop" /> {t.voiceStop}
            </button>
          )}
        </div>
        <span className="badge muted voice-status-badge" role="status" aria-live="polite">
          {state === 'listening' && <span className="dot dot-busy" aria-hidden="true" />}
          {state === 'listening' ? t.voiceListening : state === 'paused' ? t.voicePaused : t.voiceReady}
          {pending > 0 && ` · ${t.voiceTranscribing}`}
        </span>
      </div>
      <p className="voice-disclosure small muted" role="note">{t.voiceLocal}</p>
      {error && (
        <div className="voice-error small" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
