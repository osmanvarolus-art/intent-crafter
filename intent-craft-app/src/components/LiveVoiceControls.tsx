import { useEffect, useRef, useState } from 'react';
import {
  mapBrowserSpeechError,
  processSpeechResults,
  type VoiceError,
  type VoiceState,
} from '../domain/voice.ts';

// Web Speech API interfaces
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [altIndex: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const getSpeechCtor = (): SpeechRecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

interface Props {
  onFinalText: (chunk: string) => void;
  onNaturalPause: () => void;
}

export function LiveVoiceControls({ onFinalText, onNaturalPause }: Props) {
  const [state, setState] = useState<VoiceState>('idle');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<VoiceError | null>(null);
  const [showDisclosure, setShowDisclosure] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const lastFinalIndexRef = useRef<number>(-1);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPausedRef = useRef<boolean>(false);

  const SpeechCtor = getSpeechCtor();

  // Clean up recognition and timers on unmount
  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const triggerNaturalPause = () => {
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => {
      onNaturalPause();
    }, 1500);
  };

  const startListening = () => {
    setError(null);
    setInterimText('');
    isPausedRef.current = false;
    lastFinalIndexRef.current = -1;

    if (!SpeechCtor) {
      setError({
        type: 'unsupported',
        message: 'Speech recognition is not supported in this browser. Please use Google Chrome, Microsoft Edge, or another browser with Web Speech API support. Manual text entry remains fully usable.',
      });
      setState('error');
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }

      const rec = new SpeechCtor();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        if (!isPausedRef.current) {
          setState('listening');
        }
      };

      rec.onresult = (event: SpeechRecognitionEventLike) => {
        if (isPausedRef.current) return;

        setState('processing');

        const items: Array<{ index: number; transcript: string; isFinal: boolean }> = [];
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0]?.transcript || '';
          items.push({
            index: i,
            transcript,
            isFinal: res.isFinal,
          });
        }

        const { newFinalChunks, interimText: newInterim, nextLastFinalIndex } = processSpeechResults(
          items,
          lastFinalIndexRef.current,
        );

        lastFinalIndexRef.current = nextLastFinalIndex;
        setInterimText(newInterim);

        // Append finalized chunks without overwriting
        for (const chunk of newFinalChunks) {
          onFinalText(chunk);
        }

        setState('listening');
        triggerNaturalPause();
      };

      rec.onerror = (e) => {
        const mapped = mapBrowserSpeechError(e.error);
        setError(mapped);
        setState('error');
        setInterimText('');
      };

      rec.onend = () => {
        // If we are still supposed to be listening (and not paused or stopped), restart
        if (state === 'listening' && !isPausedRef.current) {
          try {
            rec.start();
          } catch {
            setState('idle');
          }
        } else if (!isPausedRef.current) {
          setState('idle');
          setInterimText('');
        }
      };

      recognitionRef.current = rec;
      rec.start();
      setState('listening');
    } catch (err) {
      setError({
        type: 'unknown',
        message: err instanceof Error ? err.message : 'Failed to start speech recognition.',
      });
      setState('error');
    }
  };

  const pauseListening = () => {
    isPausedRef.current = true;
    setState('paused');
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
  };

  const resumeListening = () => {
    isPausedRef.current = false;
    setError(null);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setState('listening');
        return;
      } catch {
        // Fallback to start fresh if needed
      }
    }
    startListening();
  };

  const stopListening = () => {
    isPausedRef.current = false;
    setState('idle');
    setInterimText('');
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    // Final pause trigger to suggest any concepts for completed speech
    onNaturalPause();
  };

  return (
    <div className="voice-controls-container" aria-label="Live Voice Controls">
      {/* Route disclosure note */}
      {showDisclosure && (
        <div className="voice-disclosure small muted">
          <span>
            <strong>Audio route disclosure:</strong> Local STT service not detected. Using browser Web Speech API. Audio recognition is handled by your browser (e.g. Google speech service on Chromium). No paid API is required.
          </span>
          <button
            type="button"
            className="btn ghost small"
            style={{ padding: '2px 6px', marginLeft: 'auto' }}
            onClick={() => setShowDisclosure(false)}
            aria-label="Dismiss disclosure notice"
          >
            ✕
          </button>
        </div>
      )}

      {/* Control bar */}
      <div className="row between voice-bar">
        <div className="row voice-actions">
          {state === 'idle' && (
            <button
              id="voice-start"
              type="button"
              className="btn primary"
              onClick={startListening}
              aria-label="Start Live Voice"
            >
              <span aria-hidden="true">🎙️</span> Start Live Voice
            </button>
          )}

          {state === 'listening' && (
            <>
              <button
                id="voice-pause"
                type="button"
                className="btn"
                onClick={pauseListening}
                aria-label="Pause Live Voice"
              >
                ⏸ Pause
              </button>
              <button
                id="voice-stop"
                type="button"
                className="btn ghost"
                onClick={stopListening}
                aria-label="Stop Live Voice"
              >
                ⏹ Stop
              </button>
            </>
          )}

          {state === 'paused' && (
            <>
              <button
                id="voice-resume"
                type="button"
                className="btn primary"
                onClick={resumeListening}
                aria-label="Resume Live Voice"
              >
                ▶ Resume
              </button>
              <button
                id="voice-stop"
                type="button"
                className="btn ghost"
                onClick={stopListening}
                aria-label="Stop Live Voice"
              >
                ⏹ Stop
              </button>
            </>
          )}

          {state === 'processing' && (
            <button
              id="voice-stop"
              type="button"
              className="btn ghost"
              onClick={stopListening}
              aria-label="Stop Live Voice"
            >
              ⏹ Stop
            </button>
          )}

          {state === 'error' && (
            <button
              id="voice-retry"
              type="button"
              className="btn primary"
              onClick={startListening}
              aria-label="Retry Live Voice"
            >
              🔄 Retry Voice
            </button>
          )}
        </div>

        {/* State Badge */}
        <div className="voice-status-badge">
          {state === 'listening' && (
            <span className="badge listening-badge" role="status">
              <span className="dot dot-busy" aria-hidden="true" /> Listening
            </span>
          )}
          {state === 'paused' && (
            <span className="badge paused-badge" role="status">
              ⏸ Paused
            </span>
          )}
          {state === 'processing' && (
            <span className="badge processing-badge" role="status">
              ⏳ Processing…
            </span>
          )}
          {state === 'idle' && (
            <span className="badge muted" role="status">
              Ready
            </span>
          )}
        </div>
      </div>

      {/* Interim text preview */}
      {interimText && (
        <div className="interim-preview" role="region" aria-live="polite">
          <span className="eyebrow">Interim Speech:</span>
          <p className="interim-text">“{interimText}”</p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="voice-error small" role="alert">
          <strong>Voice Error:</strong> {error.message}
        </div>
      )}
    </div>
  );
}
