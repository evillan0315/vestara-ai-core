import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWriteFileSync = vi.fn();

vi.mock('node:fs', () => ({
  writeFileSync: mockWriteFileSync,
}));

const {
  mockAudioDiagnose,
  mockAudioRegisterMicrophone,
  mockAudioRegisterSpeaker,
  mockAudioRegisterVAD,
  mockOpenCodeProvider,
  mockDefaultProviderManager,
  mockAgentStorage,
  mockProjectStorage,
  mockMilestoneService,
  mockConversationScanner,
  mockOpenSharedDb,
  mockExit,
  mockConsoleLog,
  mockConsoleError,
} = vi.hoisted(() => {
  const audioDiagnose = vi.fn();
  const audioRegisterMicrophone = vi.fn();
  const audioRegisterSpeaker = vi.fn();
  const audioRegisterVAD = vi.fn();

  const openCodeProvider = {
    id: 'opencode',
    name: 'OpenCode',
    version: '0.1.0',
    status: 'available' as const,
    models: [
      {
        id: 'model-1',
        provider: 'opencode',
        name: 'Model 1',
        contextWindow: 128000,
        maxOutput: 8192,
        capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
        pricing: { inputPerMillionTokens: 0, outputPerMillionTokens: 0 },
        status: 'available' as const,
      },
      {
        id: 'model-2',
        provider: 'opencode',
        name: 'Model 2',
        contextWindow: 128000,
        maxOutput: 8192,
        capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
        pricing: { inputPerMillionTokens: 0, outputPerMillionTokens: 0 },
        status: 'available' as const,
      },
    ],
    capabilities: { maxConcurrentRequests: 10, features: ['chat', 'streaming', 'function-calling'] },
    initialize: vi.fn(),
    healthCheck: vi.fn(),
    complete: vi.fn(),
    stream: vi.fn(),
    listModels: vi.fn(),
  };

  const defaultProviderManager = {
    register: vi.fn(),
    listProviders: vi.fn(),
  };

  const agentStorage = {
    listAgents: vi.fn(),
    listExecutions: vi.fn(),
    listSchedules: vi.fn(),
    listTeams: vi.fn(),
  };

  const projectStorage = {
    listProjects: vi.fn(),
    getProjectStats: vi.fn(),
    listSprints: vi.fn(),
  };

  const milestoneService = {
    getProgress: vi.fn(),
    getCurrent: vi.fn(),
  };

  const conversationScanner = {
    scan: vi.fn(),
  };

  const openSharedDb = vi.fn();

  const exit = vi.fn();
  const consoleLog = vi.fn();
  const consoleError = vi.fn();

  return {
    mockAudioDiagnose: audioDiagnose,
    mockAudioRegisterMicrophone: audioRegisterMicrophone,
    mockAudioRegisterSpeaker: audioRegisterSpeaker,
    mockAudioRegisterVAD: audioRegisterVAD,
    mockOpenCodeProvider: openCodeProvider,
    mockDefaultProviderManager: defaultProviderManager,
    mockAgentStorage: agentStorage,
    mockProjectStorage: projectStorage,
    mockMilestoneService: milestoneService,
    mockConversationScanner: conversationScanner,
    mockOpenSharedDb: openSharedDb,
    mockExit: exit,
    mockConsoleLog: consoleLog,
    mockConsoleError: consoleError,
  };
});

// Mock classes that won't be cleared by vi.clearAllMocks()
class MockVestaraAudioService {
  registerMicrophone = mockAudioRegisterMicrophone;
  registerSpeaker = mockAudioRegisterSpeaker;
  registerVAD = mockAudioRegisterVAD;
  diagnose = mockAudioDiagnose;
}

class MockDefaultMicrophoneProvider {}
class MockDefaultSpeakerProvider {}
class MockSileroVADProvider {}

function MockOpenCodeProvider() {
  return mockOpenCodeProvider;
}

class MockDefaultProviderManager {
  register = mockDefaultProviderManager.register;
  listProviders = mockDefaultProviderManager.listProviders;
}

class MockAgentStorage {
  listAgents = mockAgentStorage.listAgents;
  listExecutions = mockAgentStorage.listExecutions;
  listSchedules = mockAgentStorage.listSchedules;
  listTeams = mockAgentStorage.listTeams;
}

class MockProjectStorage {
  listProjects = mockProjectStorage.listProjects;
  getProjectStats = mockProjectStorage.getProjectStats;
  listSprints = mockProjectStorage.listSprints;
}

class MockMilestoneService {
  getProgress = mockMilestoneService.getProgress;
  getCurrent = mockMilestoneService.getCurrent;
}

class MockConversationScanner {
  scan = mockConversationScanner.scan;
}

vi.mock('@vestara/audio', () => ({
  VestaraAudioService: MockVestaraAudioService,
  DefaultMicrophoneProvider: MockDefaultMicrophoneProvider,
  DefaultSpeakerProvider: MockDefaultSpeakerProvider,
  SileroVADProvider: MockSileroVADProvider,
}));

vi.mock('@vestara/provider-opencode', () => ({
  OpenCodeProvider: MockOpenCodeProvider,
}));

vi.mock('@vestara/provider-runtime', () => ({
  DefaultProviderManager: MockDefaultProviderManager,
}));

vi.mock('@vestara/workspace', () => ({
  AgentStorage: MockAgentStorage,
  ProjectStorage: MockProjectStorage,
  MilestoneService: MockMilestoneService,
}));

vi.mock('@vestara/conversation-runtime', () => ({
  ConversationScanner: MockConversationScanner,
}));

vi.mock('../src/lib/db.js', () => ({
  openSharedDb: mockOpenSharedDb,
}));

// Import once after mocks are set up
const { runSystemStatus } = await import('../src/commands/status.js');

const origExit = process.exit;
const origConsoleLog = console.log;
const origConsoleError = console.error;

function setupDefaultMocks() {
  mockOpenSharedDb.mockResolvedValue({});

  mockAudioDiagnose.mockResolvedValue({
    microphone: { available: true, deviceName: 'Default Mic', latency: 5 },
    speakers: { available: true, deviceName: 'Default Speaker', latency: 5 },
    vad: { status: 'idle', provider: 'Silero VAD', latency: 2 },
    stt: { available: false, provider: 'none', latency: 0 },
    tts: { available: false, provider: 'none', latency: 0 },
  });

  mockOpenCodeProvider.initialize.mockResolvedValue(undefined);
  mockOpenCodeProvider.healthCheck.mockResolvedValue({
    status: 'healthy',
    providerId: 'opencode',
    modelCount: 2,
    latency: 42,
    lastHeartbeat: new Date().toISOString(),
  });

  mockDefaultProviderManager.register.mockResolvedValue(undefined);
  mockDefaultProviderManager.listProviders.mockReturnValue([
    {
      id: 'opencode',
      name: 'OpenCode',
      version: '0.1.0',
      status: 'available',
      modelCount: 2,
      capabilities: ['chat', 'streaming', 'function-calling'],
    },
  ]);

  mockAgentStorage.listAgents.mockResolvedValue([
    { id: 'agent-1', name: 'Agent 1', status: 'active' },
    { id: 'agent-2', name: 'Agent 2', status: 'disabled' },
  ]);
  mockAgentStorage.listExecutions.mockResolvedValue([
    { id: 'exec-1', status: 'completed' },
    { id: 'exec-2', status: 'failed' },
    { id: 'exec-3', status: 'running' },
    { id: 'exec-4', status: 'completed' },
  ]);
  mockAgentStorage.listSchedules.mockResolvedValue([{ id: 'sched-1' }]);
  mockAgentStorage.listTeams.mockResolvedValue([{ id: 'team-1' }]);

  mockProjectStorage.listProjects.mockResolvedValue([
    { id: 'proj-1', status: 'active' },
    { id: 'proj-2', status: 'planning' },
  ]);
  mockProjectStorage.getProjectStats.mockImplementation((projectId: string) =>
    Promise.resolve(projectId === 'proj-1' ? { total: 5, done: 3 } : { total: 2, done: 1 }),
  );
  mockProjectStorage.listSprints.mockResolvedValue([
    { id: 'sprint-1', status: 'active' },
    { id: 'sprint-2', status: 'completed' },
  ]);

  mockMilestoneService.getProgress.mockReturnValue({
    total: 50,
    completed: 42,
    inProgress: 3,
    pending: 5,
  });
  mockMilestoneService.getCurrent.mockReturnValue({
    version: 'v4.0',
    name: 'Conversational Onboarding',
    status: 'in_progress',
  });

  mockConversationScanner.scan.mockReturnValue({
    timestamp: new Date().toISOString(),
    rootPath: process.cwd(),
    packages: [],
    summary: {
      total: 12,
      present: 10,
      withTests: 8,
      withDist: 9,
      totalSourceLines: 15420,
      totalTestLines: 0,
    },
    issues: [
      { severity: 'error', package: 'audio', message: 'Package directory missing', detail: '/path/to/audio' },
      { severity: 'warning', package: 'stt', message: 'No compiled output (dist/)', detail: 'Run pnpm build' },
    ],
    recommendations: [],
    latency: { v4Targets: {} },
  });
}

beforeAll(() => {
  setupDefaultMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  process.exit = mockExit as any;
  console.log = mockConsoleLog;
  console.error = mockConsoleError;

  setupDefaultMocks();
});

afterEach(() => {
  process.exit = origExit;
  console.log = origConsoleLog;
  console.error = origConsoleError;
});

describe('runSystemStatus', () => {
  describe('default output mode', () => {
    it('prints system status with all sections', async () => {
      await runSystemStatus([]);

      expect(mockConsoleLog).toHaveBeenCalled();
      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');

      expect(calls).toContain('Vestara System Status');
      expect(calls).toContain('Runtime');
      expect(calls).toContain('Audio Pipeline');
      expect(calls).toContain('Providers');
      expect(calls).toContain('Agents');
      expect(calls).toContain('Projects');
      expect(calls).toContain('Milestones');
      expect(calls).toContain('Conversation Features');
      expect(calls).toContain('Tests & Build');
      expect(calls).toContain('Detailed diagnostics');
    });

    it('includes runtime info (Node version, platform, memory)', async () => {
      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Node:');
      expect(calls).toContain(process.version);
      expect(calls).toContain('Platform:');
      expect(calls).toContain(process.platform);
      expect(calls).toContain('Memory:');
      expect(calls).toContain('MB');
    });

    it('includes audio pipeline status', async () => {
      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Microphone:');
      expect(calls).toContain('Detected');
      expect(calls).toContain('VAD:');
      expect(calls).toContain('Ready');
    });

    it('includes providers list and health', async () => {
      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('OpenCode');
      expect(calls).toContain('available');
      expect(calls).toContain('2 models');
      expect(calls).toContain('Health:');
      expect(calls).toContain('healthy');
      expect(calls).toContain('42ms');
    });

    it('includes agents info with executions and success rate', async () => {
      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Registered:  2');
      expect(calls).toContain('Active:      1');
      expect(calls).toContain('Teams:       1');
      expect(calls).toContain('Schedules:   1');
      expect(calls).toContain('Executions:');
      expect(calls).toContain('2 ok');
      expect(calls).toContain('1 failed');
      expect(calls).toContain('1 running');
      expect(calls).toContain('Success:');
    });

    it('includes projects info with tasks and sprints', async () => {
      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Total:       2');
      expect(calls).toContain('Active:      1');
      expect(calls).toContain('Tasks:       7');
      expect(calls).toContain('4 done');
      expect(calls).toContain('Sprints:     2');
      expect(calls).toContain('1 active');
    });

    it('includes milestones progress and current', async () => {
      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Progress:    42/50');
      expect(calls).toContain('3 active');
      expect(calls).toContain('5 pending');
      expect(calls).toContain('Current:');
      expect(calls).toContain('v4.0');
      expect(calls).toContain('Conversational Onboarding');
    });

    it('includes conversation features scan results', async () => {
      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Packages:    10/12');
      expect(calls).toContain('Built:       9/12');
      expect(calls).toContain('Tested:      8/12');
      expect(calls).toContain('Source:      15420 lines');
      expect(calls).toContain('Issues:      2 (1 errors, 1 warnings)');
    });

    it('includes tests & build summary', async () => {
      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Tests:       177 passing (47 files)');
      expect(calls).toContain('Build:       All 28 packages + 4 apps compile');
      expect(calls).toContain('Lint:        Biome clean, 202 files');
    });

    it('exits with code 1 when providers unavailable', async () => {
      mockDefaultProviderManager.listProviders.mockReturnValue([]);

      await runSystemStatus([]);

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits with code 1 when agents unavailable', async () => {
      mockAgentStorage.listAgents.mockResolvedValue([]);

      await runSystemStatus([]);

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('--json output mode', () => {
    it('outputs valid JSON with all sections', async () => {
      await runSystemStatus(['--json']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      const jsonOutput = calls.trim();

      expect(() => JSON.parse(jsonOutput)).not.toThrow();
      const data = JSON.parse(jsonOutput);

      expect(data.runtime).toBeDefined();
      expect(data.runtime.node).toBe(process.version);
      expect(data.runtime.platform).toBe(process.platform);
      expect(data.runtime.memoryMB).toHaveProperty('used');
      expect(data.runtime.memoryMB).toHaveProperty('total');

      expect(data.audio).toBeDefined();
      expect(data.audio.microphone).toBe(true);
      expect(data.audio.vad).toBe(true);

      expect(data.providers).toBeDefined();
      expect(data.providers.list).toHaveLength(1);
      expect(data.providers.list[0].name).toBe('OpenCode');
      expect(data.providers.list[0].status).toBe('available');
      expect(data.providers.list[0].modelCount).toBe(2);
      expect(data.providers.health.status).toBe('healthy');
      expect(data.providers.health.latencyMs).toBe(42);

      expect(data.agents).toBeDefined();
      expect(data.agents.registered).toBe(2);
      expect(data.agents.active).toBe(1);
      expect(data.agents.teams).toBe(1);
      expect(data.agents.schedules).toBe(1);
      expect(data.agents.executions.total).toBe(4);
      expect(data.agents.executions.completed).toBe(2);
      expect(data.agents.executions.failed).toBe(1);
      expect(data.agents.executions.running).toBe(1);
      expect(data.agents.successRate).toBe('67%');

      expect(data.projects).toBeDefined();
      expect(data.projects.total).toBe(2);
      expect(data.projects.active).toBe(1);
      expect(data.projects.tasks.total).toBe(7);
      expect(data.projects.tasks.done).toBe(4);
      expect(data.projects.sprints.total).toBe(2);
      expect(data.projects.sprints.active).toBe(1);

      expect(data.milestones).toBeDefined();
      expect(data.milestones.completed).toBe(42);
      expect(data.milestones.total).toBe(50);
      expect(data.milestones.inProgress).toBe(3);
      expect(data.milestones.pending).toBe(5);
      expect(data.milestones.current).toEqual({
        version: 'v4.0',
        name: 'Conversational Onboarding',
        status: 'in_progress',
      });

      expect(data.conversationFeatures).toBeDefined();
      expect(data.conversationFeatures.packagesPresent).toBe(10);
      expect(data.conversationFeatures.packagesTotal).toBe(12);
      expect(data.conversationFeatures.built).toBe(9);
      expect(data.conversationFeatures.tested).toBe(8);
      expect(data.conversationFeatures.totalSourceLines).toBe(15420);
      expect(data.conversationFeatures.issues.total).toBe(2);
      expect(data.conversationFeatures.issues.errors).toBe(1);
      expect(data.conversationFeatures.issues.warnings).toBe(1);

      expect(data.testsAndBuild).toBeDefined();
      expect(data.testsAndBuild.tests).toBe('177 passing (47 files)');
      expect(data.testsAndBuild.build).toBe('All 28 packages + 4 apps compile');
      expect(data.testsAndBuild.lint).toBe('Biome clean, 202 files');

      expect(data.health).toBeDefined();
      expect(data.health.ok).toBe(true);
      expect(data.health.providersAvailable).toBe(true);
      expect(data.health.agentsAvailable).toBe(true);
      expect(data.health.audioAvailable).toBe(true);
    });

    it('does not print colored headers in JSON mode', async () => {
      await runSystemStatus(['--json']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).not.toContain('Vestara System Status');
      expect(calls).not.toContain('\x1b[');
    });

    it('includes health status even when some services fail', async () => {
      mockDefaultProviderManager.listProviders.mockReturnValue([]);
      mockAgentStorage.listAgents.mockResolvedValue([]);

      await runSystemStatus(['--json']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      const data = JSON.parse(calls.trim());

      expect(data.health.providersAvailable).toBe(false);
      expect(data.health.agentsAvailable).toBe(false);
      expect(data.health.ok).toBe(true);
    });
  });

  describe('--brief output mode', () => {
    it('prints single-line summary', async () => {
      await runSystemStatus(['--brief']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('vestara');
      expect(calls).toContain('providers ok');
      expect(calls).toContain('agents ok');
      expect(calls).toContain('audio');
      expect(calls).toContain(process.version);
    });

    it('shows red status when providers unavailable', async () => {
      mockDefaultProviderManager.listProviders.mockReturnValue([]);

      await runSystemStatus(['--brief']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('no providers');
    });

    it('shows red status when agents unavailable', async () => {
      mockAgentStorage.listAgents.mockResolvedValue([]);

      await runSystemStatus(['--brief']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('no agents');
    });

    it('shows gray status when audio unavailable', async () => {
      mockAudioDiagnose.mockResolvedValue({
        microphone: { available: false, deviceName: null, latency: 0 },
        speakers: { available: false, deviceName: null, latency: 0 },
        vad: { status: 'error', provider: 'Silero VAD', latency: 0 },
        stt: { available: false, provider: 'none', latency: 0 },
        tts: { available: false, provider: 'none', latency: 0 },
      });

      await runSystemStatus(['--brief']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('no audio');
    });

    it('does not print detailed sections in brief mode', async () => {
      await runSystemStatus(['--brief']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).not.toContain('Runtime');
      expect(calls).not.toContain('Audio Pipeline');
      expect(calls).not.toContain('Providers');
      expect(calls).not.toContain('Agents');
      expect(calls).not.toContain('Projects');
      expect(calls).not.toContain('Milestones');
      expect(calls).not.toContain('Conversation Features');
      expect(calls).not.toContain('Tests & Build');
      expect(calls).not.toContain('Detailed diagnostics');
    });
  });

  describe('error handling - service unavailable', () => {
    it('handles audio service failure gracefully in default mode', async () => {
      mockAudioDiagnose.mockRejectedValue(new Error('Audio module not available'));

      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Audio Pipeline');
      expect(calls).toContain('not available');
    });

    it('handles providers service failure gracefully in default mode', async () => {
      mockDefaultProviderManager.register.mockRejectedValue(new Error('Provider init failed'));

      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Providers');
      expect(calls).toContain('not available');
    });

    it('handles agents storage failure gracefully in default mode', async () => {
      mockAgentStorage.listAgents.mockRejectedValue(new Error('DB error'));

      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Agents');
      expect(calls).toContain('not available');
    });

    it('handles projects storage failure gracefully in default mode', async () => {
      mockProjectStorage.listProjects.mockRejectedValue(new Error('DB error'));

      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Projects');
      expect(calls).toContain('not available');
    });

    it('handles milestones service failure gracefully in default mode', async () => {
      mockMilestoneService.getProgress.mockImplementation(() => {
        throw new Error('Milestone error');
      });

      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Milestones');
      expect(calls).toContain('not available');
    });

    it('handles conversation scanner failure gracefully in default mode', async () => {
      mockConversationScanner.scan.mockImplementation(() => {
        throw new Error('Scanner error');
      });

      await runSystemStatus([]);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Conversation Features');
      expect(calls).toContain('not available');
    });

    it('handles audio service failure gracefully in JSON mode', async () => {
      mockAudioDiagnose.mockRejectedValue(new Error('Audio module not available'));

      await runSystemStatus(['--json']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      const data = JSON.parse(calls.trim());

      expect(data.audio).toBeUndefined();
    });

    it('handles providers service failure gracefully in JSON mode', async () => {
      mockDefaultProviderManager.register.mockRejectedValue(new Error('Provider init failed'));

      await runSystemStatus(['--json']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      const data = JSON.parse(calls.trim());

      expect(data.providers).toBeUndefined();
    });

    it('handles agents storage failure gracefully in JSON mode', async () => {
      mockAgentStorage.listAgents.mockRejectedValue(new Error('DB error'));

      await runSystemStatus(['--json']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      const data = JSON.parse(calls.trim());

      expect(data.agents).toBeUndefined();
    });

    it('handles projects storage failure gracefully in JSON mode', async () => {
      mockProjectStorage.listProjects.mockRejectedValue(new Error('DB error'));

      await runSystemStatus(['--json']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      const data = JSON.parse(calls.trim());

      expect(data.projects).toBeUndefined();
    });

    it('handles milestones service failure gracefully in JSON mode', async () => {
      mockMilestoneService.getProgress.mockImplementation(() => {
        throw new Error('Milestone error');
      });

      await runSystemStatus(['--json']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      const data = JSON.parse(calls.trim());

      expect(data.milestones).toBeUndefined();
    });

    it('handles conversation scanner failure gracefully in JSON mode', async () => {
      mockConversationScanner.scan.mockImplementation(() => {
        throw new Error('Scanner error');
      });

      await runSystemStatus(['--json']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      const data = JSON.parse(calls.trim());

      expect(data.conversationFeatures).toBeUndefined();
    });

    it('handles audio service failure gracefully in brief mode', async () => {
      mockAudioDiagnose.mockRejectedValue(new Error('Audio module not available'));

      await runSystemStatus(['--brief']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('no audio');
    });

    it('handles providers service failure gracefully in brief mode', async () => {
      mockDefaultProviderManager.register.mockRejectedValue(new Error('Provider init failed'));

      await runSystemStatus(['--brief']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('no providers');
    });

    it('handles agents storage failure gracefully in brief mode', async () => {
      mockAgentStorage.listAgents.mockRejectedValue(new Error('DB error'));

      await runSystemStatus(['--brief']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('no agents');
    });
  });

  describe('database connection', () => {
    it('opens shared database for agents and projects', async () => {
      await runSystemStatus([]);

      expect(mockOpenSharedDb).toHaveBeenCalledTimes(2);
    });

    it('uses database path from VESTARA_REPO env var', async () => {
      const origEnv = process.env.VESTARA_REPO;
      process.env.VESTARA_REPO = '/custom/path';

      mockOpenSharedDb.mockResolvedValue({});
      await runSystemStatus([]);

      // openSharedDb reads VESTARA_REPO internally, verify it was called
      expect(mockOpenSharedDb).toHaveBeenCalledTimes(2);
      process.env.VESTARA_REPO = origEnv;
    });
  });

  describe('--section flag', () => {
    describe('default output mode', () => {
      it('shows only runtime section when specified', async () => {
        await runSystemStatus(['--section=runtime']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('Runtime');
        expect(calls).not.toContain('Audio Pipeline');
        expect(calls).not.toContain('Providers');
        expect(calls).not.toContain('Agents');
      });

      it('shows multiple sections when comma-separated', async () => {
        await runSystemStatus(['--section=runtime,audio']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('Runtime');
        expect(calls).toContain('Audio Pipeline');
        expect(calls).not.toContain('Providers');
        expect(calls).not.toContain('Agents');
      });

      it('shows agents and projects when specified', async () => {
        await runSystemStatus(['--section=agents,projects']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('Agents');
        expect(calls).toContain('Projects');
        expect(calls).not.toContain('Runtime');
        expect(calls).not.toContain('Audio Pipeline');
      });

      it('works with -s shorthand', async () => {
        await runSystemStatus(['-s=runtime']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('Runtime');
        expect(calls).not.toContain('Audio Pipeline');
      });
    });

    describe('--json output mode', () => {
      it('includes only specified sections in JSON output', async () => {
        await runSystemStatus(['--json', '--section=runtime,audio']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        const data = JSON.parse(calls.trim());

        expect(data.runtime).toBeDefined();
        expect(data.audio).toBeDefined();
        expect(data.providers).toBeUndefined();
        expect(data.agents).toBeUndefined();
        expect(data.projects).toBeUndefined();
      });

      it('includes multiple sections in JSON when specified', async () => {
        await runSystemStatus(['--json', '--section=agents,projects,milestones']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        const data = JSON.parse(calls.trim());

        expect(data.agents).toBeDefined();
        expect(data.projects).toBeDefined();
        expect(data.milestones).toBeDefined();
        expect(data.runtime).toBeUndefined();
        expect(data.audio).toBeUndefined();
      });
    });

    describe('error handling', () => {
      it('throws error for invalid section name', async () => {
        await expect(runSystemStatus(['--section=invalid'])).rejects.toThrow('Invalid section(s): invalid');
      });

      it('shows valid sections in error message', async () => {
        await expect(runSystemStatus(['--section=invalid'])).rejects.toThrow(
          'Valid sections: runtime, audio, providers, agents, projects, milestones, conversationFeatures, testsAndBuild, apiGateway, workspaceRuntime, routing, database',
        );
      });

      it('throws error for multiple invalid sections', async () => {
        await expect(runSystemStatus(['--section=invalid1,invalid2'])).rejects.toThrow(
          'Invalid section(s): invalid1, invalid2',
        );
      });

      it('throws error for missing section value', async () => {
        await expect(runSystemStatus(['--section='])).rejects.toThrow('Missing value for --section flag');
      });
    });

    describe('backward compatibility', () => {
      it('shows all sections when no --section flag provided', async () => {
        await runSystemStatus([]);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('Runtime');
        expect(calls).toContain('Audio Pipeline');
        expect(calls).toContain('Providers');
        expect(calls).toContain('Agents');
        expect(calls).toContain('Projects');
        expect(calls).toContain('Milestones');
        expect(calls).toContain('Conversation Features');
        expect(calls).toContain('Tests & Build');
      });

      it('works with --json and no --section flag', async () => {
        await runSystemStatus(['--json']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        const data = JSON.parse(calls.trim());

        expect(data.runtime).toBeDefined();
        expect(data.audio).toBeDefined();
        expect(data.providers).toBeDefined();
        expect(data.agents).toBeDefined();
        expect(data.projects).toBeDefined();
        expect(data.milestones).toBeDefined();
        expect(data.conversationFeatures).toBeDefined();
        expect(data.testsAndBuild).toBeDefined();
      });
    });
  });

  describe('--format flag', () => {
    describe('table format', () => {
      it('outputs tabular format with sections', async () => {
        await runSystemStatus(['--format=table']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('Runtime');
        expect(calls).toContain('Audio Pipeline');
        expect(calls).toContain('Providers');
        expect(calls).toContain('Agents');
        expect(calls).toContain('Projects');
        expect(calls).toContain('Milestones');
        expect(calls).toContain('Conversation Features');
        expect(calls).toContain('Tests & Build');
      });

      it('includes runtime info in table format', async () => {
        await runSystemStatus(['--format=table']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('node');
        expect(calls).toContain(process.version);
        expect(calls).toContain('platform');
        expect(calls).toContain(process.platform);
        expect(calls).toContain('memoryMB');
      });

      it('includes providers info in table format', async () => {
        await runSystemStatus(['--format=table']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('OpenCode');
        expect(calls).toContain('available');
      });

      it('does not include health section in table format', async () => {
        await runSystemStatus(['--format=table']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).not.toContain('health');
      });

      it('works with -f shorthand', async () => {
        await runSystemStatus(['-f=table']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('Runtime');
      });
    });

    describe('csv format', () => {
      it('outputs CSV with headers', async () => {
        await runSystemStatus(['--format=csv']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        const lines = calls.trim().split('\n');
        expect(lines[0]).toBe('"Section","Key","Value"');
      });

      it('includes runtime data in CSV', async () => {
        await runSystemStatus(['--format=csv']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('"Runtime"');
        expect(calls).toContain('node');
        expect(calls).toContain(process.version);
      });

      it('includes providers data in CSV', async () => {
        await runSystemStatus(['--format=csv']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('"Providers"');
        expect(calls).toContain('OpenCode');
      });

      it('does not include health section in CSV', async () => {
        await runSystemStatus(['--format=csv']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).not.toContain('health');
      });

      it('escapes quotes in CSV values', async () => {
        await runSystemStatus(['--format=csv']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        const lines = calls.trim().split('\n');
        for (const line of lines) {
          const quotes = (line.match(/"/g) || []).length;
          expect(quotes % 2).toBe(0);
        }
      });
    });

    describe('yaml format', () => {
      it('outputs valid YAML', async () => {
        await runSystemStatus(['--format=yaml']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('Runtime:');
        expect(calls).toContain('Audio Pipeline:');
        expect(calls).toContain('Providers:');
      });

      it('includes runtime info in YAML', async () => {
        await runSystemStatus(['--format=yaml']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('node:');
        expect(calls).toContain(process.version);
        expect(calls).toContain('platform:');
        expect(calls).toContain(process.platform);
      });

      it('includes providers info in YAML', async () => {
        await runSystemStatus(['--format=yaml']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).toContain('OpenCode');
        expect(calls).toContain('available');
      });

      it('does not include health section in YAML', async () => {
        await runSystemStatus(['--format=yaml']);

        const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        expect(calls).not.toContain('health:');
      });
    });

    describe('error handling', () => {
      it('throws error for invalid format', async () => {
        await expect(runSystemStatus(['--format=invalid'])).rejects.toThrow('Invalid format: invalid');
      });

      it('shows valid formats in error message', async () => {
        await expect(runSystemStatus(['--format=invalid'])).rejects.toThrow(
          'Valid formats: default, json, brief, table, csv, yaml',
        );
      });

      it('throws error for missing format value', async () => {
        await expect(runSystemStatus(['--format='])).rejects.toThrow('Missing value for --format flag');
      });
    });
  });

  describe('--output flag', () => {
    beforeEach(() => {
      mockWriteFileSync.mockClear();
    });

    it('writes JSON output to file when --output specified', async () => {
      await runSystemStatus(['--format=json', '--output=status.json']);

      expect(mockWriteFileSync).toHaveBeenCalled();
      const [filePath, content] = mockWriteFileSync.mock.calls[0];
      expect(filePath).toBe('status.json');
      const data = JSON.parse(content);
      expect(data.runtime).toBeDefined();
    });

    it('writes table output to file when --output specified', async () => {
      await runSystemStatus(['--format=table', '--output=status.txt']);

      expect(mockWriteFileSync).toHaveBeenCalled();
      const [filePath, content] = mockWriteFileSync.mock.calls[0];
      expect(filePath).toBe('status.txt');
      expect(content).toContain('Runtime');
    });

    it('writes CSV output to file when --output specified', async () => {
      await runSystemStatus(['--format=csv', '--output=status.csv']);

      expect(mockWriteFileSync).toHaveBeenCalled();
      const [filePath, content] = mockWriteFileSync.mock.calls[0];
      expect(filePath).toBe('status.csv');
      expect(content).toContain('"Section","Key","Value"');
    });

    it('writes YAML output to file when --output specified', async () => {
      await runSystemStatus(['--format=yaml', '--output=status.yaml']);

      expect(mockWriteFileSync).toHaveBeenCalled();
      const [filePath, content] = mockWriteFileSync.mock.calls[0];
      expect(filePath).toBe('status.yaml');
      expect(content).toContain('Runtime:');
    });

    it('writes brief output to file when --output specified', async () => {
      await runSystemStatus(['--format=brief', '--output=status.txt']);

      expect(mockWriteFileSync).toHaveBeenCalled();
      const [filePath, content] = mockWriteFileSync.mock.calls[0];
      expect(filePath).toBe('status.txt');
      expect(content).toContain('vestara');
      expect(content).toContain('providers ok');
    });

    it('works with -o shorthand', async () => {
      await runSystemStatus(['--format=json', '-o=status.json']);

      expect(mockWriteFileSync).toHaveBeenCalled();
      const [filePath] = mockWriteFileSync.mock.calls[0];
      expect(filePath).toBe('status.json');
    });

    it('throws error for missing output value', async () => {
      await expect(runSystemStatus(['--output='])).rejects.toThrow('Missing value for --output flag');
    });
  });

  describe('--format with --section', () => {
    it('table format respects section filter', async () => {
      await runSystemStatus(['--format=table', '--section=runtime,audio']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Runtime');
      expect(calls).toContain('Audio Pipeline');
      expect(calls).not.toContain('Providers');
    });

    it('csv format respects section filter', async () => {
      await runSystemStatus(['--format=csv', '--section=runtime,audio']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('"Runtime"');
      expect(calls).toContain('"Audio Pipeline"');
      expect(calls).not.toContain('"Providers"');
    });

    it('yaml format respects section filter', async () => {
      await runSystemStatus(['--format=yaml', '--section=runtime,audio']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('Runtime:');
      expect(calls).toContain('Audio Pipeline:');
      expect(calls).not.toContain('Providers:');
    });
  });

  describe('brief mode unchanged', () => {
    it('brief mode still prints single line regardless of other flags', async () => {
      await runSystemStatus(['--format=brief', '--section=runtime']);

      const calls = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls).toContain('vestara');
      expect(calls).toContain('providers ok');
      expect(calls).not.toContain('Runtime');
      expect(calls).not.toContain('Audio Pipeline');
    });
  });
});
