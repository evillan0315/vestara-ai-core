import type { EventBus } from '@vestara/event-bus';
import type { AgentCapabilityName } from './agent-capability';
import type { AgentCapabilityManager } from './agent-capability-manager';
import { AgentPermissionEngine } from './agent-permission';
import type { AgentRuntime } from './agent-runtime';
import type { AgentStorage } from './agent-storage';
import type { AgentDefinition, AgentExecution } from './types';
import type { WorkspaceSession } from './workspace-session';

export interface AgentServiceResult {
  success: boolean;
  message: string;
  execution?: AgentExecution;
  agent?: AgentDefinition;
}

const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  'architecture-analysis': 'Analyze repository architecture and structure',
  'design-review': 'Review design decisions and patterns',
  'dependency-analysis': 'Analyze package dependencies and detect cycles',
  'code-generation': 'Generate source code from specifications',
  refactoring: 'Refactor existing code for improvement',
  'bug-fixing': 'Identify and fix bugs in code',
  testing: 'Write and run automated tests',
  diagnostics: 'Run diagnostic checks on the system',
  'quality-analysis': 'Analyze code quality metrics',
  documentation: 'Generate and update documentation',
  summarization: 'Summarize conversations, code, or documents',
  'knowledge-management': 'Manage knowledge graph entries',
  'security-analysis': 'Analyze code for security vulnerabilities',
  'devops-automation': 'Automate DevOps workflows',
  'performance-optimization': 'Optimize application performance',
  'database-design': 'Design database schemas and queries',
  'release-management': 'Manage software releases',
  'ux-design': 'Design user interfaces and experiences',
  conversation: 'Handle conversational interactions',
  'conversation-design': 'Design conversation flows',
  'voice-ux': 'Design voice interaction patterns',
  'prompt-engineering': 'Engineer AI prompts',
  'stt-integration': 'Integrate speech-to-text',
  'tts-integration': 'Integrate text-to-speech',
  'vad-integration': 'Integrate voice activity detection',
  'audio-pipeline': 'Manage audio processing pipeline',
  'dashboard-monitoring': 'Monitor dashboard metrics and alerts',
  'react-development': 'Develop React components and applications',
  'ui-development': 'Build user interfaces',
  'tailwind-css': 'Style with Tailwind CSS',
  'dashboard-design': 'Design dashboard layouts',
  'data-visualization': 'Create data visualizations',
  'progress-tracking': 'Track development progress',
  'milestone-management': 'Manage project milestones',
  'feature-detection': 'Detect and catalog features',
  'development-velocity': 'Track development velocity',
  planning: 'Create and manage plans',
  governance: 'Apply governance policies',
};

export class AgentService {
  readonly id = 'vestara-agent-service';
  private storage: AgentStorage;
  private runtime: AgentRuntime;
  private permission: AgentPermissionEngine;
  private eventBus?: EventBus;
  private capabilities?: AgentCapabilityManager;

  constructor(opts: {
    storage: AgentStorage;
    runtime: AgentRuntime;
    eventBus?: EventBus;
    capabilities?: AgentCapabilityManager;
  }) {
    this.storage = opts.storage;
    this.runtime = opts.runtime;
    this.permission = new AgentPermissionEngine();
    this.eventBus = opts.eventBus;
    this.capabilities = opts.capabilities;
  }

  /**
   * Run an agent with capability and permission validation.
   */
  async runAgent(agentId: string, task: string, session: WorkspaceSession): Promise<AgentServiceResult> {
    const agent = await this.storage.getAgent(agentId);
    if (!agent) return { success: false, message: `Agent "${agentId}" not found` };
    if (agent.status === 'disabled') return { success: false, message: `Agent "${agent.name}" is disabled` };

    // Check basic permission (can read repository)
    const perm = this.permission.check(agent, 'repository', 'read');
    if (!perm.allowed) return { success: false, message: perm.reason || 'Permission denied' };

    try {
      const result = await this.runtime.run(agentId, task, session);
      await this.eventBus?.emit({
        type: 'agent:completed',
        source: 'agent-service',
        payload: { agentId, task, executionId: result.execution.id, agentName: agent.name },
        // ARX-015 M2: execution.id IS an execution identity — derive correlation canonically
        metadata: { correlationId: `cor-${result.execution.id}` },
      });
      return { success: true, message: result.message, execution: result.execution, agent };
    } catch (err: any) {
      return { success: false, message: `Agent execution failed: ${err.message}` };
    }
  }

  /**
   * List all capabilities with descriptions.
   */
  listCapabilities(): Array<{ id: string; name: string; description: string }> {
    const domain = Object.entries(CAPABILITY_DESCRIPTIONS).map(([id, description]) => ({
      id,
      name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description,
    }));
    if (this.capabilities) {
      domain.push(
        ...this.capabilities.listCapabilities().map((c) => ({
          id: c.name,
          name: c.name,
          description: c.description,
        })),
      );
    }
    return domain;
  }

  /**
   * Get capabilities available to a specific agent.
   */
  getAgentCapabilities(
    agent: AgentDefinition,
  ): Array<{ id: string; name: string; description: string; hasCapability: boolean }> {
    const domain = this.listCapabilities().map((cap) => ({
      ...cap,
      hasCapability: this.permission.hasCapability(agent, cap.id),
    }));

    if (this.capabilities) {
      const permitted = new Set(this.capabilities.getCapabilitiesForAgent(agent).map((c) => c.name));
      for (const cap of domain) {
        if (cap.id.startsWith('filesystem.')) cap.hasCapability = permitted.has(cap.id as AgentCapabilityName);
      }
    }
    return domain;
  }

  /**
   * Check if an agent can perform a specific action.
   */
  checkPermission(_agentId: string, _resource: string, _action: string): { allowed: boolean; reason?: string } {
    return { allowed: true }; // Simplified — full RBAC coming in v9.0
  }

  /**
   * Get execution history with capability-based filtering.
   */
  async getExecutionHistory(agentId?: string, statusFilter?: string): Promise<AgentExecution[]> {
    const execs = await this.storage.listExecutions(agentId);
    if (statusFilter) return execs.filter((e) => e.status === statusFilter);
    return execs;
  }

  /**
   * Get agent execution stats.
   */
  async getAgentStats(
    agentId: string,
  ): Promise<{ total: number; completed: number; failed: number; running: number; successRate: number }> {
    const execs = await this.storage.listExecutions(agentId);
    const completed = execs.filter((e) => e.status === 'completed').length;
    const failed = execs.filter((e) => e.status === 'failed').length;
    const running = execs.filter((e) => e.status === 'running' || e.status === 'queued').length;
    const total = execs.length;
    const finished = total - running;
    return {
      total,
      completed,
      failed,
      running,
      successRate: finished > 0 ? Math.round((completed / finished) * 100) : 0,
    };
  }
}
