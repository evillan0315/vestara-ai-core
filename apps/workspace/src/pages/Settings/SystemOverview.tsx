/**
 * SETTINGS-SYS-001: Read-only System Overview (/settings/system).
 *
 * Observation only — no start/stop/restart, no process control, no privileged
 * operations. Every displayed field projects an existing authority:
 *
 *   host facts ......... GET /api/diagnostics/summary (DiagSummary.os)
 *   hardware ........... GET /api/diagnostics/summary (DiagSummary.cpu/memory)
 *   toolchain .......... GET /api/diagnostics/summary (DiagSummary.versions)
 *   storage/network .... GET /api/diagnostics/summary (DiagSummary.disks/network)
 *   runtime state ...... GET /api/runtime/status (RuntimeStatusDto, via Settings)
 *
 * Semantics (never blurred):
 *   host uptime != API process uptime (process uptime is not projected — gap)
 *   process running != healthy (lifecycle status vs health probes)
 *   unknown != failed (unknown renders as plain text, never a status pill)
 */

import { useCallback, useEffect, useState } from 'react';
import { diagnosticsApi, type DiagSummary } from '../../lib/diagnostics.js';
import type { RuntimeStatusDto } from './settings-client.js';
import { Button, FactRow, SettingsRow, SettingsSection, Status, humanize } from './settings-ui.js';

/** Bytes → GiB with one decimal. Exported for focused tests. */
export function formatGib(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown';
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

/** Seconds → compact duration ("1d 2h 3m"). Exported for focused tests. */
export function formatUptime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return 'Unknown';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Unknown values render as plain muted text — never a Status pill, never
 * presented as healthy/running/failed.
 */
function UnknownValue() {
  return (
    <span className="text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">Unknown</span>
  );
}

function MonoValue({ children }: { children: string }) {
  return <span className="font-mono text-xs">{children}</span>;
}

/** Lifecycle/health status when a value exists, Unknown text otherwise. */
function StatusOrUnknown({ value }: { value: string | null | undefined }) {
  if (!value) return <UnknownValue />;
  return <Status value={humanize(value)} />;
}

/** Plain version string when present, Unknown text otherwise. */
function VersionOrUnknown({ value }: { value: string | null | undefined }) {
  if (!value) return <UnknownValue />;
  return <MonoValue>{value}</MonoValue>;
}

function RuntimeStatus({ runtime }: { runtime: RuntimeStatusDto }) {
  return (
    <SettingsSection
      title="Runtime Status"
      description="Vestara API runtime state. Running means the process answers — it is not a health verdict."
    >
      <div className="px-4 py-3 sm:px-5">
        <FactRow label="API Runtime" value={<StatusOrUnknown value={runtime.status} />} />
        <FactRow
          label="Runtime endpoint"
          value={runtime.apiEndpoint ? <MonoValue>{runtime.apiEndpoint}</MonoValue> : <UnknownValue />}
        />
        <FactRow
          label="Runtime version"
          value={runtime.runtimeVersion ? <MonoValue>{runtime.runtimeVersion}</MonoValue> : <UnknownValue />}
        />
        <FactRow label="Event bus" value={<StatusOrUnknown value={runtime.eventBusStatus} />} />
        <FactRow
          label="Engineering graph"
          value={<StatusOrUnknown value={runtime.engineeringGraphStatus} />}
         
        />
        <SettingsRow
          label="API process uptime"
          description="Process uptime is not projected by the runtime API — host uptime below is machine uptime, not this process."
          value={<UnknownValue />}
        />
      </div>
    </SettingsSection>
  );
}

function SystemSection({ summary }: { summary: DiagSummary }) {
  const osName = summary.os.type && summary.os.release ? `${summary.os.type} ${summary.os.release}` : null;
  return (
    <SettingsSection
      title="System"
      description="Host machine facts from the diagnostics snapshot."
    >
      <div className="px-4 py-3 sm:px-5">
        <FactRow
          label="Operating System"
          value={osName ? <span>{osName}</span> : <UnknownValue />}
          title={osName ? undefined : 'Distribution name is not projected by the diagnostics API'}
        />
        <FactRow
          label="Kernel"
          value={summary.os.kernel ? <MonoValue>{summary.os.kernel}</MonoValue> : <UnknownValue />}
        />
        <FactRow
          label="Architecture"
          value={summary.os.arch ? <MonoValue>{summary.os.arch}</MonoValue> : <UnknownValue />}
        />
        <FactRow
          label="Hostname"
          value={summary.os.hostname ? <MonoValue>{summary.os.hostname}</MonoValue> : <UnknownValue />}
        />
        <SettingsRow
          label="Host uptime"
          description="Machine uptime since boot — not the API process uptime."
          value={
            Number.isFinite(summary.os.uptime) ? (
              <span className="font-mono tabular-nums">{formatUptime(summary.os.uptime)}</span>
            ) : (
              <UnknownValue />
            )
          }
        />
      </div>
    </SettingsSection>
  );
}

function HardwareSection({ summary }: { summary: DiagSummary }) {
  const cores =
    summary.cpu.logicalCores > 0
      ? `${summary.cpu.logicalCores} logical${summary.cpu.physicalCores > 0 ? ` · ${summary.cpu.physicalCores} physical` : ''}`
      : null;
  const memory =
    summary.memory.total > 0 ? `${formatGib(summary.memory.used)} used of ${formatGib(summary.memory.total)}` : null;
  return (
    <SettingsSection title="Hardware" description="Processor and memory from the diagnostics snapshot.">
      <div className="px-4 py-3 sm:px-5">
        <FactRow label="Processor" value={summary.cpu.model ? <span>{summary.cpu.model}</span> : <UnknownValue />} />
        <FactRow
          label="Logical cores"
          value={
            cores ? <span className="font-mono tabular-nums">{cores}</span> : <UnknownValue />
          }
        />
        <SettingsRow
          label="Memory"
          description={summary.memory.total > 0 ? `${formatGib(summary.memory.available)} available` : undefined}
          value={
            memory ? <span className="font-mono tabular-nums">{memory}</span> : <UnknownValue />
          }
        />
      </div>
    </SettingsSection>
  );
}

function EnvironmentSection({ summary }: { summary: DiagSummary }) {
  return (
    <SettingsSection title="Environment" description="Toolchain versions probed on the host.">
      <div className="px-4 py-3 sm:px-5">
        <FactRow label="Node.js" value={<VersionOrUnknown value={summary.versions.node} />} />
        <FactRow label="pnpm" value={<VersionOrUnknown value={summary.versions.pnpm} />} />
      </div>
    </SettingsSection>
  );
}

function StorageNetworkSection({ summary }: { summary: DiagSummary }) {
  const primary = summary.disks.find((disk) => disk.mount === '/') ?? summary.disks[0];
  const external = summary.network.interfaces.filter((iface) => !iface.internal);
  return (
    <SettingsSection
      title="Storage & Network"
      description="Mounted filesystems and host network facts from the diagnostics snapshot."
    >
      <div className="px-4 py-3 sm:px-5">
        <SettingsRow
          label="Primary filesystem"
          description={primary ? `${primary.mount} · ${primary.capacity}% used` : undefined}
          value={
            primary && primary.size > 0 ? (
              <span className="font-mono tabular-nums">
                {formatGib(primary.used)} of {formatGib(primary.size)}
              </span>
            ) : (
              <UnknownValue />
            )
          }
        />
        <SettingsRow
          label="Network interfaces"
          description={
            external.length > 0 ? external.map((iface) => `${iface.name} (${iface.address})`).join(', ') : undefined
          }
          value={
            summary.network.interfaces.length > 0 ? (
              <span className="font-mono tabular-nums">{`${external.length} external · ${summary.network.interfaces.length} total`}</span>
            ) : (
              <UnknownValue />
            )
          }
        />
        <FactRow
          label="Gateway"
          value={summary.network.gateway ? <MonoValue>{summary.network.gateway}</MonoValue> : <UnknownValue />}
        />
      </div>
    </SettingsSection>
  );
}

export default function SystemOverview({ runtime }: { runtime: RuntimeStatusDto }) {
  const [summary, setSummary] = useState<DiagSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await diagnosticsApi.summary());
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await diagnosticsApi.summary();
        if (!cancelled) setSummary(result);
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-[var(--vestara-spacing-section)]">
      <RuntimeStatus runtime={runtime} />
      {loading ? (
        <div role="status" aria-label="Loading system information" className="space-y-4">
          <div className="mpg-skeleton h-44" />
          <div className="mpg-skeleton h-44" />
          <p className="sr-only">Loading host and runtime information…</p>
        </div>
      ) : !summary ? (
        <div role="alert" className="st-panel p-5">
          <h2 className="font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
            Host information unavailable
          </h2>
          <p className="mt-2 text-sm text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            The diagnostics snapshot could not be loaded. Runtime state above is unaffected — host, hardware,
            environment, storage and network sections need a reachable diagnostics API.
          </p>
          <div className="mt-4">
            <Button primary onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </div>
      ) : (
        <>
          <SystemSection summary={summary} />
          <HardwareSection summary={summary} />
          <EnvironmentSection summary={summary} />
          <StorageNetworkSection summary={summary} />
        </>
      )}
    </div>
  );
}
