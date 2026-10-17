import { useRef } from 'react';
import type { SourceRef } from '../domain/types.ts';
import { appendFinalTranscript } from '../domain/voice.ts';
import { useT } from '../i18n.ts';
import { LiveVoiceControls } from './LiveVoiceControls.tsx';

interface Props {
  text: string;
  highlight?: SourceRef;
  highlightValid: boolean;
  onChange: (text: string) => void;
  onAnalyze: () => void;
  onNaturalPause: () => void;
}

export function ThoughtPanel({
  text,
  highlight,
  highlightValid,
  onChange,
  onAnalyze,
  onNaturalPause,
}: Props) {
  const { t } = useT();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cursorPosRef = useRef<number>(text.length);

  const handleCursorUpdate = () => {
    if (textareaRef.current) {
      cursorPosRef.current = textareaRef.current.selectionStart;
    }
  };

  const handleAppendVoice = (chunk: string) => {
    const currentPos = cursorPosRef.current;
    const { text: updatedText, nextCursor } = appendFinalTranscript(text, chunk, currentPos);
    onChange(updatedText);
    cursorPosRef.current = nextCursor;

    // Restore focus and cursor position smoothly if user had textarea focused
    if (textareaRef.current && document.activeElement === textareaRef.current) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = nextCursor;
          textareaRef.current.selectionEnd = nextCursor;
        }
      }, 0);
    }
  };

  const hl = highlight && highlightValid ? highlight : undefined;

  return (
    <section className="panel" aria-labelledby="thought-h">
      <div className="panel-head">
        <h2 id="thought-h">{t.thoughtTitle}</h2>
        <p className="muted small">{t.thoughtHint}</p>
      </div>

      {/* Live Voice Controls beside/above the thought editor */}
      <LiveVoiceControls
        onFinalText={handleAppendVoice}
        onNaturalPause={onNaturalPause}
      />

      <label htmlFor="thought" className="sr-only">
        {t.thoughtTitle}
      </label>
      <textarea
        ref={textareaRef}
        id="thought"
        className="thought-input"
        value={text}
        placeholder={t.thoughtPlaceholder}
        onChange={(e) => {
          cursorPosRef.current = e.target.selectionStart;
          onChange(e.target.value);
        }}
        onSelect={handleCursorUpdate}
        onClick={handleCursorUpdate}
        onKeyUp={handleCursorUpdate}
        rows={7}
      />

      <div className="row between">
        <span className="muted small">
          {text.length} {t.chars}
        </span>
        <button
          id="analyze"
          className="btn primary"
          onClick={onAnalyze}
          disabled={!text.trim()}
          title="Analyze current thought and suggest structured cards"
        >
          {t.analyze}
        </button>
      </div>
      <p className="muted small">{t.analyzeHint}</p>

      <div className="source-view" aria-labelledby="source-h">
        <h3 id="source-h" className="eyebrow">
          {t.sourceTitle}
        </h3>
        <p className="muted small">{t.sourceHint}</p>
        <p className="source-text">
          {!text && <span className="muted">{t.sourceEmpty}</span>}
          {hl ? (
            <>
              {text.slice(0, hl.start)}
              <mark id="source-highlight">{text.slice(hl.start, hl.end)}</mark>
              {text.slice(hl.end)}
            </>
          ) : (
            text
          )}
        </p>
      </div>
    </section>
  );
}
