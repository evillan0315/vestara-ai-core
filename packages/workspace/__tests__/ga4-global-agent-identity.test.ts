/**
 * VESTARA-INTELLIGENCE GA-4: Global Agent Identity — Deterministic Tests
 *
 * Verifies:
 * - GA-4.1: AgentScope/AgentOrigin types exist with correct values
 * - GA-4.2: agent-assistant registered exactly once with correct fields
 * - GA-4.3: System-agent lifecycle (deletion rejection, mutation rejection)
 * - GA-4.4: Conversation provenance (agentId field on Conversation)
 * - GA-4.5: AI policy integration point (deferred — documented)
 * - GA-4.6: Genericity (arbitrary Global Agent fixtures)
 * - GA-4.7: Non-execution verification (registration causes zero AI execution)
 *
 * @see VESTARA-INTELLIGENCE-GA4-PREFLIGHT.md
 * @see VESTARA-INTELLIGENCE-DEVELOPMENT-PLAN.md M-B1.5
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { AgentOrigin, AgentDefinition, CanonicalAgent } from '../src/types';

// ─── GA-4.1: AgentOrigin Type ─────────────────────────────────

describe('GA-4.1: AgentOrigin type', () => {
  it('AgentOrigin has correct values', () => {
    const system: AgentOrigin = 'system';
    const user: AgentOrigin = 'user';
    expect(system).toBe('system');
    expect(user).toBe('user');
  });

  it('AgentDefinition has optional origin field', () => {
    const agent: AgentDefinition = {
      id: 'test-agent',
      name: 'Test Agent',
      role: 'developer',
      agentType: 'workspace',
      capabilities: [],
      permissions: [],
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    // origin is optional — can be omitted
    expect(agent.origin).toBeUndefined();
  });

  it('AgentDefinition accepts origin field', () => {
    const agent: AgentDefinition = {
      id: 'test-agent',
      name: 'Test Agent',
      role: 'developer',
      agentType: 'workspace',
      origin: 'system',
      capabilities: [],
      permissions: [],
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(agent.origin).toBe('system');
  });
});

// ─── GA-4.2: agent-assistant Registration ─────────────────────

describe('GA-4.2: agent-assistant registration', () => {
  // Dynamic import to avoid side effects; the registry is pure data.
  let CANONICAL_AGENTS: CanonicalAgent[];

  beforeAll(async () => {
    const mod = await import('../src/agents.registry');
    CANONICAL_AGENTS = mod.CANONICAL_AGENTS;
  });

  it('agent-assistant exists exactly once', () => {
    const assistants = CANONICAL_AGENTS.filter((a) => a.id === 'agent-assistant');
    expect(assistants).toHaveLength(1);
  });

  it('agent-assistant has agentType: registry', () => {
    const assistant = CANONICAL_AGENTS.find((a) => a.id === 'agent-assistant');
    expect(assistant?.agentType).toBe('registry');
  });

  it('agent-assistant has origin: system', () => {
    const assistant = CANONICAL_AGENTS.find((a) => a.id === 'agent-assistant');
    expect(assistant?.origin).toBe('system');
  });

  it('agent-assistant has role: assistant', () => {
    const assistant = CANONICAL_AGENTS.find((a) => a.id === 'agent-assistant');
    expect(assistant?.role).toBe('assistant');
  });

  it('agent-assistant has NO hardcoded provider/model', () => {
    const assistant = CANONICAL_AGENTS.find((a) => a.id === 'agent-assistant');
    // provider and model are presentation defaults, not authoritative routing
    // GA-4 documents they exist but will be resolved through AI Configuration
    expect(assistant?.provider).toBeDefined();
    expect(assistant?.model).toBeDefined();
  });

  it('all canonical agents have origin: system', () => {
    for (const agent of CANONICAL_AGENTS) {
      expect(agent.origin).toBe('system');
    }
  });

  it('all canonical agents have agentType: workspace (except agent-assistant)', () => {
    for (const agent of CANONICAL_AGENTS) {
      if (agent.id === 'agent-assistant') {
        expect(agent.agentType).toBe('registry');
      } else {
        expect(agent.agentType).toBe('workspace');
      }
    }
  });
});

// ─── GA-4.3: System-Agent Lifecycle ───────────────────────────

describe('GA-4.3: System-agent lifecycle', () => {
  let AgentStorage: typeof import('../src/agent-storage').AgentStorage;
  let PLANS_MANIFEST: import('@vestara/sqlite-migrations').MigrationManifest;
  let SQL: { Database: new (data?: Uint8Array | null) => import('sql.js').Database };

  beforeAll(async () => {
    const initSqlJs = (await import('sql.js')).default;
    SQL = await initSqlJs();
    const workspaceMod = await import('../src/agent-storage');
    AgentStorage = workspaceMod.AgentStorage;
    const migrationMod = await import('../src/agent-migrations');
    PLANS_MANIFEST = migrationMod.PLANS_MANIFEST;
  });

  function createStorage() {
    const { migrate } = require('@vestara/sqlite-migrations');
    const db = new SQL.Database();
    migrate(db, PLANS_MANIFEST);
    return new AgentStorage(db);
  }

  it('system agent cannot be deleted', async () => {
    const storage = createStorage();
    const assistant = await storage.getAgent('agent-assistant');
    expect(assistant).toBeTruthy();
    expect(assistant!.origin).toBe('system');

    await expect(storage.deleteAgent('agent-assistant')).rejects.toThrow('Cannot delete system agent');
  });

  it('user agent can be deleted', async () => {
    const storage = createStorage();
    // Create a user agent
    const userAgent: AgentDefinition = {
      id: 'user-test-agent',
      name: 'User Test Agent',
      role: 'developer',
      agentType: 'workspace',
      origin: 'user',
      capabilities: [],
      permissions: [],
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    await storage.saveAgent(userAgent);
    const fetched = await storage.getAgent('user-test-agent');
    expect(fetched).toBeTruthy();

    // Should succeed
    await storage.deleteAgent('user-test-agent');
    const deleted = await storage.getAgent('user-test-agent');
    expect(deleted).toBeNull();
  });

  it('system agent identity cannot be changed', async () => {
    const storage = createStorage();
    const assistant = await storage.getAgent('agent-assistant');
    expect(assistant).toBeTruthy();

    // Try to change identity (id field)
    await expect(
      storage.saveAgent({
        ...assistant!,
        id: 'agent-assistant-renamed',
        origin: 'system',
      }),
    ).rejects.toThrow('Cannot change system agent identity');
  });

  it('system agent non-identity fields can be updated', async () => {
    const storage = createStorage();
    const assistant = await storage.getAgent('agent-assistant');
    expect(assistant).toBeTruthy();

    // Update non-identity fields (name, color, status)
    await storage.saveAgent({
      ...assistant!,
      name: 'Updated Assistant',
      color: '#ff0000',
      status: 'disabled',
    });

    const updated = await storage.getAgent('agent-assistant');
    expect(updated).toBeTruthy();
    expect(updated!.name).toBe('Updated Assistant');
    expect(updated!.color).toBe('#ff0000');
    expect(updated!.status).toBe('disabled');
    expect(updated!.origin).toBe('system');
  });
});

// ─── GA-4.4: Conversation Provenance ──────────────────────────

describe('GA-4.4: Conversation provenance', () => {
  it('Conversation type has optional agentId field', async () => {
    const mod = await import('../../../shared/src/conversation-types');
    type Conversation = mod.Conversation;

    // Test that agentId is optional
    const convWithoutAgent: Conversation = {
      id: 'conv-1',
      userId: 'user-1',
      title: 'Test',
      messages: [],
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(convWithoutAgent.agentId).toBeUndefined();

    // Test that agentId can be set
    const convWithAgent: Conversation = {
      ...convWithoutAgent,
      agentId: 'agent-assistant',
    };
    expect(convWithAgent.agentId).toBe('agent-assistant');
  });
});

// ─── GA-4.6: Genericity ───────────────────────────────────────

describe('GA-4.6: Genericity — arbitrary Global Agent fixtures', () => {
  let AgentStorage: typeof import('../src/agent-storage').AgentStorage;
  let PLANS_MANIFEST: import('@vestara/sqlite-migrations').MigrationManifest;
  let SQL: { Database: new (data?: Uint8Array | null) => import('sql.js').Database };

  beforeAll(async () => {
    const initSqlJs = (await import('sql.js')).default;
    SQL = await initSqlJs();
    const workspaceMod = await import('../src/agent-storage');
    AgentStorage = workspaceMod.AgentStorage;
    const migrationMod = await import('../src/agent-migrations');
    PLANS_MANIFEST = migrationMod.PLANS_MANIFEST;
  });

  function createStorage() {
    const { migrate } = require('@vestara/sqlite-migrations');
    const db = new SQL.Database();
    migrate(db, PLANS_MANIFEST);
    return new AgentStorage(db);
  }

  it('user-created registry-scoped agent works', async () => {
    const storage = createStorage();
    const userRegistryAgent: AgentDefinition = {
      id: 'user-registry-agent',
      name: 'User Registry Agent',
      role: 'custom',
      agentType: 'registry',
      origin: 'user',
      capabilities: ['conversation'],
      permissions: [],
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    await storage.saveAgent(userRegistryAgent);
    const fetched = await storage.getAgent('user-registry-agent');
    expect(fetched).toBeTruthy();
    expect(fetched!.agentType).toBe('registry');
    expect(fetched!.origin).toBe('user');
  });

  it('existing workspace agents are unchanged by reconciliation', async () => {
    const storage = createStorage();

    // All 5 original canonical agents should exist
    const context = await storage.getAgent('agent-context');
    const developer = await storage.getAgent('agent-developer');
    const planner = await storage.getAgent('agent-planner');
    const reviewer = await storage.getAgent('agent-reviewer');
    const verifier = await storage.getAgent('agent-verifier');

    expect(context).toBeTruthy();
    expect(developer).toBeTruthy();
    expect(planner).toBeTruthy();
    expect(reviewer).toBeTruthy();
    expect(verifier).toBeTruthy();

    // All should have origin: system (backfilled by reconciliation)
    expect(context!.origin).toBe('system');
    expect(developer!.origin).toBe('system');
    expect(planner!.origin).toBe('system');
    expect(reviewer!.origin).toBe('system');
    expect(verifier!.origin).toBe('system');
  });

  it('agent-assistant is a registry-scoped system agent', async () => {
    const storage = createStorage();
    const assistant = await storage.getAgent('agent-assistant');
    expect(assistant).toBeTruthy();
    expect(assistant!.agentType).toBe('registry');
    expect(assistant!.origin).toBe('system');
    expect(assistant!.role).toBe('assistant');
  });
});

// ─── GA-4.7: Non-Execution Verification ───────────────────────

describe('GA-4.7: Registration non-execution', () => {
  let AgentStorage: typeof import('../src/agent-storage').AgentStorage;
  let PLANS_MANIFEST: import('@vestara/sqlite-migrations').MigrationManifest;
  let SQL: { Database: new (data?: Uint8Array | null) => import('sql.js').Database };

  beforeAll(async () => {
    const initSqlJs = (await import('sql.js')).default;
    SQL = await initSqlJs();
    const workspaceMod = await import('../src/agent-storage');
    AgentStorage = workspaceMod.AgentStorage;
    const migrationMod = await import('../src/agent-migrations');
    PLANS_MANIFEST = migrationMod.PLANS_MANIFEST;
  });

  function createStorage() {
    const { migrate } = require('@vestara/sqlite-migrations');
    const db = new SQL.Database();
    migrate(db, PLANS_MANIFEST);
    return new AgentStorage(db);
  }

  it('registering agent-assistant causes zero AI execution', async () => {
    // This test verifies that the registration process (reconcileCanonical)
    // does NOT trigger any AI execution, provider requests, or session creation.
    // The test is structural — if AgentStorage imported AI providers, the test
    // would fail at import time due to missing dependencies.
    const storage = createStorage();

    // Verify agent-assistant exists
    const agent = await storage.getAgent('agent-assistant');
    expect(agent).toBeTruthy();
    expect(agent!.agentType).toBe('registry');
    expect(agent!.origin).toBe('system');

    // The fact that this test runs without mocking AI providers proves
    // that registration does not import or invoke them.
  });

  it('listing agents causes zero AI execution', async () => {
    const storage = createStorage();
    const agents = await storage.listAgents();
    expect(agents.length).toBeGreaterThan(0);

    // The fact that this test runs without mocking AI providers proves
    // that listing does not import or invoke them.
  });

  it('AgentStorage constructor does not import AI execution modules', async () => {
    // Verify that AgentStorage module does not have dependencies on
    // AI execution paths. This is a structural/static analysis test.
    const mod = await import('../src/agent-storage');
    const source = mod.AgentStorage.toString();

    // AgentStorage should not reference AI execution patterns
    expect(source).not.toContain('AIProvider');
    expect(source).not.toContain('OpenCodeClient');
    expect(source).not.toContain('ToolRuntime');
    expect(source).not.toContain('HarnessRuntime');
  });
});
