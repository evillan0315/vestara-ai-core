/**
 * SETTINGS-ENV-E1: Environment Variables (/settings/environment).
 *
 * Read-only projection of GET /api/system/environment — a curated,
 * secret-safe registry. Unknown host/session variables are never
 * enumerated; sensitive values never leave the API (presence only).
 */

import { EmptyState } from '@vestara/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { navIcon } from '../../layouts/workspace-navigation.js';
import { type EnvironmentVariableView, settingsClient } from './settings-client.js';
import { Button, ReferenceCard, humanize, input, SettingsRow, Status } from './settings-ui.js';

type ScopeFilter = 'all' | EnvironmentVariableView['scope'];
type SourceFilter = 'all' | EnvironmentVariableView['effectiveSource'];

function VariableValue({ variable }: { variable: EnvironmentVariableView }) {
  if (variable.sensitive) {
    return (
      <span className="flex flex-wrap items-center justify-end gap-2">
        {variable.hasValue && (
          <span className="font-mono text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            ••••••••••
          </span>
        )}
        <Status value={variable.hasValue ? 'Configured' : 'Not set'} />
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {variable.effectiveValue !== undefined ? (
        <span className="max-w-72 truncate font-mono text-xs" title={variable.effectiveValue}>
          {variable.effectiveValue}
        </span>
      ) : (
        <Status value="Unknown" />
      )}
      {variable.overridden && (
        <Status
          value="Overridden"
          title={
            variable.sourcePath
              ? `Lower layer also sets this (${variable.sourcePath})`
              : 'A lower configuration layer also sets this'
          }
        />
      )}
      {variable.restartRequired && <Status value="Restart required" />}
    </span>
  );
}

export default function EnvironmentVariables({ className = '' }: { className?: string }) {
  const [variables, setVariables] = useState<EnvironmentVariableView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await settingsClient.environment();
      setVariables(result.variables);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Environment registry is unavailable');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const scopes = useMemo(
    () => Array.from(new Set((variables ?? []).map((variable) => variable.scope))).sort(),
    [variables],
  );
  const sources = useMemo(
    () => Array.from(new Set((variables ?? []).map((variable) => variable.effectiveSource))).sort(),
    [variables],
  );
  const filtered = useMemo(
    () =>
      (variables ?? []).filter((variable) => {
        if (scope !== 'all' && variable.scope !== scope) return false;
        if (source !== 'all' && variable.effectiveSource !== source) return false;
        const haystack =
          `${variable.name} ${variable.description} ${variable.scope} ${variable.effectiveSource}`.toLowerCase();
        return haystack.includes(query.toLowerCase());
      }),
    [variables, scope, source, query],
  );

  if (error) {
    return (
      <div role="alert" className="st-panel p-5">
        <h2 className="font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
          Environment registry unavailable
        </h2>
        <p className="mt-2 text-sm text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">{error}</p>
        <div className="mt-4">
          <Button primary onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!variables) {
    return (
      <div role="status" aria-label="Loading environment registry" className="space-y-4">
        <div className="mpg-skeleton h-44" />
        <p className="sr-only">Loading environment registry…</p>
      </div>
    );
  }

  return (
    <div className="space-y-[var(--vestara-spacing-section)]">
      <ReferenceCard
        icon={navIcon('tools')}
        title="Environment Variables"
        description="Curated registry only — unknown host and session variables are never enumerated, and secret values never leave the API."
        tone="info"
        className={className}
        actions={
          <span className="font-mono text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            {filtered.length} of {variables.length}
          </span>
        }
      >
        <div className="flex flex-col gap-3 border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] pb-4">
          <input
            aria-label="Search environment variables"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, scope or source…"
            className={input}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block">
              <span className="mb-1 block text-[var(--vestara-font-size-xs)] font-semibold uppercase tracking-[0.18em] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                Scope
              </span>
              <select
                aria-label="Filter by scope"
                value={scope}
                onChange={(event) => setScope(event.target.value as ScopeFilter)}
                className={`${input} w-full sm:w-auto`}
              >
                <option value="all">All scopes</option>
                {scopes.map((entry) => (
                  <option key={entry} value={entry}>
                    {humanize(entry.replace('-', ' '))}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[var(--vestara-font-size-xs)] font-semibold uppercase tracking-[0.18em] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                Effective source
              </span>
              <select
                aria-label="Filter by effective source"
                value={source}
                onChange={(event) => setSource(event.target.value as SourceFilter)}
                className={`${input} w-full sm:w-auto`}
              >
                <option value="all">All sources</option>
                {sources.map((entry) => (
                  <option key={entry} value={entry}>
                    {humanize(entry)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {filtered.length ? (
          filtered.map((variable) => (
            <SettingsRow
              key={variable.name}
              label={variable.name}
              description={`${humanize(variable.scope.replace('-', ' '))} · effective source: ${humanize(variable.effectiveSource)}${variable.sourcePath ? ` · ${variable.sourcePath}` : ''} — ${variable.description}`}
              value={<VariableValue variable={variable} />}
            />
          ))
        ) : (
          <div className="p-4">
            <EmptyState
              title="No matching variables"
              description="No registry entries match the current search and filters. Unknown host variables are never listed."
            />
          </div>
        )}
      </ReferenceCard>
    </div>
  );
}
