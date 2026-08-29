import { describe, expect, it } from 'vitest';

describe('Runtime validation — AgentRuntime', () => {
  it('extends Runtime with correct base state', () => {
    const { Runtime } = require('../dist/index.js');
    const { AgentRuntime } = require('../dist/runtimes/agent-runtime.js');
    const agent = new AgentRuntime({ id: 'agent-1' as any, type: 'agent' });
    expect(agent).toBeInstanceOf(Runtime);
    expect(agent.state).toBe('created');
    expect(agent.jobCount).toBe(0);
    expect(agent.toolCount).toBe(0);
  });

  it('follows standard lifecycle', async () => {
    const { AgentRuntime } = require('../dist/runtimes/agent-runtime.js');
    const agent = new AgentRuntime({ id: 'agent-2' as any, type: 'agent' });
    await agent.initialize();
    expect(agent.state).toBe('running');
    expect(agent.startedAt).toBeTruthy();
    await agent.stop();
    expect(agent.state).toBe('stopped');
    await agent.destroy();
    expect(agent.isDisposed).toBe(true);
  });

  it('manages jobs without fighting Runtime state machine', () => {
    const { AgentRuntime } = require('../dist/runtimes/agent-runtime.js');
    const agent = new AgentRuntime({ id: 'agent-3' as any, type: 'agent' });
    agent.submitJob('job-1', 'analyze');
    agent.submitJob('job-2', 'implement');
    expect(agent.jobCount).toBe(2);
    agent.updateJobStatus('job-1', 'completed');
    agent.updateJobStatus('job-2', 'running');
    expect(agent.getActiveJobs()).toHaveLength(1);
    expect(agent.getJob('job-2')?.status).toBe('running');
  });

  it('accepts tool bindings', async () => {
    const { AgentRuntime } = require('../dist/runtimes/agent-runtime.js');
    const agent = new AgentRuntime({ id: 'agent-4' as any, type: 'agent' }, [
      { name: 'read-file', invoke: async () => 'content' },
    ]);
    await agent.initialize();
    expect(agent.toolCount).toBe(1);
    expect(agent.hasTool('read-file')).toBe(true);
    expect(agent.hasTool('write-file')).toBe(false);
  });

  it('health checks and dependency tracking coexist', async () => {
    const { AgentRuntime } = require('../dist/runtimes/agent-runtime.js');
    const agent = new AgentRuntime({ id: 'agent-5' as any, type: 'agent' });
    await agent.initialize();
    agent.addDependency({
      id: 'memory-1' as any,
      status: 'healthy',
      latency: 2,
      lastChecked: new Date().toISOString(),
    });
    expect(agent.health.dependencies).toHaveLength(1);
    expect(agent.health.status).toBe('healthy');
  });
});

describe('Runtime validation — RepositoryRuntime', () => {
  it('extends Runtime with lock management', () => {
    const { Runtime } = require('../dist/index.js');
    const { RepositoryRuntime } = require('../dist/runtimes/repository-runtime.js');
    const repo = new RepositoryRuntime({ id: 'repo-1' as any, type: 'repository' });
    expect(repo).toBeInstanceOf(Runtime);
    expect(repo.isLocked).toBe(false);
  });

  it('lock and unlock work alongside Runtime lifecycle', async () => {
    const { RepositoryRuntime } = require('../dist/runtimes/repository-runtime.js');
    const repo = new RepositoryRuntime({ id: 'repo-2' as any, type: 'repository' });
    await repo.initialize();
    const acquired = await repo.lock('worker-1');
    expect(acquired).toBe(true);
    expect(repo.isLocked).toBe(true);
    expect(repo.lockHolder).toBe('worker-1');
    await repo.unlock();
    expect(repo.isLocked).toBe(false);
  });

  it('tracks pending changes with checkpoints', async () => {
    const { RepositoryRuntime } = require('../dist/runtimes/repository-runtime.js');
    const repo = new RepositoryRuntime({ id: 'repo-3' as any, type: 'repository' });
    repo.recordChange('/src/index.ts', 'modify');
    repo.recordChange('/src/utils.ts', 'create');
    expect(repo.pendingChanges).toHaveLength(2);
    expect(repo.getCheckpoint('last-change')).toEqual({ path: '/src/utils.ts', type: 'create' });
    const flushed = repo.flushChanges();
    expect(flushed).toHaveLength(2);
    expect(repo.pendingChanges).toHaveLength(0);
  });

  it('manages dependencies from constructor', async () => {
    const { RepositoryRuntime } = require('../dist/runtimes/repository-runtime.js');
    const repo = new RepositoryRuntime({ id: 'repo-4' as any, type: 'repository' }, 'git-1' as any, 'memory-1' as any);
    await repo.initialize();
    expect(repo.health.dependencies).toHaveLength(2);
    repo.updateDependencyHealth('git-1' as any, 'degraded', 500);
    expect(repo.health.dependencies.find((d: any) => d.id === 'git-1')?.status).toBe('degraded');
  });

  it('stops gracefully with lock release', async () => {
    const { RepositoryRuntime } = require('../dist/runtimes/repository-runtime.js');
    const repo = new RepositoryRuntime({ id: 'repo-5' as any, type: 'repository' });
    await repo.initialize();
    await repo.lock('worker-1');
    expect(repo.isLocked).toBe(true);
    await repo.stop();
    expect(repo.state).toBe('stopped');
    expect(repo.isLocked).toBe(false);
  });
});

describe('Runtime validation — WorkflowRuntime', () => {
  const workflowDef = {
    id: 'wf-1',
    name: 'Test Pipeline',
    steps: [
      { id: 's1', name: 'Lint', runner: 'tool-1' as any, dependsOn: [], status: 'pending' as const },
      { id: 's2', name: 'Build', runner: 'tool-2' as any, dependsOn: ['s1'], status: 'pending' as const },
      { id: 's3', name: 'Test', runner: 'tool-3' as any, dependsOn: ['s2'], status: 'pending' as const },
    ],
  };

  it('extends Runtime with workflow-specific state', () => {
    const { Runtime } = require('../dist/index.js');
    const { WorkflowRuntime } = require('../dist/runtimes/workflow-runtime.js');
    const wf = new WorkflowRuntime({ id: 'wf-1' as any, type: 'workflow' }, workflowDef);
    expect(wf).toBeInstanceOf(Runtime);
    expect(wf.totalSteps).toBe(3);
    expect(wf.completedSteps).toBe(0);
    expect(wf.progress).toBe(0);
  });

  it('tracks step execution with checkpoints', async () => {
    const { WorkflowRuntime } = require('../dist/runtimes/workflow-runtime.js');
    const wf = new WorkflowRuntime({ id: 'wf-2' as any, type: 'workflow' }, workflowDef);
    await wf.initialize();
    await wf.executeStep('s1');
    expect(wf.currentStep).toBe('s1');
    wf.completeStep('s1', { output: 'ok' });
    expect(wf.completedSteps).toBe(1);
    expect(wf.progress).toBeCloseTo(1 / 3);
    const checkpoint = wf.getCheckpoint('workflow-progress');
    expect(checkpoint).toBeTruthy();
  });

  it('suspend/resume preserves progress via checkpoints', async () => {
    const { WorkflowRuntime } = require('../dist/runtimes/workflow-runtime.js');
    const wf = new WorkflowRuntime({ id: 'wf-3' as any, type: 'workflow' }, workflowDef);
    await wf.initialize();
    await wf.executeStep('s1');
    wf.completeStep('s1', { output: 'ok' });
    await wf.executeStep('s2');
    wf.completeStep('s2', { output: 'built' });
    expect(wf.completedSteps).toBe(2);
    await wf.suspend();
    expect(wf.state).toBe('suspended');
    await wf.resume();
    expect(wf.state).toBe('running');
  });

  it('handles step failures gracefully', async () => {
    const { WorkflowRuntime } = require('../dist/runtimes/workflow-runtime.js');
    const wf = new WorkflowRuntime({ id: 'wf-4' as any, type: 'workflow' }, workflowDef);
    await wf.initialize();
    wf.failStep('s1', 'lint error');
    expect(wf.definition.steps[0].status).toBe('failed');
    const checkpoint = wf.getCheckpoint('step:s1');
    expect(checkpoint).toEqual({ status: 'failed', error: 'lint error' });
  });
});

describe('Runtime validation — PluginRuntime', () => {
  const manifest = {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'Test plugin',
    author: 'test',
    permissions: ['runtime:read' as any, 'resource:read' as any],
    entrypoint: './index.js',
  };

  it('extends Runtime with manifest and version', () => {
    const { Runtime } = require('../dist/index.js');
    const { PluginRuntime } = require('../dist/runtimes/plugin-runtime.js');
    const plugin = new PluginRuntime({ id: 'plugin-1' as any, type: 'plugin' }, manifest);
    expect(plugin).toBeInstanceOf(Runtime);
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.manifest.name).toBe('My Plugin');
  });

  it('checks permissions against manifest', () => {
    const { PluginRuntime } = require('../dist/runtimes/plugin-runtime.js');
    const plugin = new PluginRuntime({ id: 'plugin-2' as any, type: 'plugin' }, manifest);
    expect(plugin.hasRequiredCapability('runtime:read')).toBe(true);
    expect(plugin.hasRequiredCapability('runtime:delete')).toBe(false);
  });

  it('supports dynamic reload', async () => {
    const { PluginRuntime } = require('../dist/runtimes/plugin-runtime.js');
    const plugin = new PluginRuntime({ id: 'plugin-3' as any, type: 'plugin' }, manifest);
    await plugin.initialize();
    plugin.reload('2.0.0');
    expect(plugin.version).toBe('2.0.0');
    const reloadCp = plugin.getCheckpoint('plugin-reload');
    expect(reloadCp).toBeTruthy();
  });

  it('sandbox flag controls isolation', () => {
    const { PluginRuntime } = require('../dist/runtimes/plugin-runtime.js');
    const plugin = new PluginRuntime({ id: 'plugin-4' as any, type: 'plugin' }, manifest);
    expect(plugin.sandboxed).toBe(true);
    plugin.disableSandbox();
    expect(plugin.sandboxed).toBe(false);
  });

  it('validates API compatibility', () => {
    const { PluginRuntime } = require('../dist/runtimes/plugin-runtime.js');
    const plugin = new PluginRuntime(
      { id: 'plugin-5' as any, type: 'plugin' },
      {
        ...manifest,
        version: '2.1.0',
      },
    );
    expect(plugin.validateApiCompatibility('2.0.0')).toBe(true);
    expect(plugin.validateApiCompatibility('3.0.0')).toBe(false);
  });

  it('permission check rejects initialization when insufficient', async () => {
    const { PluginRuntime } = require('../dist/runtimes/plugin-runtime.js');
    const restricted = { ...manifest, permissions: [] };
    const plugin = new PluginRuntime(
      { id: 'plugin-6' as any, type: 'plugin', permissionManager: { check: () => false } as any },
      restricted,
      {
        onInitialize: async () => {
          throw new Error('Plugin lacks system:configure permission');
        },
      },
    );
    await plugin.initialize();
    expect(plugin.state).toBe('failed');
    expect(plugin.error).toContain('lacks system:configure permission');
  });
});

describe('Runtime validation — TuiRuntime', () => {
  const SPAWN_OPTS = {
    packageId: 'vestara.tui',
    packageVersion: '0.1.0',
    executablePath: '/usr/bin/true',
    shutdownTimeoutMs: 500,
  };

  it('extends Runtime with an initial snapshot', () => {
    const { Runtime } = require('../dist/index.js');
    const { TuiRuntime } = require('../dist/runtimes/tui-runtime.js');
    const tui = new TuiRuntime({ id: 'tui-1' as any, type: 'tui' });
    expect(tui).toBeInstanceOf(Runtime);
    expect(tui.processSnapshot.state).toBe('created');
    expect(tui.spawnCount).toBe(0);
    expect(tui.hasActiveProcess).toBe(false);
  });

  it('launches only while the runtime is running', async () => {
    const { TuiRuntime } = require('../dist/runtimes/tui-runtime.js');
    const tui = new TuiRuntime({ id: 'tui-2' as any, type: 'tui' });
    await expect(tui.launch(SPAWN_OPTS)).rejects.toThrow('must be running');
  });

  it('launches a real process and reports lifecycle events', async () => {
    const { TuiRuntime } = require('../dist/runtimes/tui-runtime.js');
    const events: string[] = [];
    const tui = new TuiRuntime(
      { id: 'tui-3' as any, type: 'tui' },
      {
        onEvent: (type: string) => events.push(type),
        onSpawned: () => {},
      },
    );
    await tui.initialize();
    const snapshot = await tui.launch({ ...SPAWN_OPTS, executablePath: '/bin/sh', args: ['-c', 'sleep 0.2'] });
    expect(snapshot.pid).toBeDefined();
    expect(snapshot.state).toBe('running');
    expect(tui.hasActiveProcess).toBe(true);
    expect(tui.spawnCount).toBe(1);
    expect(events).toEqual(
      expect.arrayContaining(['tui.runtime.resolving', 'tui.runtime.starting', 'tui.runtime.started']),
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(tui.hasActiveProcess).toBe(false);
    expect(tui.processSnapshot.exitCode).toBe(0);
  });

  it('stops a running process gracefully on runtime stop', async () => {
    const { TuiRuntime } = require('../dist/runtimes/tui-runtime.js');
    const tui = new TuiRuntime({ id: 'tui-4' as any, type: 'tui' });
    await tui.initialize();
    await tui.launch({ ...SPAWN_OPTS, executablePath: '/bin/sh', args: ['-c', 'sleep 10'] });
    expect(tui.hasActiveProcess).toBe(true);
    await tui.stop();
    expect(tui.state).toBe('stopped');
    expect(tui.hasActiveProcess).toBe(false);
    expect(tui.processSnapshot.stoppedAt).toBeDefined();
  });

  it('supports forced termination', async () => {
    const { TuiRuntime } = require('../dist/runtimes/tui-runtime.js');
    const tui = new TuiRuntime({ id: 'tui-5' as any, type: 'tui' });
    await tui.initialize();
    await tui.launch({ ...SPAWN_OPTS, executablePath: '/bin/sh', args: ['-c', 'sleep 10'] });
    expect(tui.hasActiveProcess).toBe(true);
    tui.forceTerminate();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(tui.hasActiveProcess).toBe(false);
    expect(tui.processSnapshot.exitCode).not.toBe(0);
  });

  it('marks the runtime unavailable with a failure', async () => {
    const { TuiRuntime } = require('../dist/runtimes/tui-runtime.js');
    const tui = new TuiRuntime({ id: 'tui-6' as any, type: 'tui' });
    tui.markUnavailable('no executable for linux-arm');
    expect(tui.processSnapshot.failure?.code).toBe('unavailable');
    expect(tui.processSnapshot.failure?.message).toContain('linux-arm');
  });
});
