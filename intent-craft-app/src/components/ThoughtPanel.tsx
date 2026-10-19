import { useEffect, useRef } from 'react';
import type { SourceRef } from '../domain/types.ts';
import { useT } from '../i18n.ts';
import { LiveVoiceControls } from './LiveVoiceControls.tsx';
import { textLang } from '../domain/voice.ts';
import { Icon } from './Icon.tsx';

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
  onVoiceFinished: () => void;
}

export function ThoughtPanel({ text, highlight, highlightValid, onChange, onVoiceText, onAnalyze, onVoiceFinished, splitting, analyzePrimary }: Props & { splitting: boolean; analyzePrimary: boolean }) {
  const { t } = useT();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleVoice = (chunk: string) => {
    const el = textareaRef.current;
    const focused = !!el && document.activeElement === el;
    onVoiceText(chunk, focused ? el.selectionStart : undefined, (pos) => {
      if (focused) requestAnimationFrame(() => el.setSelectionRange(pos, pos));
    });
  };

  // Clicking a point shows its exact words inside your own text (selected), not in a second copy of it.
  const hl = highlight && highlightValid ? highlight : undefined;
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !hl) return;
    el.setSelectionRange(hl.start, hl.end);
    el.blur(); // focusing again scrolls the selected words into view
    el.focus();
  }, [hl?.start, hl?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="panel" aria-labelledby="thought-h">
      <div className="panel-head">
        <h2 id="thought-h">{t.thoughtTitle}</h2>
        <p className="muted small">{t.stepTellHint}</p>
      </div>

      <LiveVoiceControls onText={handleVoice} onFinished={onVoiceFinished} primary={!text.trim()} speechLang={textLang(text)} />

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
        rows={12}
      />

      <div className="row between">
        <span className="muted small">
          {text.length} {t.chars}
        </span>
        <button
          id="analyze"
          className={`btn ${analyzePrimary ? 'primary' : ''}`}
          onClick={onAnalyze}
          disabled={!text.trim() || splitting}
        >
          {splitting ? t.splitting : <>{t.splitIdea} <Icon name="arrow" size={14} /></>}
        </button>
      </div>
    </section>
  );
}
