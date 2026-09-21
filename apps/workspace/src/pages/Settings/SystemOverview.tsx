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
 *
 * Semantics (never blurred):
 *   host uptime != API process uptime (process uptime is not projected — gap)
 *   process running != healthy (lifecycle status vs health probes)
 *   unknown != failed (unknown renders as plain text, never a status pill)
 */

import { useCallback, useEffect, useState } from 'react';
import { navIcon } from '../../layouts/workspace-navigation.js';
import { diagnosticsApi, type DiagSummary } from '../../lib/diagnostics.js';
import { Button, FactRow, ReferenceCard, SettingsRow, Status, humanize } from './settings-ui.js';

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

function SystemSection({ summary, className = '' }: { summary: DiagSummary; className?: string }) {
  const osName = summary.os.type && summary.os.release ? `${summary.os.type} ${summary.os.release}` : null;
  return (
    <ReferenceCard
      icon={navIcon('diagnostics')}
      title="System"
      description="Host machine facts from the diagnostics snapshot."
      tone="info"
      className={className}
    >
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
    </ReferenceCard>
  );
}

function HardwareSection({ summary, className = '' }: { summary: DiagSummary; className?: string }) {
  const cores =
    summary.cpu.logicalCores > 0
      ? `${summary.cpu.logicalCores} logical${summary.cpu.physicalCores > 0 ? ` · ${summary.cpu.physicalCores} physical` : ''}`
      : null;
  const memory =
    summary.memory.total > 0 ? `${formatGib(summary.memory.used)} used of ${formatGib(summary.memory.total)}` : null;
  return (
    <ReferenceCard icon={navIcon('tools')} title="Hardware" description="Processor and memory from the diagnostics snapshot." className={`st-card-secondary ${className}`}>
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
    </ReferenceCard>
  );
}

function EnvironmentSection({ summary, className = '' }: { summary: DiagSummary; className?: string }) {
  return (
    <ReferenceCard icon={navIcon('terminal')} title="Environment" description="Toolchain versions probed on the host." className={`st-card-secondary ${className}`}>
        <FactRow label="Node.js" value={<VersionOrUnknown value={summary.versions.node} />} />
        <FactRow label="pnpm" value={<VersionOrUnknown value={summary.versions.pnpm} />} />
    </ReferenceCard>
  );
}

function StorageNetworkSection({ summary, className = '' }: { summary: DiagSummary; className?: string }) {
  const primary = summary.disks.find((disk) => disk.mount === '/') ?? summary.disks[0];
  const external = summary.network.interfaces.filter((iface) => !iface.internal);
  return (
    <ReferenceCard
      icon={navIcon('files')}
      title="Storage & Network"
      description="Mounted filesystems and host network facts from the diagnostics snapshot."
      className={className}
    >
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
    </ReferenceCard>
  );
}

export default function SystemOverview() {
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

  if (loading) {
    return (
      <div role="status" aria-label="Loading system information" className="min-w-0 space-y-4 lg:col-span-2 xl:col-span-3">
        <div className="mpg-skeleton h-44" />
        <div className="mpg-skeleton h-44" />
        <p className="sr-only">Loading host and runtime information…</p>
      </div>
    );
  }
  if (!summary) {
    return (
      <div role="alert" className="st-panel min-w-0 p-5 lg:col-span-2 xl:col-span-3">
        <h2 className="font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
          Host information unavailable
        </h2>
        <p className="mt-2 text-sm text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
          The diagnostics snapshot could not be loaded. Host, hardware,
          environment, storage and network sections need a reachable diagnostics API.
        </p>
        <div className="mt-4">
          <Button primary onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }
  return (
    <>
      <SystemSection summary={summary} className="lg:col-span-2" />
      <HardwareSection summary={summary} className="lg:col-span-2 xl:col-span-1" />
      <StorageNetworkSection summary={summary} className="lg:col-span-2" />
      <EnvironmentSection summary={summary} className="lg:col-span-2 xl:col-span-1" />
    </>
  );
}
