import type { AgentCard, ToolCard, TuiEvent } from './types.js';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function humanizeTool(tool: string, resource?: string): string {
  const action = tool.split('.').at(-1) ?? tool;
  const labels: Record<string, string> = {
    read: 'Reading',
    write: 'Writing',
    search: 'Searching workspace',
    execute: 'Running command',
    build: 'Running build',
    test: 'Running tests',
  };
  return `${labels[action] ?? action.replace(/-/g, ' ')}${resource ? ` ${resource}` : ''}`;
}

/**
 * Remove raw model tool-call markup (DSML / opencode `<|DSML|...>` blocks) from
 * streamed conversation text so the TUI never displays raw invocation syntax.
 * Handles ASCII and fullwidth bracket variants, whole invoke/parameter blocks
 * and dangling tags.
 */
export function scrubToolMarkup(content: string): string {
  if (!content || !/(DSML|<\s*\/?\s*(invoke|parameter|result))/i.test(content)) return content;

  // ASCII blocks: <|DSML|invoke ...> ... </|DSML|invoke> (including nested parameter tags)
  let out = content.replace(/<\|DSML\|[\s\S]*?<\/\|DSML\|invoke>/gi, '');
  // Fullwidth blocks: ＜｜DSML｜invoke ...＞ ... ＜／｜DSML｜invoke＞
  out = out.replace(/＜｜DSML｜[\s\S]*?＜／｜DSML｜invoke＞/g, '');
  // Bare invoke/parameter tags and their payload (heuristic, non-greedy across lines)
  out = out.replace(/(^|\n)\s*<\|DSML\|[^\n]*(\n[ \t]*<\|DSML\|[^\n]*)*/gi, '$1');
  out = out.replace(/(^|\n)\s*＜｜DSML｜[^\n]*/g, '$1');
  // Dangling close/attribute fragments left over
  out = out.replace(/<\/?\|?DSML\|?[^>]*>/gi, '');
  out = out.replace(/＜\/(｜)?DSML｜＞/g, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

export function normalizeRuntimeEvent(raw: unknown): readonly TuiEvent[] {
  const event = record(raw);
  const type = text(event.type) ?? '';
  const payload = record(event.payload ?? event.metadata);
  const timestamp = text(event.timestamp) ?? new Date().toISOString();
  if (type === 'system.heartbeat') return [{ type: 'connection', state: 'connected' }];

  if (type.includes('tool.call') || type.startsWith('tool.')) {
    const tool = text(payload.toolName) ?? text(payload.tool) ?? text(payload.operation) ?? 'tool';
    const resource = text(payload.filePath) ?? text(payload.resource);
    const failed = type.includes('failed') || payload.status === 'failed';
    const completed = type.includes('completed') || payload.status === 'completed';
    const approval = type.includes('approval') || payload.status === 'approval-required';
    const card: ToolCard = {
      id: text(payload.callId) ?? text(event.id) ?? `tool-${timestamp}`,
      tool,
      label: humanizeTool(tool, resource),
      status: approval ? 'approval-required' : failed ? 'failed' : completed ? 'completed' : 'running',
      startedAt: timestamp,
      detail: text(payload.detail) ?? text(payload.message),
    };
    return [{ type: 'tool', card }];
  }

  if (type.startsWith('agent.')) {
    const agent: AgentCard = {
      id: text(payload.agentId) ?? text(payload.agent) ?? 'agent',
      name: text(payload.agentName) ?? text(payload.agentId) ?? text(payload.agent) ?? 'Agent',
      status: text(payload.status) ?? (type.includes('completed') ? 'completed' : 'working'),
      task: text(payload.task) ?? text(payload.detail),
      progress: typeof payload.progress === 'number' ? payload.progress : undefined,
      tokens: typeof payload.tokens === 'number' ? payload.tokens : undefined,
      elapsedMs: typeof payload.elapsedMs === 'number' ? payload.elapsedMs : undefined,
    };
    return [{ type: 'agent', agent }];
  }

  if (type.includes('failed'))
    return [{ type: 'notification', level: 'error', message: text(event.message) ?? text(payload.message) ?? type }];
  if (type.includes('completed'))
    return [{ type: 'notification', level: 'success', message: text(event.message) ?? text(payload.message) ?? type }];
  if (type.startsWith('workspace.') || type.startsWith('verification.') || type.startsWith('plan.'))
    return [
      {
        type: 'telemetry',
        label: type,
        detail: text(event.message) ?? text(payload.detail) ?? '',
        timestamp,
      },
    ];
  return [];
}
