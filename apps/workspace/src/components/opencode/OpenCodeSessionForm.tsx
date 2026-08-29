import { useState } from 'react';
import type { OpenCodeAgentSummary, OpenCodeProject, OpenCodeProviderSummary } from '../../lib/opencode';

export interface OpenCodeNewSessionValues {
  title: string;
  request: string;
  agent?: string;
  providerId?: string;
  modelId?: string;
  captureEvidence: boolean;
  verifyAfterCapture: boolean;
}

interface OpenCodeSessionFormProps {
  project: OpenCodeProject | null;
  agents: OpenCodeAgentSummary[];
  providers: OpenCodeProviderSummary[];
  offline: boolean;
  pending: boolean;
  error?: string | null;
  onSubmit: (values: OpenCodeNewSessionValues) => void;
  onCancel: () => void;
}

export function OpenCodeSessionForm({
  project,
  agents,
  providers,
  offline,
  pending,
  error,
  onSubmit,
  onCancel,
}: OpenCodeSessionFormProps) {
  const [title, setTitle] = useState('');
  const [request, setRequest] = useState('');
  const [agent, setAgent] = useState(agents[0]?.name ?? '');
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '');
  const [modelId, setModelId] = useState('');
  const [captureEvidence, setCaptureEvidence] = useState(true);
  const [verifyAfterCapture, setVerifyAfterCapture] = useState(true);

  const blocked = offline || !project || pending || request.trim().length === 0;

  const submit = () => {
    if (blocked) return;
    onSubmit({
      title: title.trim() || request.trim().slice(0, 40),
      request: request.trim(),
      agent: agent || undefined,
      providerId: providerId || undefined,
      modelId: modelId.trim() || undefined,
      captureEvidence,
      verifyAfterCapture,
    });
  };

  return (
    <div className="w-full max-w-2xl space-y-4">
      <section className="p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
        <h3 className="text-[11px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">Describe the work</h3>
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          rows={5}
          placeholder="Engineering request…"
          className="w-full text-[12px] px-2.5 py-2 bg-zinc-900 border border-(--vestara-accent-border) rounded-md text-(--vestara-text) placeholder:text-(--vestara-text-dim) resize-y"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Session title (optional — defaults from request)"
          className="mt-2 w-full text-[11px] px-2.5 py-1.5 bg-zinc-900 border border-(--vestara-accent-border) rounded-md text-(--vestara-text) placeholder:text-(--vestara-text-dim)"
        />
      </section>

      <section className="p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
        <h3 className="text-[11px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">Execution context</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-[10px] text-(--vestara-text-muted)">
            Agent
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              disabled={agents.length === 0}
              className="mt-1 w-full text-[11px] px-2 py-1.5 bg-zinc-900 border border-(--vestara-accent-border) rounded-md text-(--vestara-text) disabled:opacity-40"
            >
              {agents.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] text-(--vestara-text-muted)">
            Provider
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              disabled={providers.length === 0}
              className="mt-1 w-full text-[11px] px-2 py-1.5 bg-zinc-900 border border-(--vestara-accent-border) rounded-md text-(--vestara-text) disabled:opacity-40"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.id}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] text-(--vestara-text-muted)">
            Model
            <input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="Optional — provider default when empty"
              className="mt-1 w-full text-[11px] px-2 py-1.5 bg-zinc-900 border border-(--vestara-accent-border) rounded-md text-(--vestara-text) placeholder:text-(--vestara-text-dim)"
            />
          </label>
          <div className="block text-[10px] text-(--vestara-text-muted)">
            Workspace
            <div className="mt-1 flex items-center gap-2 text-[11px] px-2 py-1.5 bg-zinc-900 border border-(--vestara-accent-border) rounded-md text-(--vestara-text-muted)">
              <span className="truncate">{project?.name || project?.id.slice(0, 20) || 'No workspace context'}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
        <h3 className="text-[11px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">Completion controls</h3>
        <label className="flex items-center gap-2 text-[11px] text-(--vestara-text-2) cursor-pointer">
          <input
            type="checkbox"
            checked={captureEvidence}
            onChange={(e) => setCaptureEvidence(e.target.checked)}
            className="accent-(--vestara-accent)"
          />
          Capture evidence automatically
        </label>
        <label className="flex items-center gap-2 text-[11px] text-(--vestara-text-2) mt-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={verifyAfterCapture}
            onChange={(e) => setVerifyAfterCapture(e.target.checked)}
            className="accent-(--vestara-accent)"
          />
          Run verification automatically
        </label>
      </section>

      {error && <p className="text-[11px] text-(--vestara-red)">{error}</p>}

      {offline && <p className="text-[11px] text-(--vestara-red)">Creation is disabled because OpenCode is offline.</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-[10px] px-2.5 py-1.5 rounded-md border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={blocked}
          className="text-[10px] px-2.5 py-1.5 rounded-md bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text) hover:bg-(--vestara-accent) cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? 'Creating…' : 'Create Session'}
        </button>
      </div>
    </div>
  );
}
