/**
 * GA-TOOL-UX-001B — observation lifecycle through the conversation domain.
 *
 * Verifies (through the public service API with a stub executor):
 * - operationId = OpenCode callID (never the transport chunk id)
 * - terminal evidence for a known operationId replaces its running
 *   projection (one durable snapshot per operation — explicit upsert)
 * - structured read evidence rides the detail (parsed server-side)
 * - generic tools remain compatible; legacy detail-less chunks append
 * - running-only operations persist as running (aborted/detached turns)
 */

import type { StreamChunk } from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import { DefaultConversationService } from '../src/index.js';

let seq = 0;
function chunk(partial: Partial<StreamChunk> & { type: StreamChunk['type'] }): StreamChunk {
  seq += 1;
  return {
    id: `chunk-${seq}`,
    metadata: { sequence: seq, timestamp: new Date().toISOString() },
    ...partial,
  } as StreamChunk;
}

function readDetail(state: 'running' | 'completed' | 'failed', extra: Record<string, unknown> = {}) {
  return {
    contract: 'assistant.execution.v1',
    version: 1,
    operationId: 'call_r1',
    state,
    tool: 'read',
    source: 'opencode',
    timestamp: Date.now(),
    kind: 'read',
    file: 'docs/notes.md',
    fileProvenance: 'runtime-provided',
    contentTruncated: false,
    contentProvenance: state === 'completed' ? 'runtime-provided' : 'unavailable',
    rangeProvenance: state === 'completed' ? 'runtime-provided' : 'unavailable',
    ...(state === 'completed' ? { offset: 1, lineCount: 2, totalLines: 9, contentPreview: '1: a\n2: b' } : {}),
    ...(state === 'failed' ? { error: 'ENOENT' } : {}),
    ...extra,
  };
}

function toolDetail(operationId: string, state: 'running' | 'completed') {
  return {
    contract: 'assistant.execution.v1',
    version: 1,
    operationId,
    state,
    tool: 'bash',
    source: 'opencode',
    timestamp: Date.now(),
    kind: 'tool',
    ...(state === 'completed' ? { preview: 'done' } : {}),
  };
}

const assembler = {
  buildContext: (_conversation: unknown, content: unknown) => ({
    model: 'test-model',
    messages: [{ role: 'user', content: String((content as string) ?? 'hi') }],
  }),
};

function serviceWith(chunks: StreamChunk[]) {
  const executor = {
    async complete() {
      throw new Error('unused');
    },
    async *stream() {
      yield chunk({ type: 'text', content: 'answer' });
      for (const c of chunks) yield c;
    },
  };
  return new DefaultConversationService({ contextAssembler: assembler as any, providerExecutor: executor });
}

async function runTurn(chunks: StreamChunk[]) {
  const service = serviceWith(chunks);
  const conv = await service.createConversation('u1');
  for await (const _ of service.sendMessageStream(conv.id, 'do it')) {
    // drain
  }
  const loaded = await service.getConversation(conv.id);
  const assistant = loaded!.messages.filter((m) => m.role === 'assistant');
  return assistant[assistant.length - 1];
}

describe('GA-TOOL-UX-001B: observation lifecycle', () => {
  it('call/result correlation preserved: one snapshot per operationId, callID identity', async () => {
    const msg = await runTurn([
      chunk({ type: 'tool_call', name: 'read', detail: readDetail('running') as any }),
      chunk({ type: 'tool_result', name: 'read', content: 'x', detail: readDetail('completed') as any }),
    ]);
    expect(msg.toolObservations).toHaveLength(1);
    const obs = msg.toolObservations![0];
    expect(obs.operationId).toBe('call_r1');
    expect(obs.toolCallId).toBe('call_r1');
    expect(obs.toolCallId).not.toMatch(/^chunk-/);
    expect(obs.status).toBe('completed');
    expect(obs.observationKind).toBe('read');
    expect(obs.read?.file).toBe('docs/notes.md');
    expect(obs.read?.contentPreview).toBe('1: a\n2: b');
    expect(obs.content).toBe('1: a\n2: b');
  });

  it('generic tools upsert by operationId and stay generic', async () => {
    const msg = await runTurn([
      chunk({ type: 'tool_call', name: 'bash', detail: toolDetail('call_b1', 'running') as any }),
      chunk({ type: 'tool_result', name: 'bash', content: 'done', detail: toolDetail('call_b1', 'completed') as any }),
    ]);
    expect(msg.toolObservations).toHaveLength(1);
    const obs = msg.toolObservations![0];
    expect(obs.operationId).toBe('call_b1');
    expect(obs.status).toBe('completed');
    expect(obs.observationKind).toBeUndefined();
    expect(obs.read).toBeUndefined();
  });

  it('legacy detail-less chunks append without operation identity', async () => {
    const msg = await runTurn([chunk({ type: 'tool_result', name: 'legacy', content: 'out' })]);
    expect(msg.toolObservations).toHaveLength(1);
    const obs = msg.toolObservations![0];
    expect(obs.operationId).toBeUndefined();
    expect(obs.toolCallId).toMatch(/^chunk-/);
    expect(obs.status).toBe('completed');
  });

  it('running-only operation persists as running (no terminal arrived)', async () => {
    const msg = await runTurn([chunk({ type: 'tool_call', name: 'read', detail: readDetail('running') as any })]);
    expect(msg.toolObservations).toHaveLength(1);
    expect(msg.toolObservations![0].status).toBe('running');
    expect(msg.toolObservations![0].operationId).toBe('call_r1');
  });

  it('failed read persists failed status with bounded error and request file', async () => {
    const msg = await runTurn([
      chunk({
        type: 'tool_result',
        name: 'read',
        content: 'ENOENT',
        detail: readDetail('failed', { file: 'requested/missing.ts', fileProvenance: 'request-context' }) as any,
      }),
    ]);
    const obs = msg.toolObservations![0];
    expect(obs.status).toBe('failed');
    expect(obs.error).toBe('ENOENT');
    expect(obs.read?.fileProvenance).toBe('request-context');
  });

  it('repeated running projections collapse to the latest until the terminal arrives', async () => {
    const msg = await runTurn([
      chunk({ type: 'tool_call', name: 'read', detail: readDetail('running') as any }),
      chunk({ type: 'tool_call', name: 'read', detail: readDetail('running') as any }),
      chunk({ type: 'tool_result', name: 'read', content: 'x', detail: readDetail('completed') as any }),
    ]);
    // Live runtimes emit several running projections per operation: exactly
    // one durable snapshot survives — the terminal.
    expect(msg.toolObservations).toHaveLength(1);
    expect(msg.toolObservations![0].status).toBe('completed');
    expect(msg.toolObservations![0].operationId).toBe('call_r1');
  });

  it('distinct operations persist distinctly in order', async () => {
    const msg = await runTurn([
      chunk({ type: 'tool_call', name: 'read', detail: readDetail('running') as any }),
      chunk({ type: 'tool_result', name: 'read', content: 'x', detail: readDetail('completed') as any }),
      chunk({ type: 'tool_call', name: 'bash', detail: toolDetail('call_b1', 'running') as any }),
      chunk({ type: 'tool_result', name: 'bash', content: 'done', detail: toolDetail('call_b1', 'completed') as any }),
    ]);
    expect(msg.toolObservations).toHaveLength(2);
    expect(msg.toolObservations![0].operationId).toBe('call_r1');
    expect(msg.toolObservations![1].operationId).toBe('call_b1');
  });
});
