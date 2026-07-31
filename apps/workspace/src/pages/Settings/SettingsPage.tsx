import type { ResolvedConfiguration, ResolvedSetting, SettingsSectionId } from '@vestara/configuration';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { settingsClient, type CliStatusDto, type EventStoreStatusDto, type RuntimeStatusDto } from './settings-client.js';
import { createDraft, draftOverrides, type SettingsDraftState, updateDraft } from './settings-state.js';

interface SettingsData {
  configuration: ResolvedConfiguration;
  runtime: RuntimeStatusDto;
  cli: CliStatusDto;
  history: EventStoreStatusDto;
}

const SECTIONS: Array<{ id: SettingsSectionId | 'overview'; label: string; description: string }> = [
  { id: 'overview', label: 'Overview', description: 'Configuration and system health' },
  { id: 'general', label: 'General', description: 'Workspace identity and interface' },
  { id: 'runtime', label: 'Runtime', description: 'Runtime services and operations' },
  { id: 'providers', label: 'AI Providers', description: 'Providers and models' },
  { id: 'agents', label: 'Agents', description: 'Agent execution policy' },
  { id: 'filesystem', label: 'Filesystem & Safety', description: 'Boundaries and risk controls' },
  { id: 'verification', label: 'Verification', description: 'Checks and evidence policy' },
  { id: 'cli', label: 'CLI Integration', description: 'CLI compatibility and transport' },
  { id: 'history', label: 'Engineering History', description: 'Temporal event store' },
  { id: 'notifications', label: 'Notifications', description: 'Operational notifications' },
  { id: 'telemetry', label: 'Telemetry', description: 'Observability detail' },
  { id: 'advanced', label: 'Advanced', description: 'Experimental behavior' },
];

function Status({ value }: { value: string | boolean }) {
  const positive = value === true || ['healthy', 'running', 'available', 'connected', 'passed', 'ok'].includes(String(value));
  return <span className={`text-xs font-medium ${positive ? 'text-emerald-400' : 'text-amber-400'}`}>{String(value)}</span>;
}

function Source({ setting }: { setting: ResolvedSetting }) {
  return (
    <span className="rounded border border-(--vestara-accent-border) px-2 py-0.5 text-[10px] text-(--vestara-text-muted)">
      {setting.source === 'default' ? 'Built-in default' : `${setting.source}${setting.inherited ? ' · inherited' : ' · override'}`}
    </span>
  );
}

function Row({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-(--vestara-accent-border) py-3 last:border-0">
      <div><div className="text-sm text-(--vestara-text)">{label}</div>{detail && <div className="mt-1 text-xs text-(--vestara-text-muted)">{detail}</div>}</div>
      <div className="max-w-[55%] break-all text-right text-xs text-(--vestara-text-2)">{value}</div>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-5"><h2 className="text-sm font-semibold text-(--vestara-text)">{title}</h2>{description && <p className="mt-1 text-xs text-(--vestara-text-muted)">{description}</p>}<div className="mt-4">{children}</div></section>;
}

function Overview({ data }: { data: SettingsData }) {
  const navigate = useNavigate();
  const rows: Array<[string, unknown, SettingsSectionId]> = [
    ['Runtime', data.runtime.status, 'runtime'],
    ['CLI', data.cli.runtimeConnected && data.cli.detected ? 'Connected' : 'Unavailable', 'cli'],
    ['AI Providers', data.configuration.settings.find((s) => s.key === 'providers.defaultProvider')?.value ?? 'Not configured', 'providers'],
    ['Filesystem Policy', data.configuration.settings.find((s) => s.key === 'filesystem.dryRun')?.value ? 'Dry-run protected' : 'Active writes', 'filesystem'],
    ['Verification', data.configuration.settings.find((s) => s.key === 'verification.profile')?.value ?? 'standard', 'verification'],
    ['Engineering History', `${data.history.eventCount} events`, 'history'],
    ['Telemetry', data.configuration.settings.find((s) => s.key === 'telemetry.level')?.value ?? data.runtime.telemetryStatus, 'telemetry'],
    ['Configuration', `${data.configuration.overrideCount} workspace overrides`, 'general'],
  ];
  return <Panel title="Workspace Configuration" description="Live state from the active Workspace API and runtime.">{rows.map(([label, value, section]) => <button key={label} type="button" onClick={() => navigate(`/settings/${section}`)} className="flex w-full items-center justify-between border-b border-(--vestara-accent-border) py-3 text-left last:border-0 hover:text-(--vestara-accent)"><span className="text-sm">{label}</span><span className="text-xs text-(--vestara-text-2)">{String(value)} &nbsp;→</span></button>)}</Panel>;
}

function General({ configuration, onChanged }: { configuration: ResolvedConfiguration; onChanged: (next: ResolvedConfiguration) => void }) {
  const [draft, setDraft] = useState<SettingsDraftState>(() => createDraft(configuration, 'general'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(createDraft(configuration, 'general')), [configuration]);
  const settings = configuration.settings.filter((entry) => entry.section === 'general');
  const save = async () => { setSaving(true); setError(null); try { const result = await settingsClient.save(configuration, 'general', draftOverrides(draft)); onChanged(result.configuration); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Save failed'); } finally { setSaving(false); } };
  const reset = async () => { setSaving(true); setError(null); try { const result = await settingsClient.reset(configuration, 'general'); onChanged(result.configuration); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Reset failed'); } finally { setSaving(false); } };
  return <div className="space-y-4"><Panel title="General" description="Only explicit changes are persisted to workspace configuration.">{settings.map((setting) => <label key={setting.key} className="block border-b border-(--vestara-accent-border) py-3 last:border-0"><div className="mb-2 flex items-center justify-between"><span className="text-sm text-(--vestara-text)">{setting.key.split('.').at(-1)}</span><Source setting={setting} /></div>{typeof setting.value === 'boolean' ? <input aria-label={setting.key} type="checkbox" checked={Boolean(draft.values[setting.key])} onChange={(event) => setDraft((state) => updateDraft(state, setting.key, event.target.checked))} /> : <input aria-label={setting.key} value={String(draft.values[setting.key] ?? '')} onChange={(event) => setDraft((state) => updateDraft(state, setting.key, event.target.value))} className="w-full rounded-lg border border-(--vestara-accent-border) bg-transparent px-3 py-2 text-sm outline-none focus:border-(--vestara-accent)" />}</label>)}</Panel>{error && <div role="alert" className="text-sm text-red-400">{error}</div>}<div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-(--vestara-accent-border) bg-(--vestara-surface) p-3 shadow-xl"><span className="text-xs text-(--vestara-text-muted)">{draft.dirtyKeys.length ? `${draft.dirtyKeys.length} unsaved change(s)` : 'No unsaved changes'}</span><div className="flex gap-2"><button type="button" disabled={saving} onClick={reset} className="rounded-lg border border-(--vestara-accent-border) px-3 py-2 text-xs disabled:opacity-50">Reset section</button><button type="button" disabled={saving || !draft.dirtyKeys.length} onClick={save} className="rounded-lg bg-(--vestara-accent) px-3 py-2 text-xs text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save overrides'}</button></div></div></div>;
}

function Runtime({ runtime, refresh }: { runtime: RuntimeStatusDto; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(null);
  const action = async (kind: 'health' | 'graph') => { try { if (kind === 'health') { const result = await settingsClient.healthCheck(); setMessage(`Health check: ${result.health.status}`); } else { await settingsClient.rebuildGraph(); setMessage('Engineering graph rebuilt from registered sources.'); } await refresh(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Operation failed'); } };
  return <div className="space-y-4"><Panel title="Runtime state">{Object.entries(runtime).map(([key, value]) => <Row key={key} label={key} value={key.toLowerCase().includes('status') ? <Status value={String(value)} /> : String(value)} />)}</Panel><Panel title="Supported operations" description="Unavailable disruptive operations are disabled until a backend lifecycle endpoint exists."><div className="flex flex-wrap gap-2"><button type="button" onClick={() => action('health')} className="rounded-lg bg-(--vestara-accent) px-3 py-2 text-xs text-white">Run health check</button><button type="button" onClick={() => action('graph')} className="rounded-lg border border-(--vestara-accent-border) px-3 py-2 text-xs">Rebuild engineering graph</button><button type="button" disabled title="Runtime restart is not exposed safely by the current API process." className="rounded-lg border border-(--vestara-accent-border) px-3 py-2 text-xs opacity-40">Restart runtime</button></div>{message && <p className="mt-3 text-xs text-(--vestara-text-muted)">{message}</p>}</Panel></div>;
}

function CliIntegration({ initial }: { initial: CliStatusDto }) {
  const [status, setStatus] = useState(initial); const [error, setError] = useState<string | null>(null);
  const verify = async () => { setError(null); try { setStatus(await settingsClient.verifyCli()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'CLI verification failed'); } };
  return <div className="space-y-4"><Panel title="CLI Integration" description="Detection and runtime connectivity are reported separately."><Row label="CLI detected" value={<Status value={status.detected} />} /><Row label="Runtime connected" value={<Status value={status.runtimeConnected} />} detail={status.connectionEvidence} /><Row label="Executable" value={status.executablePath ?? 'Not found'} /><Row label="Version compatibility" value={<Status value={status.compatible} />} /><Row label="Workspace ID" value={status.workspaceId} /><Row label="Transport" value={status.transport} /><Row label="Local socket" value={status.localSocketAvailable ? status.localSocketPath : `Unavailable · fallback ${status.runtimeEndpoint}`} /><Row label="Configuration sync" value={<Status value={status.configurationSynchronized} />} /></Panel><button type="button" onClick={verify} className="rounded-lg bg-(--vestara-accent) px-3 py-2 text-xs text-white">Verify CLI installation and runtime</button>{status.validation && <Panel title="Verification evidence">{status.validation.map((stage) => <Row key={stage.stage} label={stage.stage} value={<Status value={stage.status} />} />)}</Panel>}{error && <div role="alert" className="text-sm text-red-400">{error}</div>}</div>;
}

function History({ initial }: { initial: EventStoreStatusDto }) {
  const [status, setStatus] = useState(initial); const [message, setMessage] = useState<string | null>(null);
  const reload = async () => setStatus(await settingsClient.history());
  return <div className="space-y-4">{status.persistence === 'memory' && <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300"><strong>Session-only persistence</strong><p className="mt-1 text-xs">{status.warning} The current graph can be rebuilt from workspace sources, but historical intermediate states cannot be recovered.</p></div>}<Panel title="Engineering Event Store"><Row label="Persistence" value={status.persistence} /><Row label="Events" value={status.eventCount} /><Row label="Latest sequence" value={status.latestSequence} /><Row label="Oldest retained event" value={status.oldestRetainedAt ?? 'No events'} /><Row label="Checkpoints" value={status.checkpointCount} /><Row label="Checkpoint policy" value={`every ${status.checkpointInterval} events · retain ${status.checkpointRetention}`} /><Row label="Schema version" value={status.eventSchemaVersion} /><Row label="Store identity" value={status.workspaceStoreIdentity} /></Panel><div className="flex gap-2"><button type="button" onClick={async () => { const result = await settingsClient.verifyStore(); setMessage(result.valid ? `Integrity verified at ${result.checkedAt}` : 'Integrity failure'); }} className="rounded-lg bg-(--vestara-accent) px-3 py-2 text-xs text-white">Verify integrity</button><button type="button" onClick={async () => { const result = await settingsClient.checkpoint(); setMessage(`Checkpoint created at sequence ${result.checkpoint.seq}`); await reload(); }} className="rounded-lg border border-(--vestara-accent-border) px-3 py-2 text-xs">Create checkpoint</button></div>{message && <p className="text-xs text-(--vestara-text-muted)">{message}</p>}</div>;
}

function PolicySection({ section, configuration }: { section: SettingsSectionId; configuration: ResolvedConfiguration }) {
  const settings = configuration.settings.filter((entry) => entry.section === section);
  return <Panel title={SECTIONS.find((entry) => entry.id === section)?.label ?? section} description="Resolved runtime policy. Editing will be enabled when the owning runtime exposes an atomic apply operation.">{settings.length ? settings.map((setting) => <Row key={setting.key} label={setting.key} value={<span className="flex items-center justify-end gap-2"><span>{Array.isArray(setting.value) ? setting.value.join(', ') : String(setting.value)}</span><Source setting={setting} /></span>} />) : <p className="text-sm text-(--vestara-text-muted)">No registered settings are exposed by the owning runtime.</p>}<button type="button" disabled className="mt-4 rounded-lg border border-(--vestara-accent-border) px-3 py-2 text-xs opacity-40">Runtime apply not available</button></Panel>;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null); const [error, setError] = useState<string | null>(null); const [query, setQuery] = useState('');
  const load = useCallback(async () => { setError(null); try { const [configuration, runtime, cli, history] = await Promise.all([settingsClient.configuration(), settingsClient.runtime(), settingsClient.cli(), settingsClient.history()]); setData({ configuration, runtime, cli, history }); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Settings are unavailable'); } }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => SECTIONS.filter((section) => `${section.label} ${section.description}`.toLowerCase().includes(query.toLowerCase())), [query]);
  if (error) return <div className="p-8"><div role="alert" className="rounded-xl border border-red-500/40 p-5 text-red-400"><h1 className="font-semibold">Settings disconnected</h1><p className="mt-2 text-sm">{error}</p><button type="button" onClick={() => void load()} className="mt-4 rounded-lg border px-3 py-2 text-xs">Retry</button></div></div>;
  if (!data) return <div className="p-12 text-center text-sm text-(--vestara-text-muted)">Loading resolved configuration and runtime state…</div>;
  const changed = (configuration: ResolvedConfiguration) => setData((current) => current ? { ...current, configuration } : current);
  return <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-[1400px] gap-6 p-5"><aside className="w-64 shrink-0"><div className="sticky top-4"><h1 className="text-xl font-semibold">Settings</h1><p className="mt-1 text-xs text-(--vestara-text-muted)">Engineering control surface</p><input aria-label="Search settings" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search settings…" className="mt-4 w-full rounded-lg border border-(--vestara-accent-border) bg-transparent px-3 py-2 text-sm outline-none" /><nav aria-label="Settings sections" className="mt-4 space-y-1">{visible.map((section) => <NavLink key={section.id} to={`/settings/${section.id}`} className={({ isActive }) => `block rounded-lg px-3 py-2 ${isActive ? 'bg-(--vestara-accent) text-white' : 'hover:bg-(--vestara-accent-bg)'}`}><div className="text-sm">{section.label}</div><div className="text-[10px] opacity-70">{section.description}</div></NavLink>)}</nav></div></aside><main className="min-w-0 flex-1"><Routes><Route index element={<Navigate to="overview" replace />} /><Route path="overview" element={<Overview data={data} />} /><Route path="general" element={<General configuration={data.configuration} onChanged={changed} />} /><Route path="runtime" element={<Runtime runtime={data.runtime} refresh={load} />} /><Route path="cli" element={<CliIntegration initial={data.cli} />} /><Route path="history" element={<History initial={data.history} />} />{(['providers', 'agents', 'filesystem', 'verification', 'notifications', 'telemetry', 'advanced'] as SettingsSectionId[]).map((section) => <Route key={section} path={section} element={<PolicySection section={section} configuration={data.configuration} />} />)}<Route path="*" element={<Navigate to="overview" replace />} /></Routes></main></div>;
}
