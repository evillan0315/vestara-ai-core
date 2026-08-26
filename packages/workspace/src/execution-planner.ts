import type { AgentStorage } from './agent-storage';
import type { AgentAssignment, AgentDefinition, ExecutionStrategy, Plan, PlanExecution, Task } from './types';

const ROLE_TASK_PATTERNS: Array<{ patterns: RegExp[]; role: string }> = [
  { patterns: [/design|architecture|domain|module/i], role: 'architect' },
  { patterns: [/plan|strategy|approach/i], role: 'planner' },
  {
    patterns: [/backend|api|service|controller|repository|database|schema|migration|model|entity|implement/i],
    role: 'developer',
  },
  { patterns: [/frontend|ui|component|page|form|dashboard|view/i], role: 'developer' },
  { patterns: [/test|spec|unit|integration|e2e|coverage/i], role: 'verifier' },
  { patterns: [/review|audit|inspect/i], role: 'reviewer' },
  { patterns: [/security|permission|auth|vulnerability|compliance/i], role: 'security' },
  { patterns: [/document|doc|guide|readme|changelog/i], role: 'documentation' },
  { patterns: [/performance|benchmark|optimize/i], role: 'performance' },
  { patterns: [/verify|validate|check/i], role: 'verifier' },
];

const _ROLE_WEIGHTS: Record<AgentAssignment['role'], number> = {
  architect: 1,
  planner: 1,
  developer: 2,
  tester: 2,
  reviewer: 1,
  verifier: 1,
  documentation: 1,
  security: 1,
  performance: 1,
};

function estimateDuration(task: Task): number {
  const effortMap = { small: 30, medium: 120, large: 360 };
  return effortMap[task.effort] || 60;
}

function determineStrategy(tasks: Task[], agents: AgentDefinition[]): ExecutionStrategy {
  const taskCount = tasks.length;
  const agentCount = agents.filter((a) => a.status === 'active').length;
  if (taskCount <= 2 || agentCount <= 1) return 'sequential';
  if (agentCount >= 4 && taskCount >= 5) return 'hybrid';
  return 'parallel';
}

function assignRole(task: Task): string {
  for (const { patterns, role } of ROLE_TASK_PATTERNS) {
    if (patterns.some((p) => p.test(task.summary))) return role;
  }
  return 'developer';
}

function _toAgentAssignmentRole(role: string): AgentAssignment['role'] {
  const valid: AgentAssignment['role'][] = [
    'architect',
    'planner',
    'developer',
    'reviewer',
    'tester',
    'verifier',
    'documentation',
    'security',
    'performance',
  ];
  return valid.includes(role as any) ? (role as AgentAssignment['role']) : 'developer';
}

export class ExecutionPlanner {
  private storage: AgentStorage;

  constructor(storage: AgentStorage) {
    this.storage = storage;
  }

  async createExecutionPlan(plan: Plan): Promise<PlanExecution> {
    const agents = await this.storage.listAgents();
    const activeAgents = agents.filter((a) => a.status === 'active');

    // Assign agents to tasks
    const assignmentsMap = new Map<string, { taskIds: string[]; priority: AgentAssignment['priority'] }>();

    for (const task of plan.tasks) {
      const assignedRole = assignRole(task);

      if (!assignmentsMap.has(assignedRole)) {
        const priority: AgentAssignment['priority'] =
          task.effort === 'large' ? 'high' : task.effort === 'medium' ? 'normal' : 'low';
        assignmentsMap.set(assignedRole, { taskIds: [], priority });
      }
      assignmentsMap.get(assignedRole)!.taskIds.push(task.id);
    }

    // Build assignments with estimated durations
    const assignments: AgentAssignment[] = [];
    let totalDuration = 0;

    for (const [roleKey, data] of assignmentsMap) {
      const role = roleKey as AgentAssignment['role'];
      const duration = data.taskIds.reduce((sum, tid) => {
        const task = plan.tasks.find((t) => t.id === tid);
        return sum + (task ? estimateDuration(task) : 0);
      }, 0);

      totalDuration += duration;
      assignments.push({
        id: `assign-${roleKey}-${Date.now()}`,
        role,
        taskIds: data.taskIds,
        priority: data.priority,
        status: 'pending',
        estimatedDuration: duration,
      });
    }

    // Sort by weight (architect first, developer second, etc.)
    const weightMap: Record<string, number> = {
      architect: 1,
      planner: 1,
      developer: 2,
      tester: 2,
      reviewer: 1,
      verifier: 1,
      documentation: 1,
      security: 1,
      performance: 1,
    };
    assignments.sort((a, b) => (weightMap[a.role] || 3) - (weightMap[b.role] || 3));

    const strategy = determineStrategy(plan.tasks, activeAgents);

    return {
      strategy,
      estimatedDuration: totalDuration,
      estimatedAgents: assignments.length,
      assignments,
      approvalRequired: true,
    };
  }

  async findBestAgent(role: AgentAssignment['role'], agents: AgentDefinition[]): Promise<AgentDefinition | null> {
    const roleToAgentRole: Record<string, string> = {
      architect: 'architect',
      planner: 'planning',
      developer: 'developer',
      tester: 'tester',
      reviewer: 'reviewer',
      verifier: 'verifier',
      documentation: 'documentation-agent',
      security: 'security-agent',
      performance: 'performance-agent',
    };

    const agentRole = roleToAgentRole[role];
    const candidates = agents.filter((a) => a.role === agentRole && a.status === 'active');
    if (candidates.length === 0) return null;

    // Simple load balancing: pick the agent with fewest recent executions
    const execs = await Promise.all(candidates.map((a) => this.storage.listExecutions(a.id)));
    const counts = execs.map((e) => e.length);
    const minCount = Math.min(...counts);
    const idx = counts.indexOf(minCount);
    return candidates[idx] || candidates[0];
  }

  computeStrategy(plan: Plan): string {
    if (!plan.execution) return 'No execution plan';
    const { strategy, estimatedDuration, assignments } = plan.execution;
    const readyCount = assignments.filter((a) => a.status === 'ready' || a.status === 'completed').length;

    return [
      `${strategy.charAt(0).toUpperCase() + strategy.slice(1)} execution`,
      `${assignments.length} agents`,
      `${readyCount}/${assignments.length} ready`,
      `~${Math.round(estimatedDuration / 60)}h estimated`,
    ].join(' · ');
  }

  renderAssignments(plan: Plan): string {
    if (!plan.execution || plan.execution.assignments.length === 0) return 'No agent assignments.';
    const lines: string[] = ['Agent Assignments:'];
    for (const a of plan.execution.assignments) {
      const icon = a.status === 'completed' ? '✓' : a.status === 'running' ? '◉' : a.status === 'ready' ? '●' : '○';
      lines.push(`  ${icon} ${a.role.padEnd(15)} ${a.taskIds.length} tasks · ${a.priority} priority`);
    }
    return lines.join('\n');
  }
}
