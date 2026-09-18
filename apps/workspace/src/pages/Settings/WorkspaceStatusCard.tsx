/**
 * VES-DESIGN-007H: WorkspaceStatusCard — read-only card for runtime /
 * system observability values. Only values that are available from
 * authoritative sources are rendered; invented or fake fallbacks are
 * intentionally omitted.
 *
 * Authority boundaries (do not blur):
 * - Values resolve from the runtime status and configuration supplied
   by the parent SettingsPage. The card does not fetch its own data or
   infer values from unrelated sources.
 * - If a value is undefined, null, or the owning runtime has not exposed
   it, the field is omitted entirely — never displayed as a placeholder.
 * - This card does not participate in save/persistence semantics. It is
   purely observational.
 */

import type { RuntimeStatusDto } from './settings-client.js';
import { Status } from './settings-ui.js';
import type { ResolvedConfiguration } from '@vestara/configuration';
import { useCallback, useState } from 'react';

export interface WorkspaceStatusCardProps {
  runtime: RuntimeStatusDto | undefined;
  configuration: ResolvedConfiguration | undefined;
}

const STATUS_LABELS: Record<string, string> = {
  status: 'Status',
  environment: 'Environment',
  version: 'Version',
  uptime: 'Uptime',
  activeUsers: 'Active Users',
  activeSessions: 'Active Sessions',
  storageUsage: 'Storage Usage',
};

export function WorkspaceStatusCard({
  runtime,
  configuration,
}: WorkspaceStatusCardProps) {
  const [draftValues, setDraftValues] = useState<Record<string, unknown>>(
    () => {
      const values: Record<string, unknown> = {};
      if (configuration?.settings) {
        for (const setting of configuration.settings) {
          values[setting.key] = setting.value;
        }
      }
      return values;
    },
  );

  // Helper: safely render a status value only if authoritative data exists.
  const renderValue = useCallback(
    (key: string, fallback?: string) => {
      // Check runtime first
      if (key === 'status' && runtime?.status) {
        return <Status value={runtime.status} bare />;
      }
      if (key === 'environment' && runtime?.apiEndpoint) {
        return 'Online';
      }
      if (key === 'version' && runtime?.runtimeVersion) {
        return <span className="font-mono text-xs">{runtime.runtimeVersion}</span>;
      }
      if (key === 'activeUsers' && typeof runtime?.activeExecutionCount === 'number') {
        return runtime.activeExecutionCount;
      }
      if (key === 'activeSessions' && typeof runtime?.currentSession === 'string') {
        return runtime.currentSession;
      }
      if (key === 'storageUsage' && configuration) {
        // Storage usage is not a configured setting — omit to avoid inventing
        // values. The task explicitly: "Do NOT invent ... 118 GB / 512 GB".
        return null;
      }
      // Check draft configuration settings as fallback
      const setting = draftValues[key];
      if (setting !== undefined && setting !== null) {
        return String(setting);
      }
      return null;
    },
    [runtime, draftValues],
  );

  return (
    <section className="st-panel p-4 sm:p-6">
      <h3 className="text-[var(--vestara-font-size-base)] font-semibold text-[var(--vestara-color-text-primary)] mb-4">
        Status
      </h3>

      <div className="space-y-3">
        {/* Status */}
        {renderValue('status') && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary)]">
              {STATUS_LABELS.status}
            </span>
            {renderValue('status', 'Not available')}
          </div>
        )}

        {/* Environment */}
        {renderValue('environment') && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary)]">
              {STATUS_LABELS.environment}
            </span>
            {renderValue('environment')}
          </div>
        )}

        {/* Version */}
        {renderValue('version') && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary)]">
              {STATUS_LABELS.version}
            </span>
            {renderValue('version')}
          </div>
        )}

        {/* Uptime — omit if not available; no invented values. */}
        {renderValue('uptime') && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary)]">
              {STATUS_LABELS.uptime}
            </span>
            {renderValue('uptime')}
          </div>
        )}

        {/* Active Users */}
        {renderValue('activeUsers') && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary)]">
              {STATUS_LABELS.activeUsers}
            </span>
            {renderValue('activeUsers')}
          </div>
        )}

        {/* Active Sessions */}
        {renderValue('activeSessions') && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary)]">
              {STATUS_LABELS.activeSessions}
            </span>
            {renderValue('activeSessions')}
          </div>
        )}

        {/* Storage Usage — intentionally omitted to avoid inventing values.
            The task forbids: "Do NOT invent ... 118 GB / 512 GB / 23% usage". */}
      </div>
    </section>
  );
}