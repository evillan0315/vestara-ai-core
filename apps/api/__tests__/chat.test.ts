import type { CompletionRequest, CompletionResponse, ToolDefinition } from '@vestara/shared';
import type { ToolInvocationResult } from '@vestara/tool-runtime';
import type { AgentEnvironment } from '@vestara/types';
import { describe, expect, it, vi } from 'vitest';
import { runToolLoop, scrubToolMarkup } from '../src/routes/chat.js';

const ENV: AgentEnvironment = {
  id: 'env-test' as AgentEnvironment['id'],
  kind: 'local',
  workspaceRoot: '/tmp',
  networkPolicy: 'restricted',
  filesystemPolicy: 'workspace-write',
  processPolicy: 'restricted',
};

function toolDef(name: string): ToolDefinition {
  return {
    id: name,
    name,
    description: name,
    version: '1.0.0',
    permissions: 'read-only',
    requires: ['filesystem'],
    timeout: 30000,
    sandbox: true,
    streaming: false,
    idempotent: true,
    destructive: false,
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    outputSchema: { type: 'object' },
    category: 'filesystem',
  };
}

describe('chat route tool-markup scrubbing', () => {
  it('strips ASCII DSML invoke/parameter blocks', () => {
    const markup =
      'Here is the plan.\n<|DSML|invoke name="Bash">\n<|DSML|parameter name="cmd">ls -la</|DSML|parameter>\n</|DSML|invoke>\nDone.';
    const scrubbed = scrubToolMarkup(markup);
    expect(scrubbed).toContain('Here is the plan.');
    expect(scrubbed).toContain('Done.');
    expect(scrubbed).not.toContain('DSML');
    expect(scrubbed).not.toContain('invoke');
  });

  it('strips self-closing DSML action tags', () => {
    const markup = 'Analyzing now.\n<|DSML|:read_file path="src/index.ts" />\nThen I will continue.';
    const scrubbed = scrubToolMarkup(markup);
    expect(scrubbed).toContain('Analyzing now.');
    expect(scrubbed).toContain('Then I will continue.');
    expect(scrubbed).not.toContain('read_file');
  });

  it('strips fullwidth DSML blocks', () => {
    const markup = '＜｜DSML｜parameter name="cmd" string="true"＞ls -la＜／｜DSML｜parameter＞';
    expect(scrubToolMarkup(markup)).not.toContain('DSML');
  });

  it('leaves plain text and markdown untouched', () => {
    const plain = 'Run `pnpm test` — no markup here.';
    expect(scrubToolMarkup(plain)).toBe(plain);
  });
});

describe('chat route tool loop', () => {
  it('executes a requested tool and feeds the result back to the model', async () => {
    const tool = vi.fn().mockResolvedValue({
      status: 'completed',
      output: { content: 'README contents' },
      evidence: [],
      risk: 'low',
      affectedResources: ['README.md'],
    } satisfies ToolInvocationResult);

    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        id: '1',
        model: 'm',
        provider: 'p',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'filesystem.read', arguments: '{"path":"README.md"}' }],
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latency: 1,
      } satisfies CompletionResponse)
      .mockResolvedValueOnce({
        id: '2',
        model: 'm',
        provider: 'p',
        content: 'The README says hello.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latency: 1,
      } satisfies CompletionResponse);

    const { content, toolResults } = await runToolLoop({
      provider: { complete },
      model: 'm',
      messages: [{ role: 'user', content: 'Read README.md' }],
      tools: [toolDef('filesystem.read')],
      toolsRuntime: { invoke: tool } as never,
      environment: ENV,
      taskId: 'task-1',
    });

    expect(content).toBe('The README says hello.');
    expect(tool).toHaveBeenCalledTimes(1);
    const request = tool.mock.calls[0]?.[0] as { toolName: string; input: unknown; taskId: string };
    expect(request.toolName).toBe('filesystem.read');
    expect(request.input).toEqual({ path: 'README.md' });
    expect(toolResults[0]).toContain('filesystem.read');
  });

  it('stops feeding tools once the model produces a plain answer', async () => {
    const tool = vi.fn();
    const complete = vi.fn().mockResolvedValue({
      id: '1',
      model: 'm',
      provider: 'p',
      content: 'No tools needed.',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      latency: 1,
    } satisfies CompletionResponse);

    const { content, toolResults } = await runToolLoop({
      provider: { complete },
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [toolDef('filesystem.read')],
      toolsRuntime: { invoke: tool } as never,
      environment: ENV,
      taskId: 'task-2',
    });

    expect(content).toBe('No tools needed.');
    expect(tool).not.toHaveBeenCalled();
    expect(toolResults).toEqual([]);
    expect((complete.mock.calls[0][0] as CompletionRequest).tools).toHaveLength(1);
  });

  it('surfaces tool failures without crashing the loop', async () => {
    const tool = vi.fn().mockResolvedValue({
      status: 'failed',
      error: 'file not found',
      evidence: [],
      risk: 'low',
      affectedResources: ['README.md'],
    } satisfies ToolInvocationResult);

    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        id: '1',
        model: 'm',
        provider: 'p',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'filesystem.read', arguments: '{"path":"README.md"}' }],
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latency: 1,
      } satisfies CompletionResponse)
      .mockResolvedValueOnce({
        id: '2',
        model: 'm',
        provider: 'p',
        content: 'Could not read it.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latency: 1,
      } satisfies CompletionResponse);

    const { content, toolResults } = await runToolLoop({
      provider: { complete },
      model: 'm',
      messages: [{ role: 'user', content: 'Read README.md' }],
      tools: [toolDef('filesystem.read')],
      toolsRuntime: { invoke: tool } as never,
      environment: ENV,
      taskId: 'task-3',
    });

    expect(content).toBe('Could not read it.');
    expect(toolResults[0]).toContain('failed');
  });
});
