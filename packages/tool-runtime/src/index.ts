import type { FilesystemRuntime } from '@vestara/filesystem-runtime';
import type { ToolDefinition } from '@vestara/shared';
import type {
  AgentEnvironment,
  EvidenceArtifact,
  PolicyEvaluationInput,
  PolicyEvaluationResult,
  ToolCallId,
  ToolRisk,
} from '@vestara/types';

export interface ToolInputSchema<TInput> {
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  parse(input: unknown): TInput;
}

export interface ToolExecutionContext {
  readonly agentId: string;
  readonly taskId: string;
  readonly environment: AgentEnvironment;
  readonly signal: AbortSignal;
  /** Optional progress stream for long-running tools (e.g. git, shell). */
  readonly reportProgress?: (progress: {
    readonly stream: 'status' | 'stdout' | 'stderr';
    readonly content: string;
  }) => void;
}

export interface ToolExecutionResult<TOutput> {
  readonly status: 'completed' | 'failed' | 'cancelled';
  readonly output?: TOutput;
  readonly error?: string;
  readonly evidence: readonly EvidenceArtifact[];
}

export interface VestaraTool<TInput, TOutput> {
  readonly name: string;
  readonly description: string;
  readonly risk: ToolRisk;
  readonly inputSchema: ToolInputSchema<TInput>;
  affectedResources(input: TInput): readonly string[];
  execute(input: TInput, context: ToolExecutionContext): Promise<ToolExecutionResult<TOutput>>;
}

export interface ToolPolicyEvaluator {
  evaluate(input: PolicyEvaluationInput): Promise<PolicyEvaluationResult>;
}

export interface ToolCallRequest {
  readonly callId: ToolCallId;
  readonly toolName: string;
  readonly input: unknown;
  readonly agentId: string;
  readonly taskId: string;
  readonly environment: AgentEnvironment;
  readonly predictedImpact?: string;
}

export type ToolInvocationResult =
  | {
      readonly status: 'approval-required';
      readonly reason: string;
      readonly risk: ToolRisk;
      readonly affectedResources: readonly string[];
    }
  | {
      readonly status: 'denied';
      readonly reason: string;
      readonly risk: ToolRisk;
      readonly affectedResources: readonly string[];
    }
  | {
      readonly status: 'completed' | 'failed' | 'cancelled';
      readonly output?: unknown;
      readonly error?: string;
      readonly evidence: readonly EvidenceArtifact[];
      readonly risk: ToolRisk;
      readonly affectedResources: readonly string[];
    };

export class RiskBasedToolPolicy implements ToolPolicyEvaluator {
  async evaluate(input: PolicyEvaluationInput): Promise<PolicyEvaluationResult> {
    if (input.risk === 'critical') return { decision: 'deny', reason: 'Critical-risk tools are denied by default' };
    if (input.risk === 'high') return { decision: 'require-approval', reason: 'High-risk tool requires approval' };
    return {
      decision: input.risk === 'medium' ? 'allow-and-notify' : 'allow',
      reason: input.risk === 'medium' ? 'Medium-risk tool is allowed with notification' : 'Low-risk tool is allowed',
    };
  }
}

interface RegisteredTool {
  readonly name: string;
  readonly definition: ToolDefinition;
  readonly risk: ToolRisk;
  readonly parse: (input: unknown) => unknown;
  readonly affectedResources: (input: unknown) => readonly string[];
  readonly execute: (input: unknown, context: ToolExecutionContext) => Promise<ToolExecutionResult<unknown>>;
}

export class ToolRuntime {
  private readonly tools = new Map<string, RegisteredTool>();

  constructor(private readonly policy: ToolPolicyEvaluator = new RiskBasedToolPolicy()) {}

  register<TInput, TOutput>(tool: VestaraTool<TInput, TOutput>): void {
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    this.tools.set(tool.name, {
      name: tool.name,
      definition: {
        id: tool.name,
        name: tool.name,
        description: tool.description,
        version: '1.0.0',
        permissions: tool.risk === 'low' ? 'read-only' : 'user-confirm',
        requires: [tool.name.split('.')[0] ?? 'custom'],
        timeout: 30_000,
        sandbox: true,
        streaming: false,
        idempotent: tool.risk === 'low',
        destructive: tool.risk === 'high' || tool.risk === 'critical',
        inputSchema: { ...tool.inputSchema.jsonSchema },
        outputSchema: { type: 'object' },
        category: tool.name.startsWith('filesystem.') ? 'filesystem' : 'custom',
      },
      risk: tool.risk,
      parse: (input) => tool.inputSchema.parse(input),
      affectedResources: (input) => tool.affectedResources(input as TInput),
      execute: async (input, context) => tool.execute(input as TInput, context),
    });
  }

  list(): readonly { readonly name: string; readonly risk: ToolRisk }[] {
    return [...this.tools.values()].map((tool) => ({ name: tool.name, risk: tool.risk }));
  }

  definitions(): readonly ToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async invoke(request: ToolCallRequest, signal: AbortSignal, approved = false): Promise<ToolInvocationResult> {
    const tool = this.tools.get(request.toolName);
    if (!tool) throw new Error(`Tool not found: ${request.toolName}`);
    const input = tool.parse(request.input);
    const affectedResources = tool.affectedResources(input);
    const evaluation = await this.policy.evaluate({
      agentId: request.agentId,
      taskId: request.taskId,
      toolName: request.toolName,
      risk: tool.risk,
      environmentId: request.environment.id,
      affectedResources,
      predictedImpact: request.predictedImpact,
    });
    if (evaluation.decision === 'deny' || evaluation.decision === 'require-sandbox') {
      return { status: 'denied', reason: evaluation.reason, risk: tool.risk, affectedResources };
    }
    if (evaluation.decision === 'require-approval' && !approved) {
      return { status: 'approval-required', reason: evaluation.reason, risk: tool.risk, affectedResources };
    }
    if (signal.aborted) return { status: 'cancelled', risk: tool.risk, affectedResources, evidence: [] };
    const result = await tool.execute(input, {
      agentId: request.agentId,
      taskId: request.taskId,
      environment: request.environment,
      signal,
      reportProgress: () => {},
    });
    return { ...result, risk: tool.risk, affectedResources };
  }
}

interface FilesystemReadInput {
  readonly path: string;
}

interface FilesystemSearchInput {
  readonly pattern: string;
  readonly searchDir?: string;
}

interface FilesystemWriteInput {
  readonly path: string;
  readonly content: string;
  readonly reason?: string;
}

function recordInput(input: unknown): Readonly<Record<string, unknown>> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Tool input must be an object');
  return input as Record<string, unknown>;
}

function requiredString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Tool input requires non-empty string: ${key}`);
  return value;
}

function optionalString(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`Tool input must be a string: ${key}`);
  return value;
}

export class FilesystemReadTool implements VestaraTool<FilesystemReadInput, { readonly content: string }> {
  readonly name = 'filesystem.read';
  readonly description = 'Read a UTF-8 file inside the active workspace';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<FilesystemReadInput> = {
    jsonSchema: {
      type: 'object',
      properties: { path: { type: 'string', minLength: 1 } },
      required: ['path'],
      additionalProperties: false,
    },
    parse(input) {
      const record = recordInput(input);
      return { path: requiredString(record, 'path') };
    },
  };

  constructor(private readonly filesystem: FilesystemRuntime) {}

  affectedResources(input: FilesystemReadInput): readonly string[] {
    return [input.path];
  }

  async execute(
    input: FilesystemReadInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ content: string }>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    const result = await this.filesystem.read(input.path, context.agentId);
    if (!result.ok || result.data === undefined)
      return { status: 'failed', error: result.error ?? 'Filesystem read returned no content', evidence: [] };
    return {
      status: 'completed',
      output: { content: result.data },
      evidence: [
        {
          id: result.operation.id,
          kind: 'file',
          summary: `Read ${input.path}`,
          uri: input.path,
          metadata: { operation: 'read', workspaceRoot: context.environment.workspaceRoot },
        },
      ],
    };
  }
}

export class FilesystemSearchTool
  implements VestaraTool<FilesystemSearchInput, { readonly matches: readonly string[] }>
{
  readonly name = 'filesystem.search';
  readonly description =
    'Search file contents for a pattern inside the active workspace (prefix with glob: to match filenames)';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<FilesystemSearchInput> = {
    jsonSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', minLength: 1 },
        searchDir: { type: 'string' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
    parse(input) {
      const record = recordInput(input);
      return {
        pattern: requiredString(record, 'pattern'),
        searchDir: optionalString(record, 'searchDir'),
      };
    },
  };

  constructor(private readonly filesystem: FilesystemRuntime) {}

  affectedResources(input: FilesystemSearchInput): readonly string[] {
    return [input.searchDir ?? '.'];
  }

  async execute(
    input: FilesystemSearchInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ matches: readonly string[] }>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    const result = await this.filesystem.search(input.pattern, input.searchDir, context.agentId);
    if (!result.ok || result.data === undefined)
      return { status: 'failed', error: result.error ?? 'Filesystem search returned no results', evidence: [] };
    return {
      status: 'completed',
      output: { matches: result.data },
      evidence: [
        {
          id: result.operation.id,
          kind: 'file',
          summary: `Searched for "${input.pattern}"`,
          uri: input.searchDir ?? '.',
          metadata: { operation: 'search', workspaceRoot: context.environment.workspaceRoot },
        },
      ],
    };
  }
}

export class FilesystemWriteTool
  implements VestaraTool<FilesystemWriteInput, { readonly path: string; readonly size: number }>
{
  readonly name = 'filesystem.write';
  readonly description = 'Write a UTF-8 file inside the active workspace';
  readonly risk = 'medium' as const;
  readonly inputSchema: ToolInputSchema<FilesystemWriteInput> = {
    jsonSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1 },
        content: { type: 'string', minLength: 1 },
        reason: { type: 'string' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    parse(input) {
      const record = recordInput(input);
      return {
        path: requiredString(record, 'path'),
        content: requiredString(record, 'content'),
        reason: optionalString(record, 'reason'),
      };
    },
  };

  constructor(private readonly filesystem: FilesystemRuntime) {}

  affectedResources(input: FilesystemWriteInput): readonly string[] {
    return [input.path];
  }

  async execute(
    input: FilesystemWriteInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<{ path: string; size: number }>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    const result = await this.filesystem.write(input.path, input.content, {
      agentId: context.agentId,
      reason: input.reason,
    });
    if (!result.ok || result.data === undefined)
      return { status: 'failed', error: result.error ?? 'Filesystem write returned no result', evidence: [] };
    return {
      status: 'completed',
      output: result.data,
      evidence: [
        {
          id: result.operation.id,
          kind: 'file',
          summary: `Wrote ${input.path}`,
          uri: input.path,
          metadata: {
            operation: 'write',
            size: result.data.size,
            changes: result.observation?.changes ?? {},
          },
        },
      ],
    };
  }
}
