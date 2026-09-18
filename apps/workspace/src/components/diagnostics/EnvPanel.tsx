/**
 * Environment tab — toolchain versions and safe environment variables.
 */

import { useMemo } from 'react';
import { useDiagnostics } from './DiagnosticsContext';

const SAFE_ENV_KEYS = [
  'HOME',
  'SHELL',
  'TERM',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'PATH',
  'NODE_ENV',
  'VESTARA_API_PORT',
  'VESTARA_REPO',
  'EDITOR',
  'PWD',
  'TMPDIR',
  'XDG_CONFIG_HOME',
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
];

export function EnvPanel() {
  const { summary } = useDiagnostics();
  const versions = summary?.versions ?? {};

  const envVars = useMemo<Array<[string, string]>>(() => {
    // `process.env` does not exist in the browser bundle (Vite) — reading it
    // unguarded throws and crashes the tab. Merge the safe subset of the
    // Node env (when present, e.g. SSR/tests) with Vite client env instead.
    const fromNode: Record<string, unknown> =
      typeof process !== 'undefined' && (process as unknown as { env?: Record<string, unknown> }).env
        ? ((process as unknown as { env: Record<string, unknown> }).env ?? {})
        : {};
    const fromVite: Record<string, unknown> =
      typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, unknown> }).env
        ? ((import.meta as unknown as { env: Record<string, unknown> }).env ?? {})
        : {};
    const merged: Record<string, unknown> = { ...fromVite, ...fromNode };
    return Object.entries(merged)
      .filter(([key]) => SAFE_ENV_KEYS.includes(key) || key.startsWith('VITE_') || key.startsWith('VESTARA_'))
      .map(([key, value]) => [key, String(value ?? '')] as [string, string])
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, []);

  return (
    <div className="space-y-3">
      <div className="diag-card diag-card-body">
        <div className="diag-section-title">Toolchain</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {Object.entries(versions).map(([name, version]) => (
            <div key={name} className="diag-stat">
              <span className="diag-stat-label">{name}</span>
              <span className="diag-stat-value text-[13px]">
                {version ?? <span className="text-zinc-600">not installed</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="diag-card diag-card-body">
        <div className="diag-section-title">Environment Variables</div>
        {envVars.length === 0 && (
          <p className="text-[11px] text-zinc-500">No safe environment variables are exposed to the browser.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {envVars.map(([key, value]) => (
            <div key={key} className="flex items-baseline justify-between gap-3 py-1 border-b border-zinc-800/60">
              <span className="text-[11px] text-zinc-500 font-mono">{key}</span>
              <span className="text-[11px] text-zinc-300 font-mono break-all text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
