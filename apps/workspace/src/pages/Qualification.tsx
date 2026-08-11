import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { reviewOf, stateLabel, TrialDetailPanel } from '../components/qualification/TrialDetailPanel.js';
import type { QualificationTrial } from '../lib/qualification.js';
import { qualificationClient } from '../lib/qualification.js';

function formatDuration(ms: number): string {
  return ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${Math.round(ms / 1_000)}s`;
}

const RUNNABLE_PROFILES = ['deepseekV4FlashOpenCodeGo', 'mimoV25OpenCodeGo'];

export default function Qualification() {
  const [trials, setTrials] = useState<QualificationTrial[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await qualificationClient.trials();
      setTrials(data.trials);
      setGeneratedAt(data.generatedAt);
      setSelected((current) => current ?? data.trials[0]?.profileId ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load qualification trials');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runTrial = useCallback(
    async (profileId: string) => {
      setRunning(profileId);
      setError(null);
      try {
        await qualificationClient.run(profileId);
        // Poll for the new report (the run writes asynchronously; trials are
        // advisory and take minutes).
        const deadline = Date.now() + 9 * 60_000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 3_000));
          const data = await qualificationClient.trials();
          if (data.generatedAt && data.generatedAt !== generatedAt && data.trials.some((trial) => trial.profileId === profileId)) {
            setSelected(profileId);
            await load();
            return;
          }
        }
        setError('Trial did not appear within the polling window — refresh to check.');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to start the trial');
      } finally {
        setRunning(null);
      }
    },
    [generatedAt, load],
  );

  const selectedTrial = trials.find((trial) => trial.profileId === selected) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-(--vestara-text)">Engineering Qualification</h1>
        <p className="text-[11px] text-(--vestara-text-muted)">
          Comparable live Planner/Reviewer trials (WFO-E2E-002B-LIVE) · role-scoped · no single winner score.
        </p>
      </div>

      {error && <div className="text-xs text-red-300">{error}</div>}

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-3">
        <span className="text-xs font-medium text-(--vestara-text)">Run a live planning trial</span>
        {RUNNABLE_PROFILES.map((profileId) => (
          <button
            key={profileId}
            type="button"
            onClick={() => void runTrial(profileId)}
            disabled={running !== null}
            className="rounded-md bg-[var(--vestara-accent,var(--color-sky-600))] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running === profileId ? 'Planning… (3–6 min)' : `Run ${profileId}`}
          </button>
        ))}
        <span className="text-[10px] text-(--vestara-text-muted)">
          Advisory governed Planner + Reviewer trial · execution blocked · report lands in the Activity Room.
        </span>
      </section>

      {loading ? (
        <div className="py-12 text-center text-sm text-(--vestara-text-muted)">Loading trials…</div>
      ) : trials.length === 0 ? (
        <div className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] p-8 text-center text-sm text-(--vestara-text-muted)">
          No qualification trials recorded yet.
          <div className="mt-2 text-[11px]">
            Run <code>pnpm test:e2e:workflow:real-agent</code> to produce live trial evidence under
            stage/wfo-e2e-002b-live/.
          </div>
        </div>
      ) : (
        <>
          <section className="overflow-x-auto rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-3">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted)">
                  <th className="py-1 pr-3">Profile</th>
                  <th className="py-1 pr-3">Outcome</th>
                  <th className="py-1 pr-3">Calls</th>
                  <th className="py-1 pr-3">Schema retries</th>
                  <th className="py-1 pr-3">Plan versions</th>
                  <th className="py-1 pr-3">Input tokens</th>
                  <th className="py-1 pr-3">Output tokens</th>
                  <th className="py-1 pr-3">Duration</th>
                  <th className="py-1 pr-3">Reviewer findings</th>
                  <th className="py-1">Review</th>
                </tr>
              </thead>
              <tbody>
                {trials.map((trial) => (
                  <tr
                    key={trial.profileId}
                    onClick={() => setSelected(trial.profileId)}
                    className={`cursor-pointer ${selected === trial.profileId ? 'bg-white/5' : ''}`}
                  >
                    <td className="py-1.5 pr-3 text-(--vestara-text)">
                      <Link
                        to={`/qualification/${encodeURIComponent(trial.profileId)}`}
                        onClick={(event) => event.stopPropagation()}
                        className="text-sky-400 hover:underline"
                      >
                        {trial.identity.modelId}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3">{stateLabel(trial)}</td>
                    <td className="py-1.5 pr-3">{trial.execution.callCount}</td>
                    <td className="py-1.5 pr-3">{trial.execution.retryCount}</td>
                    <td className="py-1.5 pr-3">{trial.planner.versions.length}</td>
                    <td className="py-1.5 pr-3">{trial.execution.totalInputTokens.toLocaleString()}</td>
                    <td className="py-1.5 pr-3">{trial.execution.totalOutputTokens.toLocaleString()}</td>
                    <td className="py-1.5 pr-3">{formatDuration(trial.execution.totalDurationMs)}</td>
                    <td className="py-1.5 pr-3">{reviewOf(trial)?.findings.length ?? 0}</td>
                    <td className="py-1.5">{reviewOf(trial)?.conclusion ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {generatedAt && (
              <div className="mt-2 text-[10px] text-(--vestara-text-muted)">
                Evidence generated {new Date(generatedAt).toLocaleString()}
              </div>
            )}
          </section>

          {selectedTrial && <TrialDetailPanel trial={selectedTrial} />}
        </>
      )}
    </div>
  );
}
