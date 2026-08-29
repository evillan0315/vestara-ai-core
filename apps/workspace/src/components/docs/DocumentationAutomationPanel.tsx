import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type DocumentationFinding,
  type DocumentationPlan,
  type DocumentationProposal,
  type DocumentationReport,
  type DocumentationStatus,
  type DocumentationStandard,
  documentationApi,
} from '../../lib/documentation';

type Tab = 'overview' | 'findings' | 'plans' | 'proposals' | 'reports' | 'standards' | 'coverage';

export function DocumentationAutomationPanel() {
  const [tab, setTab] = useState<Tab>('overview');
  const [status, setStatus] = useState<DocumentationStatus | null>(null);
  const [findings, setFindings] = useState<DocumentationFinding[]>([]);
  const [plans, setPlans] = useState<DocumentationPlan[]>([]);
  const [proposals, setProposals] = useState<DocumentationProposal[]>([]);
  const [reports, setReports] = useState<DocumentationReport[]>([]);
  const [standards, setStandards] = useState<DocumentationStandard[]>([]);
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set());
  const [selectedProposal, setSelectedProposal] = useState<DocumentationProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextStatus, nextFindings, nextPlans, nextProposals, nextReports, nextStandards] = await Promise.all([
      documentationApi.status(), documentationApi.findings(), documentationApi.plans(), documentationApi.proposals(), documentationApi.reports(), documentationApi.standards(),
    ]);
    setStatus(nextStatus); setFindings(nextFindings); setPlans(nextPlans); setProposals(nextProposals); setReports(nextReports); setStandards(nextStandards);
  }, []);
  useEffect(() => { void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause))); }, [refresh]);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await action(); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };
  const counts = useMemo(() => ({
    error: findings.filter((item) => item.severity === 'error').length,
    warning: findings.filter((item) => item.severity === 'warning').length,
  }), [findings]);
  const inventory = status?.inventory;

  return (
    <section className="doc-review" aria-label="Documentation review workspace">
      <header className="doc-review-header">
        <div><strong>Documentation automation</strong><span>{status?.lastScan ? `Scanned ${new Date(status.lastScan).toLocaleString()}` : 'Not scanned'}</span></div>
        <nav>{(['overview', 'findings', 'plans', 'proposals', 'reports', 'standards', 'coverage'] as Tab[]).map((item) => <button type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}<small>{item === 'findings' ? findings.length : item === 'plans' ? plans.length : item === 'proposals' ? proposals.length : item === 'reports' ? reports.length : item === 'standards' ? standards.length : ''}</small></button>)}</nav>
        <div className="doc-review-actions"><button type="button" disabled={busy} onClick={() => void act(documentationApi.scan)}>Scan</button><button type="button" disabled={busy} onClick={() => void act(documentationApi.verify)}>Verify</button></div>
      </header>
      {error && <p className="doc-review-error" role="alert">{error}</p>}

      {tab === 'overview' && <div className="doc-review-overview">
        {Object.entries({ Health: status?.health?.overall, Documents: inventory?.documents, Missing: inventory?.missing, Invalid: inventory?.invalid, Errors: counts.error, Warnings: counts.warning, Proposals: status?.pendingProposals }).map(([label, value]) => <article key={label}><span>{label}</span><strong>{value ?? '—'}{label === 'Health' && value !== undefined ? '%' : ''}</strong></article>)}
        {status?.health && <div className="doc-health-breakdown">{Object.entries(status.health).filter(([key]) => key !== 'overall').map(([key, value]) => <label key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><progress max="100" value={value} /><b>{value}%</b></label>)}</div>}
      </div>}

      {tab === 'findings' && <div className="doc-review-list">
        <div className="doc-review-toolbar"><span>{counts.error} errors · {counts.warning} warnings</span><button type="button" disabled={busy || selectedFindings.size === 0} onClick={() => void act(async () => { await documentationApi.createPlan([...selectedFindings]); setSelectedFindings(new Set()); })}>Create plan ({selectedFindings.size})</button></div>
        {findings.map((finding) => <label className={`doc-review-row severity-${finding.severity}`} key={finding.id}><input type="checkbox" checked={selectedFindings.has(finding.id)} onChange={() => setSelectedFindings((current) => { const next = new Set(current); next.has(finding.id) ? next.delete(finding.id) : next.add(finding.id); return next; })} /><span><strong>{finding.message}</strong><small>{finding.ruleId} · {finding.evidence.map((item) => item.ref).join(', ')}</small></span><b>{finding.severity}</b></label>)}
      </div>}

      {tab === 'plans' && <div className="doc-review-list">{plans.map((plan) => <article className="doc-review-card" key={plan.id}><header><strong>{plan.id}</strong><span>{plan.status} · {plan.tasks.length} tasks</span><button type="button" disabled={busy || plan.status === 'completed'} onClick={() => void act(() => documentationApi.runPlan(plan.id))}>Run dry-run</button></header>{plan.tasks.map((task) => <div className="doc-task" key={task.id}><span>{task.title}</span><small>{task.role} · depends on {task.dependsOn.length}</small></div>)}</article>)}</div>}

      {tab === 'proposals' && <div className="doc-proposal-layout"><div className="doc-review-list">{proposals.map((proposal) => <button type="button" className={`doc-review-row ${selectedProposal?.id === proposal.id ? 'selected' : ''}`} key={proposal.id} onClick={() => setSelectedProposal(proposal)}><span><strong>{proposal.documentPath}</strong><small>{proposal.operation} · {proposal.authority} · validation {proposal.validationResult.valid ? 'passed' : 'failed'}</small></span><b>{proposal.status}</b></button>)}</div>{selectedProposal && <aside className="doc-proposal-detail"><h3>{selectedProposal.documentPath}</h3><p>{selectedProposal.rationale}</p><pre>{selectedProposal.proposedContent}</pre><div>{selectedProposal.status === 'proposed' && <><button type="button" disabled={busy} onClick={() => void act(() => documentationApi.proposalAction(selectedProposal.id, 'approve'))}>Approve</button><button type="button" disabled={busy} onClick={() => void act(() => documentationApi.proposalAction(selectedProposal.id, 'reject'))}>Reject</button></>}{selectedProposal.status === 'approved' && <button type="button" disabled={busy || !selectedProposal.validationResult.valid} onClick={() => void act(() => documentationApi.proposalAction(selectedProposal.id, 'apply'))}>Apply verified proposal</button>}</div></aside>}</div>}

      {tab === 'reports' && <div className="doc-review-list">{reports.map((report) => <article className="doc-review-card" key={report.id}><header><strong>{report.id}</strong><span>{new Date(report.generatedAt).toLocaleString()}</span></header><div className="doc-report-scores">{Object.entries(report.health).map(([key, value]) => <span key={key}>{key}: <b>{value}%</b></span>)}</div></article>)}</div>}

      {tab === 'standards' && <div className="doc-review-list">{standards.map((standard) => <article className="doc-review-card" key={standard.id}><header><strong>{standard.id}</strong><span>{standard.severity} · {standard.profiles.join(', ')}</span></header><p>{standard.description}</p></article>)}</div>}

      {tab === 'coverage' && <div className="doc-review-overview"><article><span>Package completeness</span><strong>{status?.health?.completeness ?? '—'}%</strong></article><article><span>Implementation alignment</span><strong>{status?.health?.implementationAlignment ?? '—'}%</strong></article><article><span>Link integrity</span><strong>{status?.health?.linkIntegrity ?? '—'}%</strong></article><article><span>Verification</span><strong>{status?.health?.verification ?? '—'}%</strong></article><a className="doc-graph-link" href="/graph">Open documentation relationships in Engineering Graph →</a></div>}
    </section>
  );
}
