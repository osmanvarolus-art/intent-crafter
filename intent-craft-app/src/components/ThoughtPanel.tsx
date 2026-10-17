import { useRef } from 'react';
import type { SourceRef } from '../domain/types.ts';
import { useT } from '../i18n.ts';
import { LiveVoiceControls } from './LiveVoiceControls.tsx';

interface Props {
  text: string;
  highlight?: SourceRef;
  highlightValid: boolean;
  onChange: (text: string) => void;
  /**
   * Spoken text: inserted at the cursor while the text box has focus, otherwise appended.
   * The parent applies it to the latest text and reports where the cursor ends up.
   */
  onVoiceText: (chunk: string, cursor: number | undefined, moveCursor: (pos: number) => void) => void;
  onAnalyze: () => void;
  onNaturalPause: () => void;
}

export function ThoughtPanel({ text, highlight, highlightValid, onChange, onVoiceText, onAnalyze, onNaturalPause }: Props) {
  const { t } = useT();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleVoice = (chunk: string) => {
    const el = textareaRef.current;
    const focused = !!el && document.activeElement === el;
    onVoiceText(chunk, focused ? el.selectionStart : undefined, (pos) => {
      if (focused) requestAnimationFrame(() => el.setSelectionRange(pos, pos));
    });
  };

  const hl = highlight && highlightValid ? highlight : undefined;

  return (
    <section className="panel" aria-labelledby="thought-h">
      <div className="panel-head">
        <h2 id="thought-h">{t.thoughtTitle}</h2>
        <p className="muted small">{t.thoughtHint}</p>
      </div>

      <LiveVoiceControls onText={handleVoice} onNaturalPause={onNaturalPause} />

      <label htmlFor="thought" className="sr-only">
        {t.thoughtTitle}
      </label>
      <textarea
        ref={textareaRef}
        id="thought"
        className="thought-input"
        value={text}
        placeholder={t.thoughtPlaceholder}
        onChange={(e) => onChange(e.target.value)}
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
