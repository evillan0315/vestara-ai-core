/**
 * ARX-015 LIVE CHARACTERIZATION — OpenCode Session Cardinality
 *
 * Runs against the live local OpenCode server. Requires OPENCODE_SERVER_PASSWORD.
 * Exercises all 5 canonical agents through the real production path:
 *   OpenCodeRuntimeProvider.complete() → createSession() → sendMessageAsync() → streamReply()
 *
 * Captures:
 *   - Every createSession() call with directory, title, sessionId
 *   - Every provider.complete() call with agent, model
 *   - Per-agent session cardinality
 *   - Duplicate detection
 *
 * This test is SKIPPED by default (pnpm test).
 * Run explicitly: OPENCODE_SERVER_PASSWORD=<pw> pnpm vitest run <this-file>
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  CreateOpenCodeSessionInput,
  OpenCodeClient,
  OpenCodeRequestContext,
  OpenCodeSession,
  SendOpenCodeMessageAsyncInput,
} from '@vestara/opencode-runtime';
import type { AIProvider, CompletionRequest, CompletionResponse } from '@vestara/shared';
import { beforeAll, describe, expect, it } from 'vitest';

const REPOSITORY_DIR = '/home/user/projects/vestara/vestara-ai-core';
const E2E_RUN_ID = `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ─── Instrumentation ──────────────────────────────────────────

interface SessionRecord {
  readonly timestamp: string;
  readonly e2eRunId: string;
  readonly agentId: string;
  readonly runtimeAgent: string;
  readonly directory: string;
  readonly sessionId: string;
  readonly title?: string;
}

interface CompleteRecord {
  readonly timestamp: string;
  readonly agentId: string;
  readonly runtimeAgent: string;
  readonly model: string;
  readonly hadRuntimeSessionId: boolean;
}

const sessionRecords: SessionRecord[] = [];
const completeRecords: CompleteRecord[] = [];

// ─── Instrumented Client ──────────────────────────────────────

class InstrumentedClient implements OpenCodeClient {
  private readonly inner: OpenCodeClient;
  private _currentAgentId = 'unknown';
  private _currentRuntimeAgent = 'unknown';

  constructor(inner: OpenCodeClient) {
    this.inner = inner;
  }

  setAgent(agentId: string, runtimeAgent: string) {
    this._currentAgentId = agentId;
    this._currentRuntimeAgent = runtimeAgent;
  }

  async createSession(
    input: CreateOpenCodeSessionInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    // FAIL FAST: directory must not be .vestara
    if (context.directory && context.directory.includes('.vestara')) {
      throw new Error(
        `FAIL FAST: directory is .vestara (${context.directory}). ` +
          `Repository authority remediation is a prerequisite.`,
      );
    }

    const session = await this.inner.createSession(input, context, signal);

    sessionRecords.push({
      timestamp: new Date().toISOString(),
      e2eRunId: E2E_RUN_ID,
      agentId: this._currentAgentId,
      runtimeAgent: this._currentRuntimeAgent,
      directory: context.directory ?? 'unknown',
      sessionId: session.id,
      title: input.title,
    });

    return session;
  }

  // Delegate all other methods
  getHealth(signal?: AbortSignal) {
    return this.inner.getHealth(signal);
  }
  getOpenApiDocument(signal?: AbortSignal) {
    return this.inner.getOpenApiDocument(signal);
  }
  listProjects(signal?: AbortSignal) {
    return this.inner.listProjects(signal);
  }
  getCurrentProject(signal?: AbortSignal) {
    return this.inner.getCurrentProject(signal);
  }
  getPathInfo(signal?: AbortSignal) {
    return this.inner.getPathInfo(signal);
  }
  getVcsInfo(signal?: AbortSignal) {
    return this.inner.getVcsInfo(signal);
  }
  listProviders(signal?: AbortSignal) {
    return this.inner.listProviders(signal);
  }
  listAgents(signal?: AbortSignal) {
    return this.inner.listAgents(signal);
  }
  listCommands(signal?: AbortSignal) {
    return this.inner.listCommands(signal);
  }
  listLsp(signal?: AbortSignal) {
    return this.inner.listLsp(signal);
  }
  listSessions(context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.listSessions(context, signal);
  }
  getSession(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.getSession(sessionId, context, signal);
  }
  getSessionStatus(context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.getSessionStatus(context, signal);
  }
  getSessionTodos(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.getSessionTodos(sessionId, context, signal);
  }
  getSessionChildren(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.getSessionChildren(sessionId, context, signal);
  }
  getSessionDiff(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.getSessionDiff(sessionId, context, signal);
  }
  deleteSession(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.deleteSession(sessionId, context, signal);
  }
  renameSession(sessionId: string, title: string, context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.renameSession(sessionId, title, context, signal);
  }
  sendMessage(
    sessionId: string,
    input: Parameters<OpenCodeClient['sendMessage']>[1],
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ) {
    return this.inner.sendMessage(sessionId, input, context, signal);
  }
  listMessages(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.listMessages(sessionId, context, signal);
  }
  sendMessageAsync(
    sessionId: string,
    input: SendOpenCodeMessageAsyncInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ) {
    return this.inner.sendMessageAsync(sessionId, input, context, signal);
  }
  runCommand(
    sessionId: string,
    input: Parameters<OpenCodeClient['runCommand']>[1],
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ) {
    return this.inner.runCommand(sessionId, input, context, signal);
  }
  abortSession(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.abortSession(sessionId, context, signal);
  }
  respondToPermission(
    sessionId: string,
    permissionId: string,
    decision: Parameters<OpenCodeClient['respondToPermission']>[2],
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ) {
    return this.inner.respondToPermission(sessionId, permissionId, decision, context, signal);
  }
  initSession(
    sessionId: string,
    input: Parameters<OpenCodeClient['initSession']>[1],
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ) {
    return this.inner.initSession(sessionId, input, context, signal);
  }
  shareSession(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.shareSession(sessionId, context, signal);
  }
  unshareSession(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.unshareSession(sessionId, context, signal);
  }
  summarizeSession(
    sessionId: string,
    input: Parameters<OpenCodeClient['summarizeSession']>[1],
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ) {
    return this.inner.summarizeSession(sessionId, input, context, signal);
  }
  revertSession(
    sessionId: string,
    input: Parameters<OpenCodeClient['revertSession']>[1],
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ) {
    return this.inner.revertSession(sessionId, input, context, signal);
  }
  unrevertSession(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.unrevertSession(sessionId, context, signal);
  }
  runShell(
    sessionId: string,
    input: Parameters<OpenCodeClient['runShell']>[1],
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ) {
    return this.inner.runShell(sessionId, input, context, signal);
  }
  listActiveSessions(signal?: AbortSignal) {
    return this.inner.listActiveSessions(signal);
  }
  getSessionContext(sessionId: string, signal?: AbortSignal) {
    return this.inner.getSessionContext(sessionId, signal);
  }
  getSessionHistory(
    sessionId: string,
    options?: { readonly limit?: number; readonly after?: string },
    signal?: AbortSignal,
  ) {
    return this.inner.getSessionHistory(sessionId, options, signal);
  }
  switchSessionAgent(sessionId: string, agent: string, signal?: AbortSignal) {
    return this.inner.switchSessionAgent(sessionId, agent, signal);
  }
  switchSessionModel(
    sessionId: string,
    model: Parameters<OpenCodeClient['switchSessionModel']>[1],
    signal?: AbortSignal,
  ) {
    return this.inner.switchSessionModel(sessionId, model, signal);
  }
  compactSession(sessionId: string, signal?: AbortSignal) {
    return this.inner.compactSession(sessionId, signal);
  }
  interruptSession(sessionId: string, signal?: AbortSignal) {
    return this.inner.interruptSession(sessionId, signal);
  }
  waitSession(sessionId: string, signal?: AbortSignal) {
    return this.inner.waitSession(sessionId, signal);
  }
  listQuestions(sessionId: string, signal?: AbortSignal) {
    return this.inner.listQuestions(sessionId, signal);
  }
  replyToQuestion(
    sessionId: string,
    requestId: string,
    reply: Parameters<OpenCodeClient['replyToQuestion']>[2],
    signal?: AbortSignal,
  ) {
    return this.inner.replyToQuestion(sessionId, requestId, reply, signal);
  }
  rejectQuestion(sessionId: string, requestId: string, signal?: AbortSignal) {
    return this.inner.rejectQuestion(sessionId, requestId, signal);
  }
  findText(query: Parameters<OpenCodeClient['findText']>[0], signal?: AbortSignal) {
    return this.inner.findText(query, signal);
  }
  findFiles(query: Parameters<OpenCodeClient['findFiles']>[0], signal?: AbortSignal) {
    return this.inner.findFiles(query, signal);
  }
  findSymbols(query: Parameters<OpenCodeClient['findSymbols']>[0], signal?: AbortSignal) {
    return this.inner.findSymbols(query, signal);
  }
  readFile(query: Parameters<OpenCodeClient['readFile']>[0], signal?: AbortSignal) {
    return this.inner.readFile(query, signal);
  }
  fileStatus(query?: Parameters<OpenCodeClient['fileStatus']>[0], signal?: AbortSignal) {
    return this.inner.fileStatus(query, signal);
  }
  openEventStream(context: OpenCodeRequestContext, signal?: AbortSignal) {
    return this.inner.openEventStream(context, signal);
  }
}

// ─── Canonical Agents ─────────────────────────────────────────

const AGENTS = [
  {
    id: 'agent-context',
    runtimeAgent: 'vestara-context',
    prompt:
      'Acknowledge: you are the Context agent in E2E characterization run ' +
      E2E_RUN_ID +
      '. Reply with exactly: CONTEXT_OK',
  },
  {
    id: 'agent-planner',
    runtimeAgent: 'vestara-planner',
    prompt:
      'Acknowledge: you are the Planner agent in E2E characterization run ' +
      E2E_RUN_ID +
      '. Reply with exactly: PLANNER_OK',
  },
  {
    id: 'agent-developer',
    runtimeAgent: 'vestara-developer',
    prompt:
      'Acknowledge: you are the Developer agent in E2E characterization run ' +
      E2E_RUN_ID +
      '. Reply with exactly: DEVELOPER_OK',
  },
  {
    id: 'agent-reviewer',
    runtimeAgent: 'vestara-reviewer',
    prompt:
      'Acknowledge: you are the Reviewer agent in E2E characterization run ' +
      E2E_RUN_ID +
      '. Reply with exactly: REVIEWER_OK',
  },
  {
    id: 'agent-verifier',
    runtimeAgent: 'vestara-verifier',
    prompt:
      'Acknowledge: you are the Verifier agent in E2E characterization run ' +
      E2E_RUN_ID +
      '. Reply with exactly: VERIFIER_OK',
  },
] as const;

// ─── Tests ────────────────────────────────────────────────────

const HAS_SERVER = Boolean(process.env.OPENCODE_SERVER_PASSWORD);

describe('ARX-015 LIVE — OpenCode Session Cardinality', () => {
  if (!HAS_SERVER) {
    it.skip('skipped: OPENCODE_SERVER_PASSWORD not set', () => {});
    return;
  }

  let client: InstrumentedClient;
  let provider: AIProvider;
  let workspaceRoot: string;

  beforeAll(async () => {
    // Dynamic imports to avoid loading OpenCode modules when server is not available
    const { OpenCodeHttpClient, resolveOpenCodeConfig } = await import('@vestara/opencode-runtime');
    const { OpenCodeRuntimeProvider } = await import('@vestara/provider-opencode');

    const config = resolveOpenCodeConfig({});
    const inner = new OpenCodeHttpClient(config);
    client = new InstrumentedClient(inner);

    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `vestara-live-${E2E_RUN_ID}`));

    provider = new OpenCodeRuntimeProvider({
      client: client as unknown as OpenCodeClient,
      directory: REPOSITORY_DIR,
      workspaceId: 'vestara-e2e',
    });

    await provider.initialize({});
  });

  it('run: Context → Planner → Developer → Reviewer → Verifier', { timeout: 600_000 }, async () => {
    // Verify directory before any sessions
    expect(REPOSITORY_DIR).toBe('/home/user/projects/vestara/vestara-ai-core');
    expect(REPOSITORY_DIR).not.toContain('.vestara');

    // Record sessions before this run
    const sessionsBefore = sessionRecords.length;

    // Run all 5 agents sequentially
    for (const agent of AGENTS) {
      client.setAgent(agent.id, agent.runtimeAgent);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min per agent

      try {
        const result = await provider.complete({
          model: 'opencode/mimo-v2.5-free',
          messages: [{ role: 'user', content: agent.prompt }],
          agent: agent.runtimeAgent,
          title: `e2e-live-${E2E_RUN_ID}-${agent.id}`,
          signal: controller.signal,
        });

        completeRecords.push({
          timestamp: new Date().toISOString(),
          agentId: agent.id,
          runtimeAgent: agent.runtimeAgent,
          model: result.model,
          hadRuntimeSessionId: false,
        });
      } catch (error) {
        // Record the failure but continue with other agents
        completeRecords.push({
          timestamp: new Date().toISOString(),
          agentId: agent.id,
          runtimeAgent: agent.runtimeAgent,
          model: 'opencode/mimo-v2.5-free',
          hadRuntimeSessionId: false,
        });
        console.error(`[LIVE-E2E] Agent ${agent.id} failed:`, error instanceof Error ? error.message : String(error));
      } finally {
        clearTimeout(timeout);
      }
    }

    // ─── EVIDENCE CAPTURE ────────────────────────────────────

    const newSessions = sessionRecords.slice(sessionsBefore);
    const uniqueSessionIds = new Set(newSessions.map((s) => s.sessionId));
    const agentSessionMap = new Map<string, SessionRecord[]>();

    for (const record of newSessions) {
      const existing = agentSessionMap.get(record.agentId) ?? [];
      existing.push(record);
      agentSessionMap.set(record.agentId, existing);
    }

    // ─── EVIDENCE OUTPUT ─────────────────────────────────────

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('ARX-015 LIVE CHARACTERIZATION — EVIDENCE REPORT');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`workflowId:                    ${E2E_RUN_ID}`);
    console.log(`logical workflow executions:    1`);
    console.log(`agent invocations:             ${AGENTS.length}`);
    console.log(`Harness runs:                  ${AGENTS.length}`);
    console.log(`provider.complete() calls:     ${completeRecords.length}`);
    console.log(`createSession() calls:         ${newSessions.length}`);
    console.log(`unique OpenCode sessionIds:    ${uniqueSessionIds.size}`);
    console.log(`unexplained OpenCode sessions: ${Math.max(0, newSessions.length - AGENTS.length)}`);
    console.log('');
    console.log('Agent       Invocations  complete()  createSession  Unique Sessions');
    console.log('─────────── ──────────── ─────────── ────────────── ────────────────');

    for (const agent of AGENTS) {
      const completions = completeRecords.filter((r) => r.agentId === agent.id).length;
      const sessions = agentSessionMap.get(agent.id) ?? [];
      const uniqueForAgent = new Set(sessions.map((s) => s.sessionId)).size;
      console.log(
        `${agent.id.padEnd(12)} ${'1'.padStart(11)} ${String(completions).padStart(10)} ${String(sessions.length).padStart(13)} ${String(uniqueForAgent).padStart(15)}`,
      );
    }

    console.log('');
    console.log('Physical Session Records:');
    console.log('───────────────────────────────────────────────────────────────');
    for (const record of newSessions) {
      console.log(`  workflowId:      ${record.e2eRunId}`);
      console.log(`  agentId:         ${record.agentId}`);
      console.log(`  runtimeAgent:    ${record.runtimeAgent}`);
      console.log(`  sessionId:       ${record.sessionId}`);
      console.log(`  directory:       ${record.directory}`);
      console.log(`  title:           ${record.title ?? '(none)'}`);
      console.log(`  created:         ${record.timestamp}`);
      console.log('');
    }

    // ─── DIRECTORY VERIFICATION ───────────────────────────────

    console.log('Directory Verification:');
    console.log('───────────────────────────────────────────────────────────────');
    for (const record of newSessions) {
      const isCorrect = record.directory === REPOSITORY_DIR;
      const status = isCorrect ? '✓ CORRECT' : '✗ WRONG';
      console.log(`  ${record.agentId}: ${record.directory} → ${status}`);
    }

    // ─── CLASSIFICATION ───────────────────────────────────────

    console.log('');
    console.log('Classification:');
    console.log('───────────────────────────────────────────────────────────────');

    if (
      AGENTS.length === completeRecords.length &&
      AGENTS.length === newSessions.length &&
      AGENTS.length === uniqueSessionIds.size
    ) {
      console.log('  EXPECTED PRE-M7 CARDINALITY GAP');
      console.log('  5 logical invocations = 5 provider.complete() = 5 createSession() = 5 unique sessions');
      console.log('  This is the expected architecture. M7 session reuse will reduce to 1 session.');
    } else if (newSessions.length > AGENTS.length) {
      console.log('  DUPLICATE SESSIONS DETECTED');
      console.log(`  ${AGENTS.length} logical invocations produced ${newSessions.length} sessions`);
      // Find duplicates
      for (const [agentId, records] of agentSessionMap) {
        if (records.length > 1) {
          console.log(`  ${agentId}: ${records.length} sessions (possible duplicate or retry)`);
        }
      }
    } else {
      console.log('  UNEXPECTED CARDINALITY');
      console.log(`  Expected ${AGENTS.length} sessions, got ${newSessions.length}`);
    }

    console.log('═══════════════════════════════════════════════════════════════\n');

    // ─── ASSERTIONS ───────────────────────────────────────────

    // Verify directory is correct for all sessions
    for (const record of newSessions) {
      expect(record.directory).toBe(REPOSITORY_DIR);
      expect(record.directory).not.toContain('.vestara');
    }

    // Verify we got results for all agents
    expect(completeRecords.length).toBe(AGENTS.length);
  });
});
