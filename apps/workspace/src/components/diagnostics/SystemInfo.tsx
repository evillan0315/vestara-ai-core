/**
 * Overview tab — system information, network, workspace, and toolchain.
 */

import { formatBytes, formatUptime } from '../../lib/diagnostics';
import { useDiagnostics } from './DiagnosticsContext';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-zinc-800/60 last:border-0">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="text-[11.5px] text-zinc-200 text-right break-all">{value || '—'}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="diag-card diag-card-body">
      <div className="diag-section-title">{title}</div>
      {children}
    </div>
  );
}

export function SystemInfo() {
  const { summary } = useDiagnostics();
  if (!summary) return null;
  const { os, network, workspace, versions, memory, cpu } = summary;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Section title="Operating System">
        <InfoRow label="Platform" value={`${os.platform} · ${os.type}`} />
        <InfoRow label="Kernel" value={os.release} />
        <InfoRow label="Version" value={os.kernel} />
        <InfoRow label="Architecture" value={os.arch} />
        <InfoRow label="Hostname" value={os.hostname} />
        <InfoRow label="User" value={os.user} />
        <InfoRow label="Home" value={os.home} />
        <InfoRow label="Uptime" value={formatUptime(os.uptime)} />
        <InfoRow label="Booted" value={new Date(os.bootTime).toLocaleString()} />
        <InfoRow label="Timezone" value={os.timezone} />
        <InfoRow label="Locale" value={os.locale} />
      </Section>

      <div className="space-y-3">
        <Section title="Workspace">
          <InfoRow label="Repository" value={workspace.name} />
          <InfoRow label="Path" value={workspace.path} />
          <InfoRow label="Status" value={workspace.status} />
          <InfoRow label="Files" value={workspace.files.toLocaleString()} />
          <InfoRow label="Packages" value={workspace.packages} />
          <InfoRow label="Dependencies" value={workspace.dependencies} />
          <InfoRow label="Language" value={workspace.language} />
          <InfoRow label="Framework" value={workspace.framework ?? '—'} />
          <InfoRow label="Monorepo" value={workspace.isMonorepo ? 'yes' : 'no'} />
          <InfoRow label="Data dir" value={workspace.workspaceDir} />
        </Section>
      </div>

      <Section title="Toolchain">
        {Object.entries(versions).map(([name, version]) => (
          <InfoRow key={name} label={name} value={version ?? 'not installed'} />
        ))}
      </Section>

      <Section title="Network Interfaces">
        {network.interfaces.length === 0 && <p className="text-[11px] text-zinc-500">No interfaces</p>}
        <div className="overflow-x-auto">
          <table className="diag-table">
            <thead>
              <tr>
                <th>Interface</th>
                <th>Family</th>
                <th>Address</th>
                <th>MAC</th>
              </tr>
            </thead>
            <tbody>
              {network.interfaces.map((iface) => (
                <tr key={`${iface.name}-${iface.family}-${iface.address}`}>
                  <td className="font-mono">{iface.name}</td>
                  <td>{iface.family}</td>
                  <td className="font-mono">{iface.address}</td>
                  <td className="font-mono text-zinc-500">{iface.mac}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-zinc-400">
          Gateway: <span className="font-mono">{network.gateway ?? '—'}</span> · Load average:{' '}
          <span className="font-mono">{cpu.loadAvg.join(' / ')}</span> · Governor:{' '}
          <span className="font-mono">{cpu.governor ?? '—'}</span>
        </div>
      </Section>

      <div className="space-y-3">
        <Section title="Memory Detail">
          <InfoRow label="Total" value={formatBytes(memory.total)} />
          <InfoRow label="Available" value={formatBytes(memory.available)} />
          <InfoRow label="Buffers" value={formatBytes(memory.buffers)} />
          <InfoRow label="Cached" value={formatBytes(memory.cached)} />
          <InfoRow label="Swap" value={`${formatBytes(memory.swapUsed)} / ${formatBytes(memory.swapTotal)}`} />
          {memory.hugePagesTotal > 0 && (
            <InfoRow label="Huge pages" value={`${memory.hugePagesFree}/${memory.hugePagesTotal}`} />
          )}
        </Section>
        <Section title="CPU">
          <InfoRow label="Model" value={cpu.model} />
          <InfoRow label="Cores" value={`${cpu.physicalCores} physical / ${cpu.logicalCores} logical`} />
          <InfoRow label="Speed" value={`${cpu.speed} MHz`} />
          <InfoRow label="Governor" value={cpu.governor ?? '—'} />
          <InfoRow label="Interrupts" value={cpu.interrupts.toLocaleString()} />
          <InfoRow label="Context switches" value={cpu.contextSwitches.toLocaleString()} />
        </Section>
      </div>
    </div>
  );
}
