import { useCallback, useEffect, useState } from 'react';
import { useToasts } from './Toast';

type Tab = 'explain' | 'plan' | 'implement' | 'verify';

interface PlanSummary {
  id: string;
  title: string;
  status: string;
  taskCount: number;
}

interface ChangeSetSummary {
  id: string;
  title: string;
  planId: string;
  status: string;
  fileCount: number;
}

interface CollabRecordSummary {
  id: string;
  changeSetId: string;
  status: string;
}

async function postAPI(path: string, body: unknown): Promise<any> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function getAPI(path: string): Promise<any> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function ActionPanel() {
  const { addToast } = useToasts();
  const [tab, setTab] = useState<Tab>('explain');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultSource, setResultSource] = useState<string | null>(null);

  // Explain state
  const [explainTarget, setExplainTarget] = useState('');

  // Plan state
  const [planGoal, setPlanGoal] = useState('');
  const [plans, setPlans] = useState<PlanSummary[]>([]);

  // Implement state
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [changeSets, setChangeSets] = useState<ChangeSetSummary[]>([]);

  // Verify state
  const [selectedCSId, setSelectedCSId] = useState('');
  const [collabRecords, setCollabRecords] = useState<CollabRecordSummary[]>([]);

  const loadPlans = useCallback(async () => {
    try {
      const data = await getAPI('/api/plans');
      setPlans(data.plans || []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadChangeSets = useCallback(async () => {
    try {
      const data = await getAPI('/api/changesets');
      setChangeSets(data.changeSets || []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadCollabRecords = useCallback(async () => {
    try {
      const data = await getAPI('/api/approvals');
      setCollabRecords(data.pending || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);
  useEffect(() => {
    loadChangeSets();
  }, [loadChangeSets]);
  useEffect(() => {
    loadCollabRecords();
  }, [loadCollabRecords]);

  const handleExplain = async () => {
    if (!explainTarget.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const data = await postAPI('/api/explain', { target: explainTarget.trim() });
      setResult(data.content);
      setResultSource(data.source);
      addToast({ type: 'info', message: `Explain: ${data.source} tier` });
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
      setResultSource('error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreatePlan = async () => {
    if (!planGoal.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const data = await postAPI('/api/plans', { goal: planGoal.trim() });
      setResult(
        `Plan "${data.plan.title}" created (${data.source}):\n${data.plan.tasks?.map((t: any) => `  • ${t.description}`).join('\n') || '  No tasks defined'}`,
      );
      setResultSource(data.source);
      setPlanGoal('');
      loadPlans();
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
      setResultSource('error');
    } finally {
      setBusy(false);
    }
  };

  const handleApprovePlan = async (planId: string) => {
    setBusy(true);
    try {
      const data = await postAPI(`/api/plans/${planId}/approve`, {});
      setResult(`Plan "${data.plan?.title}" approved`);
      setResultSource('system');
      loadPlans();
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
      setResultSource('error');
    } finally {
      setBusy(false);
    }
  };

  const handleImplement = async () => {
    if (!selectedPlanId) return;
    setBusy(true);
    setResult(null);
    try {
      const data = await postAPI('/api/implement', { planId: selectedPlanId });
      setResult(
        `Change Set "${data.changeSet.title}" created (${data.source}):\n${data.changeSet.changes?.map((c: any) => `  • ${c.filePath}`).join('\n') || '  No file changes'}`,
      );
      setResultSource(data.source);
      loadChangeSets();
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
      setResultSource('error');
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    if (!selectedCSId) return;
    setBusy(true);
    try {
      const data = await postAPI('/api/implement/apply', { changeSetId: selectedCSId });
      addToast({ type: 'success', message: `Changes applied: ${data.changeSet.title}` });
      setResult(`Change Set "${data.changeSet.title}" applied to disk`);
      setResultSource('system');
      loadChangeSets();
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!selectedCSId) return;
    setBusy(true);
    setResult(null);
    try {
      const data = await postAPI('/api/verify', { changeSetId: selectedCSId });
      const checks =
        data.report?.checks?.map((c: any) => `  ${c.status === 'passed' ? '✓' : '✗'} ${c.type}`).join('\n') || '';
      setResult(`Verification ${data.report.status}:\n${checks}`);
      setResultSource('system');
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
      setResultSource('error');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (changeSetId: string, planId: string) => {
    try {
      await postAPI('/api/collab/submit', { changeSetId, planId });
      addToast({ type: 'success', message: 'Submitted for review' });
      loadCollabRecords();
    } catch (err: any) {
      addToast({ type: 'error', message: err.message });
    }
  };

  const handleApprove = async (recordId: string) => {
    try {
      await postAPI('/api/collab/approve', { recordId });
      addToast({ type: 'success', message: 'Approved' });
      loadCollabRecords();
    } catch (err: any) {
      addToast({ type: 'error', message: err.message });
    }
  };

  const handleReject = async (recordId: string) => {
    try {
      await postAPI('/api/collab/reject', { recordId, reason: 'Rejected from dashboard' });
      addToast({ type: 'error', message: 'Rejected' });
      loadCollabRecords();
    } catch (err: any) {
      addToast({ type: 'error', message: err.message });
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'explain', label: 'Explain' },
    { key: 'plan', label: 'Plan' },
    { key: 'implement', label: 'Implement' },
    { key: 'verify', label: 'Verify' },
  ];

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setResult(null);
            }}
            className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
              tab === t.key
                ? 'text-accent border-b-2 border-accent bg-zinc-900/80'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {/* Explain */}
        {tab === 'explain' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-600">
              Explain any target — a module path, package name, architecture, or data flow.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. architecture, src/lib/api.ts, @vestara/workspace"
                value={explainTarget}
                onChange={(e) => setExplainTarget(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleExplain();
                }}
                className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
              />
              <button
                onClick={handleExplain}
                disabled={busy}
                className="px-4 py-2 accent-btn rounded text-sm font-medium disabled:opacity-40 cursor-pointer"
              >
                {busy ? '…' : 'Go'}
              </button>
            </div>
          </div>
        )}

        {/* Plan */}
        {tab === 'plan' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-600">
              Describe a goal for the repository and Vestara will create a structured plan.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Add input validation to the API"
                value={planGoal}
                onChange={(e) => setPlanGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreatePlan();
                }}
                className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
              />
              <button
                onClick={handleCreatePlan}
                disabled={busy}
                className="px-4 py-2 accent-btn rounded text-sm font-medium disabled:opacity-40 cursor-pointer"
              >
                {busy ? '…' : 'Create'}
              </button>
            </div>
            {plans.length > 0 && (
              <div>
                <p className="text-xs text-zinc-600 mb-2">Existing plans ({plans.length})</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {plans.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-zinc-300 truncate">{p.title}</div>
                        <div className="text-zinc-600">
                          {p.id} · {p.status} · {p.taskCount} tasks
                        </div>
                      </div>
                      {p.status === 'draft' && (
                        <button
                          onClick={() => handleApprovePlan(p.id)}
                          className="px-2 py-1 bg-green-400/10 text-green-400 rounded hover:bg-green-400/20 shrink-0 ml-2 cursor-pointer"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Implement */}
        {tab === 'implement' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-600">
              Select an approved plan and generate a Change Set with proposed file changes.
            </p>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-300 focus:outline-none focus:border-zinc-700"
            >
              <option value="">Select a plan…</option>
              {plans
                .filter((p) => p.status === 'approved')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.id})
                  </option>
                ))}
            </select>
            <button
              onClick={handleImplement}
              disabled={busy || !selectedPlanId}
              className="w-full py-2 accent-btn rounded text-sm font-medium disabled:opacity-40 cursor-pointer"
            >
              {busy ? 'Generating…' : 'Generate Change Set'}
            </button>
            {changeSets.length > 0 && (
              <div>
                <p className="text-xs text-zinc-600 mb-2">Change Sets ({changeSets.length})</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {changeSets.map((cs) => (
                    <div
                      key={cs.id}
                      className="flex items-center justify-between px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs"
                    >
                      <span className="text-zinc-300 truncate min-w-0 flex-1">{cs.title}</span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-zinc-600">{cs.status}</span>
                        <button
                          onClick={() => setSelectedCSId(cs.id)}
                          className="text-accent hover:text-zinc-300 cursor-pointer"
                        >
                          Select
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Verify */}
        {tab === 'verify' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-600">
              Verify a Change Set — runs filesystem checks, typecheck, tests, and build validation.
            </p>
            <select
              value={selectedCSId}
              onChange={(e) => setSelectedCSId(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-300 focus:outline-none focus:border-zinc-700"
            >
              <option value="">Select a change set…</option>
              {changeSets.map((cs) => (
                <option key={cs.id} value={cs.id}>
                  {cs.title} ({cs.id})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleVerify}
                disabled={busy || !selectedCSId}
                className="flex-1 py-2 accent-btn rounded text-sm font-medium disabled:opacity-40 cursor-pointer"
              >
                {busy ? 'Verifying…' : 'Verify'}
              </button>
              <button
                onClick={handleApply}
                disabled={busy || !selectedCSId}
                className="flex-1 py-2 bg-green-400/10 border border-green-400/30 text-green-400 rounded text-sm font-medium hover:bg-green-400/20 disabled:opacity-40 transition-colors cursor-pointer"
              >
                Apply to Disk
              </button>
            </div>

            {/* Collaboration */}
            {collabRecords.length > 0 && (
              <div className="pt-2 border-t border-zinc-800">
                <p className="text-xs text-zinc-600 mb-2">Pending Reviews ({collabRecords.length})</p>
                <div className="space-y-1">
                  {collabRecords.map((cr) => (
                    <div
                      key={cr.id}
                      className="flex items-center justify-between px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs"
                    >
                      <span className="text-zinc-400 truncate min-w-0 flex-1">{cr.changeSetId}</span>
                      <div className="flex gap-1 shrink-0 ml-2">
                        <button
                          onClick={() => handleApprove(cr.id)}
                          className="px-2 py-1 bg-green-400/10 text-green-400 rounded hover:bg-green-400/20 cursor-pointer"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => handleReject(cr.id)}
                          className="px-2 py-1 bg-red-400/10 text-red-400 rounded hover:bg-red-400/20 cursor-pointer"
                        >
                          ✗
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Result output */}
        {result && (
          <div className="mt-3 p-3 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-400 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
            {resultSource && <div className="text-xs text-zinc-600 mb-1">Source: {resultSource}</div>}
            {result}
          </div>
        )}
      </div>
    </div>
  );
}
