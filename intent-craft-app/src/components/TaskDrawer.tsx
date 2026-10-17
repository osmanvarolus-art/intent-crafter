import { useState } from 'react';
import { packageStatus, readiness } from '../domain/logic.ts';
import type { Evidence, Workspace } from '../domain/types.ts';
import { useT } from '../i18n.ts';

type Tab = 'readiness' | 'task' | 'evidence';

export function TaskDrawer({ ws, onPrepare, onAddEvidence, onEvidence }: {
  ws: Workspace;
  onPrepare: () => void;
  onAddEvidence: (report: string) => void;
  onEvidence: (id: string, status: Evidence['status']) => void;
}) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('readiness');
  const [report, setReport] = useState('');
  const [copied, setCopied] = useState(false);
  const checks = readiness(ws);
  const okCount = checks.filter((c) => c.ok).length;
  const ready = okCount === checks.length;
  const status = packageStatus(ws);
  const verified = ws.evidence.filter((e) => e.status === 'verified').length;

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

  const tabs: Array<[Tab, string]> = [
    ['readiness', `${t.tabReadiness} · ${okCount}/${checks.length}`],
    ['task', t.tabTask + (status === 'needs_review' ? ' ·  !' : '')],
    ['evidence', `${t.tabEvidence} · ${verified}/${ws.evidence.length}`],
  ];

  return (
    <section className="drawer" aria-labelledby="drawer-h">
      <div className="drawer-head">
        <h2 id="drawer-h">{t.drawerTitle}</h2>
        <div role="tablist" aria-label={t.drawerTitle} className="tabs">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              id={`tab-${id}`}
              role="tab"
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              className="tab"
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button id="prepare" className="btn primary" onClick={() => { onPrepare(); setTab('task'); }} disabled={!ready}
          title={ready ? undefined : t.prepareBlocked}>
          {t.prepare}
        </button>
      </div>

      {tab === 'readiness' && (
        <div id="panel-readiness" role="tabpanel" aria-labelledby="tab-readiness" className="drawer-body">
          <p className="small"><strong>{t.checksMet(okCount, checks.length)}</strong></p>
          <ul className="checks">
            {checks.map((c) => (
              <li key={c.id} className={c.ok ? 'ok' : 'fail'}>
                <span className="check-icon" aria-hidden="true">{c.ok ? '✓' : '•'}</span>
                <span>{t.check[c.id]}</span>
                {!c.ok && <span className="muted small">{t.failing(c.failing)}</span>}
              </li>
            ))}
          </ul>
          {!ready && <p className="muted small">{t.prepareBlocked}</p>}
        </div>
      )}

      {tab === 'task' && (
        <div id="panel-task" role="tabpanel" aria-labelledby="tab-task" className="drawer-body">
          {status === 'none' && <p className="muted">{t.pkgNone}</p>}
          {ws.pkg && (
            <>
              <p className={`small pkg-status pkg-${status}`} role="status">
                {status === 'current' ? t.pkgCurrent : t.pkgStale} · {t.preparedAt} {new Date(ws.pkg.createdAt).toLocaleString()}
              </p>
              <pre id="task-markdown" className="markdown" tabIndex={0}>{ws.pkg.markdown}</pre>
              <div className="row">
                <button id="copy" className="btn" onClick={copy}>{copied ? t.copied : t.copy}</button>
                <button id="download" className="btn ghost" onClick={download}>{t.download}</button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'evidence' && (
        <div id="panel-evidence" role="tabpanel" aria-labelledby="tab-evidence" className="drawer-body">
          <p className="muted small">{t.evidenceHint}</p>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); onAddEvidence(report); setReport(''); }}>
            <label htmlFor="evidence-input" className="sr-only">{t.tabEvidence}</label>
            <textarea id="evidence-input" rows={3} value={report} placeholder={t.evidencePlaceholder} onChange={(e) => setReport(e.target.value)} />
            <div><button className="btn" type="submit" disabled={!report.trim()}>{t.addEvidence}</button></div>
          </form>
          {!ws.evidence.length ? (
            <p className="muted small">{t.evidenceEmpty}</p>
          ) : (
            <>
              <p className="small"><strong>{t.evidenceSummary(verified, ws.evidence.length)}</strong></p>
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
            </>
          )}
        </div>
      )}
    </section>
  );
}
