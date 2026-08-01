import { createWorkspaceCommand } from '@vestara/configuration';
import { HttpWorkspaceRuntimeClient } from '@vestara/workspace';

export type ConsoleEvent =
  | { type: 'status'; content: string }
  | { type: 'output'; content: string }
  | { type: 'output-start' }
  | { type: 'output-delta'; content: string }
  | { type: 'output-end' }
  | { type: 'error'; content: string }
  | { type: 'confirmation'; prompt: string; command: string }
  | { type: 'clear' }
  | { type: 'exit' };

export interface ConsoleControllerOptions {
  endpoint?: string;
}

export class ConsoleController {
  private readonly client: HttpWorkspaceRuntimeClient;
  private readonly endpoint: URL;

  constructor(options: ConsoleControllerOptions = {}) {
    this.client = new HttpWorkspaceRuntimeClient({ endpoint: options.endpoint });
    this.endpoint = new URL(options.endpoint ?? process.env.VESTARA_API_URL ?? 'http://127.0.0.1:3001');
  }

  async *execute(rawInput: string, signal?: AbortSignal): AsyncGenerator<ConsoleEvent> {
    const input = rawInput.trim();
    if (!input) return;
    const [command, ...args] = splitArguments(input);
    if (command === 'exit' || command === 'quit') {
      yield { type: 'exit' };
      return;
    }
    if (command === 'clear') {
      yield { type: 'clear' };
      return;
    }
    if (command === 'help' || command === '?') {
      yield {
        type: 'output',
        content: [
          'Commands',
          '  status',
          '  routing show',
          '  routing catalog',
          '  routing profile <id>',
          '  routing preview <role> <agent-id>',
          '  routing assignments',
          '  routing reassign <task> <revision> <agent> <provider> <model> --reason "reason"',
          '  <plain language prompt>',
          '  clear',
          '  exit',
        ].join('\n'),
      };
      return;
    }

    yield { type: 'status', content: 'Connecting to Workspace Runtime…' };
    try {
      const status = await this.client.getStatus();
      if (signal?.aborted) return;
      if (command === 'status') {
        yield {
          type: 'output',
          content: `Workspace ${status.workspaceId}\nRuntime ${status.status} · v${status.runtimeVersion}\nAPI ${status.apiEndpoint}`,
        };
        return;
      }
      if (command === 'routing') yield* this.executeRouting(status.workspaceId, args, signal, input);
      else yield* this.streamConversation(input, signal);
    } catch (error) {
      if (!signal?.aborted) yield { type: 'error', content: error instanceof Error ? error.message : String(error) };
    }
  }

  private async *executeRouting(
    workspaceId: string,
    args: string[],
    signal?: AbortSignal,
    rawInput = '',
  ): AsyncGenerator<ConsoleEvent> {
    const action = args[0] ?? 'show';
    if (action === 'show') {
      const selection = await this.client.execute<any>(
        createWorkspaceCommand({ workspaceId, source: 'cli', type: 'routing.selection.get' }),
      );
      if (!signal?.aborted)
        yield {
          type: 'output',
          content: `Profile ${selection.selection.profileId}\nRevision ${selection.revision} · ${selection.updatedByClientId}\n${formatRoles(selection.selection.roles)}`,
        };
      return;
    }
    if (action === 'catalog') {
      const catalog = await this.client.execute<any>(
        createWorkspaceCommand({ workspaceId, source: 'cli', type: 'routing.catalog.get' }),
      );
      if (!signal?.aborted)
        yield {
          type: 'output',
          content: [
            'Profiles',
            ...catalog.profiles.map((profile: any) => `  ${profile.id.padEnd(20)} ${profile.description}`),
            '',
            'Provider models',
            ...catalog.candidates.map(
              (candidate: any) =>
                `  ${candidate.ref.providerId}/${candidate.ref.modelId} · ${candidate.availability.state} · ${candidate.locality}`,
            ),
          ].join('\n'),
        };
      return;
    }
    if (action === 'assignments') {
      const result = await this.client.execute<any>(
        createWorkspaceCommand({ workspaceId, source: 'cli', type: 'routing.assignment.list' }),
      );
      if (!signal?.aborted)
        yield {
          type: 'output',
          content: result.assignments.length
            ? result.assignments
                .map(
                  (assignment: any) =>
                    `${assignment.taskId} r${assignment.revision} · ${assignment.status} · ${assignment.agentId} · ${assignment.route.providerId}/${assignment.route.modelId}${assignment.sideEffectsRecorded ? ' · side effects' : ''}`,
                )
                .join('\n')
            : 'No governed task assignments.',
        };
      return;
    }
    if (action === 'profile') {
      if (!args[1]) throw new Error('Usage: routing profile <profile-id>');
      const current = await this.client.execute<any>(
        createWorkspaceCommand({ workspaceId, source: 'cli', type: 'routing.selection.get' }),
      );
      const updated = await this.client.execute<any>(
        createWorkspaceCommand({
          workspaceId,
          source: 'cli',
          type: 'routing.selection.update',
          payload: {
            selection: { ...current.selection, profileId: args[1] },
            expectedRevision: current.revision,
          },
        }),
      );
      if (!signal?.aborted)
        yield {
          type: 'output',
          content: `Routing profile updated to ${updated.selection.profileId} · r${updated.revision}`,
        };
      return;
    }
    if (action === 'preview') {
      if (!args[1] || !args[2]) throw new Error('Usage: routing preview <role> <agent-id>');
      const result = await this.client.execute<any>(
        createWorkspaceCommand({
          workspaceId,
          source: 'cli',
          type: 'routing.preview',
          payload: { role: args[1], agentId: args[2] },
        }),
      );
      if (!signal?.aborted)
        yield {
          type: 'output',
          content: [
            'Execution routing',
            `Agent       ${result.evidence.selectedAgentId} (${result.evidence.agentRole})`,
            `Provider    ${result.selected.providerName} (${result.selected.ref.providerId})`,
            `Model       ${result.selected.ref.modelId}`,
            `Policy      ${result.evidence.policyId}`,
            `Reason      ${result.evidence.reasonCodes.join(', ')}`,
            `Rejected    ${result.evidence.rejectedCandidates.length}`,
          ].join('\n'),
        };
      return;
    }
    if (action === 'reassign') {
      const [taskId, revisionText, agentId, providerId, modelId] = args.slice(1, 6);
      const reasonIndex = args.indexOf('--reason');
      const reason = reasonIndex >= 0 ? args[reasonIndex + 1] : undefined;
      const expectedRevision = Number(revisionText);
      if (!taskId || !Number.isInteger(expectedRevision) || !agentId || !providerId || !modelId || !reason)
        throw new Error('Usage: routing reassign <task> <revision> <agent> <provider> <model> --reason "reason"');
      if (!args.includes('--confirmed')) {
        yield {
          type: 'confirmation',
          prompt: `Reassign ${taskId} to ${agentId} using ${providerId}/${modelId}?`,
          command: `${rawInput} --confirmed`,
        };
        return;
      }
      const result = await this.client.execute<any>(
        createWorkspaceCommand({
          workspaceId,
          source: 'cli',
          type: 'routing.assignment.reassign',
          payload: {
            taskId,
            expectedRevision,
            agentId,
            route: { providerId, modelId },
            reason,
            approved: args.includes('--approve'),
          },
        }),
      );
      if (result.status === 'approval-required') {
        yield {
          type: 'confirmation',
          prompt: `${taskId} is paused with side effects recorded. Approve handoff at revision ${result.assignment.revision}?`,
          command: `routing reassign ${taskId} ${result.assignment.revision} ${agentId} ${providerId} ${modelId} --reason "${reason}" --approve --confirmed`,
        };
      } else {
        yield {
          type: 'output',
          content: `${taskId} reassigned to ${agentId} via ${providerId}/${modelId}. Work remains paused until explicitly resumed.`,
        };
      }
      return;
    }
    throw new Error(`Unknown routing command: ${action}`);
  }

  private async *streamConversation(message: string, signal?: AbortSignal): AsyncGenerator<ConsoleEvent> {
    yield { type: 'output-start' };
    const response = await fetch(new URL('/api/chat/stream', this.endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vestara-Source': 'cli' },
      body: JSON.stringify({ message }),
      signal,
    });
    if (!response.ok || !response.body) throw new Error(`Conversation stream unavailable: ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done || signal?.aborted) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const line = frame.split('\n').find((candidate) => candidate.startsWith('data: '));
        if (!line) continue;
        const event = JSON.parse(line.slice(6)) as { type: string; content?: string };
        if (event.type === 'text' && event.content) yield { type: 'output-delta', content: event.content };
        if (event.type === 'error') throw new Error(event.content ?? 'Conversation failed');
      }
    }
    yield { type: 'output-end' };
  }
}

function formatRoles(roles: Record<string, { providerId: string; modelId: string }>): string {
  const entries = Object.entries(roles);
  return entries.length
    ? entries.map(([role, ref]) => `${role.padEnd(14)} ${ref.providerId}/${ref.modelId}`).join('\n')
    : 'Role defaults resolved automatically.';
}

export function splitArguments(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
  for (const match of input.matchAll(pattern)) tokens.push(match[1] ?? match[2] ?? match[3]);
  return tokens;
}
