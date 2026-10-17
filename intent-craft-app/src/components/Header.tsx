import { useT } from '../i18n.ts';

interface Props {
  live: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleLang: () => void;
}

export function Header({ live, saving, canUndo, canRedo, onUndo, onRedo, onToggleLang }: Props) {
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
      {!live && (
        <p className="demo-banner" role="note">
          {t.demoBanner}
        </p>
      )}
      <div className="toolbar">
        <span className="save-status small" aria-live="polite">
          <span className={`dot ${saving ? 'dot-busy' : 'dot-ok'}`} aria-hidden="true" />
          {saving ? t.saving : t.saved}
        </span>
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
