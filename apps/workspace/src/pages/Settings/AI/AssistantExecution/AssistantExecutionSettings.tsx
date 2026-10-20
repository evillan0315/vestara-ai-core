import { navIcon } from '../../../../layouts/workspace-navigation.js';
import { ReferenceCard, SettingsRow, Status } from '../../settings-ui';

/**
 * Assistant Execution — tool visibility matrix.
 *
 * Turn budgets live in the persisted `assistant-execution` configuration
 * section (rendered by PolicySection, saved through settings-client) and are
 * enforced by assistant-opencode-adapter. This panel is display-only: the
 * tool matrix reads the Assistant capability policy (allow / ask / deny).
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
