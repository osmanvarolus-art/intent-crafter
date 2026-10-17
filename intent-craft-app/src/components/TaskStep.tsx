import { useState } from 'react';
import { packageStatus, readiness } from '../domain/logic.ts';
import type { Evidence, ReadinessCheck, Workspace } from '../domain/types.ts';
import { useT } from '../i18n.ts';
import type { Step } from './Steps.tsx';
import { Icon } from './Icon.tsx';

/** Which step fixes a failing check. */
const FIX: Record<ReadinessCheck['id'], Step> = {
  has_confirmed: 'check',
  confirmed_current: 'check',
  quotes_valid: 'check',
  questions_answered: 'questions',
  agent_precheck: 'questions',
};

export function TaskStep({ ws, onPrepare, onAddEvidence, onEvidence, onGo }: {
  ws: Workspace;
  onPrepare: () => void;
  onAddEvidence: (report: string) => void;
  onEvidence: (id: string, status: Evidence['status']) => void;
  onGo: (s: Step) => void;
}) {
  const { t, lang } = useT();
  const [report, setReport] = useState('');
  const [copied, setCopied] = useState(false);
  const missing = readiness(ws).filter((c) => !c.ok);
  const status = packageStatus(ws);
  const verified = ws.evidence.filter((e) => e.status === 'verified').length;
  const decisions = ws.cards.filter((c) => c.approval === 'confirmed' && c.type !== 'question').length;
  const answers = ws.cards.filter((c) => c.type === 'question' && c.answer).length;
  const leftToAgent = ws.cards.filter((c) => c.type === 'question' && !c.answer && c.approval === 'rejected').length;

  const copy = async () => {
    if (!ws.pkg) return;
    await navigator.clipboard.writeText(ws.pkg.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const download = () => {
    if (!ws.pkg) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ws.pkg.markdown], { type: 'text/markdown' }));
    a.download = 'intentcraft-task.md';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="step-body">
      <div className="step-head">
        <p>{t.stepTaskIntro}</p>
        {status !== 'current' && (
          <button id="prepare" className={`btn ${ws.pkg ? '' : 'primary'}`} onClick={onPrepare} disabled={missing.length > 0}>
            {ws.pkg ? t.prepareAgain : t.prepare}
          </button>
        )}
      </div>

      {missing.length > 0 && (
        <div className="missing" role="status">
          <p className="missing-title">{t.missing}</p>
          <ul>
            {missing.map((c) => (
              <li key={c.id} className="row">
                <span className="grow">{t.check[c.id]}{c.failing > 1 ? ` (${c.failing})` : ''}</span>
                <button className="btn ghost" onClick={() => onGo(FIX[c.id])}>
                  {t.goTo}: {t.steps[FIX[c.id]]} <Icon name="arrow" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ws.pkg && (
        <section className="package" aria-label={t.tabTask}>
          {status === 'current' ? (
            <p className="handoff" role="status">{t.handoffReady(decisions, answers, leftToAgent)}</p>
          ) : (
            <p className="small pkg-status pkg-needs_review" role="status">{t.pkgStale}</p>
          )}
          <div className="row">
            <button id="copy" className={`btn ${status === 'current' ? 'primary' : ''}`} onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} /> {copied ? t.copied : t.copy}
            </button>
            <button id="download" className="btn ghost" onClick={download}>
              <Icon name="download" /> {t.download}
            </button>
            <span className="muted small">{t.preparedAt} {new Date(ws.pkg.createdAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
          <details className="task-text">
            <summary>{t.taskText}</summary>
            <pre id="task-markdown" className="markdown" tabIndex={0}>{ws.pkg.markdown}</pre>
          </details>
        </section>
      )}

      <details className="evidence-box" open={ws.evidence.length > 0}>
        <summary>{t.evidenceTitle}{ws.evidence.length ? ` · ${t.evidenceSummary(verified, ws.evidence.length)}` : ''}</summary>
        <p className="muted small">{t.evidenceHint}</p>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); onAddEvidence(report); setReport(''); }}>
          <label htmlFor="evidence-input" className="sr-only">{t.tabEvidence}</label>
          <textarea id="evidence-input" rows={3} value={report} placeholder={t.evidencePlaceholder} onChange={(e) => setReport(e.target.value)} />
          <div><button className="btn" type="submit" disabled={!report.trim()}>{t.addEvidence}</button></div>
        </form>
        {ws.evidence.length > 0 && (
          <ul className="evidence">
            {ws.evidence.map((e) => (
              <li key={e.id} className={`ev ev-${e.status}`}>
                <span className="grow">{e.claim}</span>
                <span className={`badge ev-badge-${e.status}`}>{t.evidenceStatus[e.status]}</span>
                {e.status !== 'verified' && <button className="btn" onClick={() => onEvidence(e.id, 'verified')}>{t.verify}</button>}
                {e.status !== 'disputed' && <button className="btn ghost" onClick={() => onEvidence(e.id, 'disputed')}>{t.dispute}</button>}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
