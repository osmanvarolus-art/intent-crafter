import { useT } from '../i18n.ts';
import { Icon } from './Icon.tsx';

interface Props {
  /** Shown only when something needs saying (e.g. the model was not reachable). */
  notice?: string;
  noticeDetail?: string;
  onNewIdea: () => void;
  saving: boolean;
  saveFailed: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleLang: () => void;
}

export function Header({ notice, noticeDetail, onNewIdea, saving, saveFailed, canUndo, canRedo, onUndo, onRedo, onToggleLang }: Props) {
  const { t } = useT();
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">◇</span>
        <div>
          <h1>IntentCraft</h1>
          <p className="muted small">{t.appTag}</p>
        </div>
      </div>
      {notice && (
        <p className="demo-banner" role="note" title={noticeDetail}>
          {notice}
        </p>
      )}
      <div className="toolbar">
        <span className="save-status small" aria-live="polite">
          <span className={`dot ${saveFailed ? 'dot-fail' : saving ? 'dot-busy' : 'dot-ok'}`} aria-hidden="true" />
          {saveFailed ? t.saveFailed : saving ? t.saving : t.saved}
        </span>
        <button id="new-idea" className="btn" onClick={onNewIdea} title={t.newIdeaHint}>
          <Icon name="plus" /> {t.newIdea}
        </button>
        <button id="undo" className="btn ghost" onClick={onUndo} disabled={!canUndo} aria-keyshortcuts="Control+Z">
          {t.undo}
        </button>
        <button id="redo" className="btn ghost" onClick={onRedo} disabled={!canRedo} aria-keyshortcuts="Control+Shift+Z">
          {t.redo}
        </button>
        <button id="lang" className="btn ghost" onClick={onToggleLang} aria-label={t.languageLabel}>
          {t.language}
        </button>
      </div>
    </header>
  );
}
