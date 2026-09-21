import { useGAExecutionConfig } from '../../../../hooks/useGAExecutionConfig';
import { navIcon } from '../../../../layouts/workspace-navigation.js';
import { Button, FactRow, ReferenceCard, SettingsRow, Status, input } from '../../settings-ui';

/**
 * Scaffold: Assistant Execution — turn budgets + tool visibility.
 * VES-DESIGN-007: presentation only, authority stays in @vestara/configuration + assistant-opencode-adapter.
 * Session-local today (useGAExecutionConfig), future: persist to settings-client (assistant.execution.*).
 * Tools matrix is display-only read from AssistantCapability policy (allow/ask/deny).
 */
const TOOL_ROWS: Array<{ tool: string; policy: string; description: string }> = [
  { tool: 'read', policy: 'allow', description: 'Read files, glob, grep — discovery only' },
  { tool: 'edit', policy: 'allow', description: 'Create/modify files (Developer, Assistant)' },
  { tool: 'bash', policy: 'allow', description: 'Run commands (bounded by maxToolCalls)' },
  { tool: 'glob', policy: 'allow', description: 'File pattern search' },
  { tool: 'grep', policy: 'allow', description: 'Content search' },
  { tool: 'task', policy: 'ask', description: 'Spawn subagents (requires approval)' },
  { tool: 'webfetch', policy: 'ask', description: 'Network fetch (requires approval)' },
  { tool: 'websearch', policy: 'ask', description: 'Web search (requires approval)' },
  { tool: 'external_directory', policy: 'allow', description: 'Access external directories (Assistant only)' },
  { tool: 'question', policy: 'allow', description: 'Ask user questions' },
  { tool: 'doom_loop', policy: 'deny', description: 'Unbounded loops — always denied' },
];

const TIMEOUT_OPTIONS = [
  { value: 10_000, label: '10s' },
  { value: 30_000, label: '30s' },
  { value: 60_000, label: '1m' },
  { value: 300_000, label: '5m' },
  { value: 900_000, label: '15m (default)' },
  { value: 1_800_000, label: '30m' },
] as const;

export function AssistantExecutionPanel({ className = '' }: { className?: string }) {
  const { config, setMaxToolCalls, setTurnTimeoutMs, resetToDefaults, isCustom } = useGAExecutionConfig();
  const effectiveMax = config.maxToolCalls;
  const effectiveLabel = effectiveMax === 0 ? 'unlimited' : `${effectiveMax} calls`;

  return (
      <ReferenceCard
        icon={navIcon('assistant')}
        title="Assistant Execution"
        description="Turn budgets and timeouts — Vestara-owned limits enforced in the adapter. Provider-owned limits (contextWindow, maxOutput) remain at the provider layer. Updates apply to the next turn."
        className={className}
      >
        <SettingsRow
          label="Max tool calls"
          description="Per-turn tool invocation budget. 0 = unlimited (default), 1–200 = capped. Adapter default is unlimited when untouched (env VESTARA_GA_MAX_TOOL_CALLS overrides)."
          value={
            <span className="flex items-center gap-3">
              <input
                type="number"
                aria-label="Max tool calls"
                value={config.maxToolCalls}
                min={0}
                max={200}
                step={5}
                onChange={(e) => setMaxToolCalls(Number(e.target.value))}
                className={`${input} w-24`}
              />
              <Status value={effectiveLabel} />
            </span>
          }
        />
        <SettingsRow
          label="Turn timeout"
          description="Hard cap per turn (ms). Default 15m; min 10s, max 60m."
          value={
            <select
              value={String(config.turnTimeoutMs)}
              onChange={(e) => setTurnTimeoutMs(Number(e.target.value))}
              className={`${input} w-40`}
              aria-label="Turn timeout"
            >
              {TIMEOUT_OPTIONS.map((o) => (
                <option key={o.value} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
          }
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] pt-4">
          <Button onClick={resetToDefaults}>
            Reset to defaults
          </Button>
          <span className="self-center text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            {isCustom ? 'Custom budget active' : 'Using adapter defaults (unlimited calls, 15m)'}
          </span>
        </div>
        <FactRow
          label="Effective budget (next turn)"
          value={effectiveLabel}
          title={isCustom ? 'Persisted override' : 'Adapter default unlimited (untouched, until you change it)'}
        />
        <FactRow
          label="Composer badge"
          value="Shows same effective value in Activity Room"
          title="M11CComposer pill reads this config"
        />
      </ReferenceCard>
  );
}

export function ToolVisibilityPanel({ className = '' }: { className?: string }) {
  return (
      <ReferenceCard
        icon={navIcon('tools')}
        title="Tool visibility"
        description="Which tools the Assistant can use and their permission (allow / ask / deny) — from AGENT registry ASSISTANT_GRANT. Display-only; edits go through Agent configuration."
        className={className}
      >
        {TOOL_ROWS.map((row) => (
          <SettingsRow
            key={row.tool}
            label={row.tool}
            description={row.description}
            value={<Status value={row.policy} />}
          />
        ))}
      </ReferenceCard>
  );
}
