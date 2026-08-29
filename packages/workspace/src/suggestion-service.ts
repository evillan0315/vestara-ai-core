import type { EventBus } from '@vestara/event-bus';
import type { AIProvider, CompletionResponse } from '@vestara/shared';
import type { AgentStorage } from './agent-storage';
import type { ExecutionPlanner } from './execution-planner';
import type { MilestoneService } from './milestone-service';
import type { PlanStorage } from './plan-storage';
import type { ProjectStorage } from './project-storage';
import type { SuggestionStorage } from './suggestion-storage';
import type { AgentAssignment } from './types';
import type { WorkspaceSession } from './workspace-session';

export interface Suggestion {
  id: string;
  category:
    | 'health'
    | 'risk'
    | 'planning'
    | 'testing'
    | 'documentation'
    | 'architecture'
    | 'dependency'
    | 'agent'
    | 'project'
    | 'conversation'
    | 'milestone'
    | 'activity'
    | 'performance';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  command: string;
  impact: string;
  source?: string;
}

const SUGGESTION_ICONS: Record<string, string> = {
  health: '🩺',
  risk: '⚠️',
  planning: '📋',
  testing: '🧪',
  documentation: '📝',
  architecture: '🏗️',
  dependency: '🔗',
  agent: '🤖',
  project: '📊',
  conversation: '💬',
  milestone: '🎯',
  activity: '📈',
  performance: '⚡',
};

export class SuggestionService {
  private planStorage?: PlanStorage;
  private provider?: AIProvider;
  private storage?: SuggestionStorage;
  private agentStorage?: AgentStorage;
  private projectStorage?: ProjectStorage;
  private milestoneService?: MilestoneService;
  private eventBus?: EventBus;
  private executionPlanner?: ExecutionPlanner;

  constructor(opts?: {
    planStorage?: PlanStorage;
    provider?: AIProvider;
    storage?: SuggestionStorage;
    agentStorage?: AgentStorage;
    projectStorage?: ProjectStorage;
    milestoneService?: MilestoneService;
    eventBus?: EventBus;
    executionPlanner?: ExecutionPlanner;
  }) {
    this.planStorage = opts?.planStorage;
    this.provider = opts?.provider;
    this.storage = opts?.storage;
    this.agentStorage = opts?.agentStorage;
    this.projectStorage = opts?.projectStorage;
    this.milestoneService = opts?.milestoneService;
    this.eventBus = opts?.eventBus;
    this.executionPlanner = opts?.executionPlanner;
  }

  async generate(session: WorkspaceSession, filter?: { excludeDismissed?: boolean }): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    const profile = session.profile;
    const health = profile.healthScore;

    // Health-based suggestions
    if (health) {
      if (health.categories.testCoverage < 5)
        suggestions.push({
          id: 'sug-test-coverage',
          category: 'testing',
          priority: 'high',
          title: 'Low test coverage',
          description: `Test coverage score is ${health.categories.testCoverage.toFixed(1)}/10. Add tests to improve quality.`,
          command: 'explain risks',
          impact: 'Improves test coverage and reduces regression risk',
        });
      if (health.categories.documentation < 5)
        suggestions.push({
          id: 'sug-documentation',
          category: 'documentation',
          priority: 'medium',
          title: 'Documentation gaps',
          description: `Documentation score is ${health.categories.documentation.toFixed(1)}/10. Adding README and doc files improves maintainability.`,
          command: 'plan "Add documentation"',
          impact: 'Improves documentation score and project maintainability',
        });
      if (health.categories.codeQuality < 5)
        suggestions.push({
          id: 'sug-code-quality',
          category: 'health',
          priority: 'medium',
          title: 'Code quality concerns',
          description: `Code quality score is ${health.categories.codeQuality.toFixed(1)}/10. Large files and TODOs indicate technical debt.`,
          command: 'explain risks',
          impact: 'Reduces technical debt and improves code maintainability',
        });
      if (health.categories.dependencyHealth < 5)
        suggestions.push({
          id: 'sug-dep-health',
          category: 'dependency',
          priority: 'medium',
          title: 'Dependency health concerns',
          description: `Dependency health score is ${health.categories.dependencyHealth.toFixed(1)}/10. Review and update dependencies.`,
          command: 'explain dependencies',
          impact: 'Improves dependency health and reduces supply chain risk',
        });
    }

    // Risk-based
    const highRisks = profile.risks.filter((r) => r.severity === 'high');
    for (const risk of highRisks.slice(0, 3)) {
      suggestions.push({
        id: `sug-risk-${risk.category}`,
        category: 'risk',
        priority: 'high',
        title: `${risk.category}: ${risk.detail}`,
        description: `High-severity risk at ${risk.location}.`,
        command: `explain ${risk.location}`,
        impact: 'Reducing this risk improves overall health score',
      });
    }

    // Milestone-based suggestions
    if (this.milestoneService) {
      try {
        const _progress = this.milestoneService.getProgress();
        const current = this.milestoneService.getCurrent();
        if (current && current.status === 'in_progress') {
          suggestions.push({
            id: 'sug-milestone-active',
            category: 'milestone',
            priority: 'high',
            title: `Working on: ${current.name}`,
            description: `${current.version} — ${current.description}. Keep progressing to complete this milestone.`,
            command: 'milestone-status',
            impact: `Complete ${current.version} to advance development`,
          });
        }
        const pendings = this.milestoneService.list().filter((m) => m.status === 'pending');
        if (pendings.length > 0 && (!current || current.status === 'completed')) {
          const next = pendings[0];
          suggestions.push({
            id: 'sug-milestone-next',
            category: 'milestone',
            priority: 'medium',
            title: `Next milestone: ${next.name}`,
            description: `${next.version} — ${next.description}. Start working on the next milestone.`,
            command: `plan "${next.name}"`,
            impact: `Begin ${next.version} to maintain development velocity`,
          });
        }
      } catch {}
    }

    // Agent-based suggestions
    if (this.agentStorage) {
      try {
        const execs = await this.agentStorage.listExecutions();
        const failed = execs.filter((e) => e.status === 'failed');
        if (failed.length >= 3)
          suggestions.push({
            id: 'sug-agent-failures',
            category: 'agent',
            priority: 'high',
            title: `${failed.length} failed agent executions`,
            description: `${failed.length} agent tasks have failed. Check agent configurations and provider status.`,
            command: 'agent list',
            impact: 'Agent reliability affects workspace velocity',
          });
        const running = execs.filter((e) => e.status === 'running');
        if (running.length > 0)
          suggestions.push({
            id: 'sug-agent-running',
            category: 'agent',
            priority: 'low',
            title: `${running.length} agent(s) running`,
            description: `${running.length} agent tasks are in progress. Monitor progress in the Agent Control Center.`,
            command: 'agent list',
            impact: 'Track active agent tasks',
          });
        // Suggest creating a team if there are unassigned agents
        const allAgents = await this.agentStorage.listAgents();
        const teams = await this.agentStorage.listTeams().catch(() => []);
        const assignedIds = new Set(teams.flatMap((t) => [t.leaderAgentId, ...t.memberIds].filter(Boolean)));
        const unassigned = allAgents.filter(
          (a) =>
            a.status === 'active' && !assignedIds.has(a.id) && a.id !== 'agent-architect' && a.id !== 'agent-developer',
        );
        if (unassigned.length >= 2)
          suggestions.push({
            id: 'sug-agent-team',
            category: 'agent',
            priority: 'low',
            title: `${unassigned.length} unassigned agents`,
            description: `${unassigned.length} active agents have no team. Create a team to organize them.`,
            command: 'agent list',
            impact: 'Better agent organization improves workflow',
          });
      } catch {}
    }

    // Project-based suggestions
    if (this.projectStorage) {
      try {
        const projs = await this.projectStorage.listProjects();
        const active = projs.filter((p) => p.status === 'active');
        const planning = projs.filter((p) => p.status === 'planning');
        if (planning.length > 0)
          suggestions.push({
            id: 'sug-projects-planning',
            category: 'project',
            priority: 'medium',
            title: `${planning.length} project(s) in planning`,
            description: `${planning.length} projects haven't started active development.`,
            command: 'projects',
            impact: 'Move projects to active to track progress',
          });
        if (active.length > 0) {
          const allTasks = await Promise.all(active.map((p) => this.projectStorage!.getProjectStats(p.id)));
          const totalBacklog = allTasks.reduce((s, st) => s + st.backlog, 0);
          if (totalBacklog > 10)
            suggestions.push({
              id: 'sug-backlog',
              category: 'project',
              priority: 'medium',
              title: `${totalBacklog} tasks in backlog`,
              description: `Active projects have ${totalBacklog} tasks in backlog. Prioritize them.`,
              command: 'projects',
              impact: 'Clear backlog to maintain development velocity',
            });
          const doneTasks = allTasks.reduce((s, st) => s + st.done, 0);
          const totalTasks = allTasks.reduce((s, st) => s + st.total, 0);
          if (totalTasks > 0 && doneTasks / totalTasks > 0.8)
            suggestions.push({
              id: 'sug-projects-nearly-done',
              category: 'project',
              priority: 'low',
              title: 'Projects nearly complete',
              description: `Active projects are ${Math.round((doneTasks / totalTasks) * 100)}% complete. Push to finish remaining tasks.`,
              command: 'projects',
              impact: 'Closing projects reduces overhead',
            });
        }
      } catch {}
    }

    // Planning suggestions
    if (this.planStorage) {
      try {
        const plans = await this.planStorage.list(session.fingerprint.id);
        const approved = plans.filter((p) => p.status === 'approved');
        const drafts = plans.filter((p) => p.status === 'draft');
        if (approved.length > 0)
          suggestions.push({
            id: 'sug-implement',
            category: 'planning',
            priority: 'high',
            title: `${approved.length} approved plan(s) ready to implement`,
            description: `Plan ${approved[0].id}: "${approved[0].goal.slice(0, 60)}" is approved and waiting.`,
            command: `implement ${approved[0].id}`,
            impact: 'Move approved plan to implementation',
          });
        if (drafts.length > 0)
          suggestions.push({
            id: 'sug-approve',
            category: 'planning',
            priority: 'medium',
            title: `${drafts.length} draft plan(s) need review`,
            description: `Plan ${drafts[0].id} is in draft status and needs approval.`,
            command: `plan show ${drafts[0].id}`,
            impact: 'Review and approve draft plans to proceed',
          });
      } catch {}
    }

    // Architecture & dependency
    if (profile.entryPoints.length > 5)
      suggestions.push({
        id: 'sug-architecture',
        category: 'architecture',
        priority: 'low',
        title: `${profile.entryPoints.length} entry points`,
        description: 'A large number of entry points may indicate unclear module boundaries.',
        command: 'explain architecture',
        impact: 'Better understanding of module boundaries',
      });
    if (profile.dependencyCount > 50)
      suggestions.push({
        id: 'sug-dependencies',
        category: 'dependency',
        priority: 'low',
        title: `${profile.dependencyCount} dependencies`,
        description: 'A large dependency graph increases complexity and risk.',
        command: 'explain dependencies',
        impact: 'Identify unused or redundant dependencies',
      });

    // TODO hotspots
    const todoRisks = profile.risks.filter((r) => r.category === 'todo-hotspot');
    if (todoRisks.length > 0)
      suggestions.push({
        id: 'sug-todos',
        category: 'planning',
        priority: 'low',
        title: `${todoRisks.length} TODO/FIXME hotspot(s)`,
        description: 'Unresolved TODOs and FIXME markers indicate incomplete work.',
        command: 'explain risks',
        impact: 'Clear technical debt markers from the codebase',
      });

    // Performance suggestion (if file count is very high)
    if (profile.fileCount > 500)
      suggestions.push({
        id: 'sug-performance',
        category: 'performance',
        priority: 'low',
        title: `${profile.fileCount} files in repository`,
        description: 'A large number of files can slow down tooling and IDE performance.',
        command: 'explain architecture',
        impact: 'Consider modularizing to improve tooling performance',
      });

    // Activity-based: suggest if no recent agent activity
    if (this.agentStorage) {
      try {
        const recentExes = await this.agentStorage.listExecutions();
        const lastWeek = recentExes.filter((e) => Date.now() - new Date(e.startedAt).getTime() < 604800000);
        if (lastWeek.length === 0 && recentExes.length > 0) {
          suggestions.push({
            id: 'sug-no-recent-activity',
            category: 'activity',
            priority: 'low',
            title: 'No recent agent activity',
            description: 'No agent executions in the last 7 days. Run a task to keep progress moving.',
            command: 'agent list',
            impact: 'Regular agent usage maintains development velocity',
          });
        }
      } catch {}
    }

    // Filter dismissed
    if (filter?.excludeDismissed && this.storage) {
      const filtered: Suggestion[] = [];
      for (const s of suggestions) {
        const dismissed = await this.storage.isDismissed(s.id);
        if (!dismissed) filtered.push(s);
      }
      return this._sort(filtered);
    }

    return this._sort(suggestions);
  }

  async dismiss(suggestionId: string, reason?: string): Promise<void> {
    if (this.storage) await this.storage.dismiss(suggestionId, reason);
  }

  async trackAction(suggestionId: string, action: string): Promise<void> {
    if (this.storage) await this.storage.trackAction(suggestionId, action);
    await this.eventBus?.emit({
      type: 'suggestion:action',
      source: 'suggestion-service',
      payload: { suggestionId, action },
      // ARX-015 M2: suggestionId is not an execution identity — correlation absent (fail-closed)
      metadata: {},
    });
  }

  async aiSuggest(session: WorkspaceSession): Promise<string> {
    if (!this.provider) return this.renderSuggestions(await this.generate(session));
    const profile = session.profile;
    const health = profile.healthScore;
    const topRisks = profile.risks.slice(0, 5);
    const prompt = `You are Vestara's engineering advisor. Analyze this workspace and suggest what to work on next.

Workspace: ${profile.name}
Language: ${profile.language}
Framework: ${profile.framework ?? '(none)'}
Monorepo: ${profile.isMonorepo ? 'Yes' : 'No'}
Packages: ${profile.packageCount}
Dependencies: ${profile.dependencyCount}
Files: ${profile.fileCount}
Entry Points: ${profile.entryPoints.length}

Health Score: ${health ? health.overall.toFixed(1) : 'N/A'}/10
- Code Quality: ${health ? health.categories.codeQuality.toFixed(1) : 'N/A'}/10
- Test Coverage: ${health ? health.categories.testCoverage.toFixed(1) : 'N/A'}/10
- Documentation: ${health ? health.categories.documentation.toFixed(1) : 'N/A'}/10

Top Risks:
${topRisks.map((r) => `  [${r.severity}] ${r.category}: ${r.detail}`).join('\n')}

Return a JSON object with exactly 3 suggestions, each having: "title" (string), "priority" ("high"|"medium"|"low"), "rationale" (string), "command" (string).

Format: { "suggestions": [...] }`;

    try {
      const response: CompletionResponse = await this.provider.complete({
        model: 'deepseek-v4-flash-free',
        messages: [
          { role: 'system', content: "You are Vestara's engineering advisor. Return JSON only." },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        maxTokens: 1024,
      });
      if (!response.content) return this.renderSuggestions(await this.generate(session));
      try {
        const parsed = JSON.parse(response.content);
        if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) throw new Error('Invalid format');
        const lines = ['AI-Powered Suggestions:'];
        for (const s of parsed.suggestions.slice(0, 3)) {
          lines.push(`  ${s.priority === 'high' ? '⚠' : '•'} [${s.priority}] ${s.title}`);
          lines.push(`     ${s.rationale}`);
          if (s.command) lines.push(`     ${s.command}`);
        }
        return lines.join('\n');
      } catch {
        return this.renderSuggestions(await this.generate(session));
      }
    } catch {
      return this.renderSuggestions(await this.generate(session));
    }
  }

  async planRecommendations(planId: string, _session: WorkspaceSession): Promise<string> {
    if (!this.planStorage) return 'Plan storage not available.';
    const plan = await this.planStorage.get(planId);
    if (!plan) return 'Plan not found.';

    // Generate AI recommendations for this specific plan
    if (this.provider) {
      const tasks = plan.tasks.map((t) => `  [${t.effort}] ${t.summary} (${t.status})`).join('\n');
      const deps = plan.tasks
        .filter((t) => t.dependencies.length > 0)
        .map((t) => `  ${t.summary} depends on: ${t.dependencies.join(', ')}`)
        .join('\n');
      const prompt = `You are Vestara's implementation advisor. Analyze this plan and provide implementation recommendations.

Plan: ${plan.title}
Goal: ${plan.goal}
Status: ${plan.status}

Tasks (${plan.tasks.length}):
${tasks}

${deps ? `Dependencies:\n${deps}` : 'No explicit dependencies.'}

Provide a JSON object with exactly 3 recommendations. Each must have:
- "title" (brief recommendation)
- "priority" ("high"|"medium"|"low") 
- "rationale" (why this matters)
- "suggestedOrder" (array of task summaries in recommended order for this recommendation)

Format: { "recommendations": [{ "title": string, "priority": string, "rationale": string, "suggestedOrder": string[] }] }`;

      try {
        const response: CompletionResponse = await this.provider.complete({
          model: 'deepseek-v4-flash-free',
          messages: [
            { role: 'system', content: "You are Vestara's implementation advisor. Return JSON only." },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
          maxTokens: 1536,
        });
        if (response.content) {
          try {
            const parsed = JSON.parse(response.content);
            if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
              // Also get ExecutionPlanner assignments if available
              let assignInfo = '';
              if (this.executionPlanner) {
                try {
                  const execPlan = await this.executionPlanner.createExecutionPlan(plan);
                  assignInfo =
                    '\n\nRecommended Agent Assignments:\n' +
                    execPlan.assignments
                      .map(
                        (a: AgentAssignment) =>
                          `  ${a.role}: ${a.taskIds.length} tasks (${a.priority} priority, ~${Math.round((a.estimatedDuration || 0) / 60)}h)`,
                      )
                      .join('\n');
                } catch {}
              }

              const lines = [`Implementation Recommendations for "${plan.title}":`, ''];
              for (const r of parsed.recommendations.slice(0, 3)) {
                lines.push(`  ${r.priority === 'high' ? '⚠' : '•'} [${r.priority}] ${r.title}`);
                lines.push(`     ${r.rationale}`);
                if (r.suggestedOrder && r.suggestedOrder.length > 0) {
                  lines.push('     Suggested order:');
                  for (const step of r.suggestedOrder.slice(0, 5)) {
                    lines.push(`       ${step}`);
                  }
                }
                lines.push('');
              }
              if (assignInfo) lines.push(assignInfo);
              return lines.join('\n');
            }
          } catch {}
        }
      } catch {}
    }

    // Fallback: deterministic recommendations
    const totalEffort = plan.tasks.reduce((sum, t) => {
      return sum + (t.effort === 'large' ? 3 : t.effort === 'medium' ? 2 : 1);
    }, 0);
    const completed = plan.tasks.filter((t) => t.status === 'completed').length;
    const remaining = plan.tasks.filter((t) => t.status !== 'completed');
    const lines = [`Plan "${plan.title}" — Deterministic Recommendations`, ''];
    if (remaining.length > 0) {
      lines.push(
        `  • [${remaining.length} tasks remaining (${Math.round((completed / plan.tasks.length) * 100)}% complete)`,
      );
      lines.push(`     Estimated effort: ${totalEffort} story points`);
      // Suggest execution strategy
      if (this.executionPlanner) {
        try {
          const execPlan = await this.executionPlanner.createExecutionPlan(plan);
          lines.push(
            `  Strategy: ${execPlan.strategy} · ${execPlan.estimatedAgents} agents · ~${Math.round(execPlan.estimatedDuration / 60)}h`,
          );
        } catch {}
      }
    } else {
      lines.push('  ✓ All tasks completed');
    }
    return lines.join('\n');
  }

  async featureAnalysis(feature: string, session: WorkspaceSession): Promise<string> {
    const profile = session.profile;

    if (this.provider) {
      const prompt = `You are Vestara's product advisor. Analyze this feature request for implementation.

Feature: ${feature}
Workspace: ${profile.name}
Language: ${profile.language}
Framework: ${profile.framework || '(none)'}
Packages: ${profile.packageCount}

Provide a JSON object with:
- "summary" (one-line summary)
- "complexity" ("low"|"medium"|"high")
- "estimatedEffort" (string like "2-4 hours")
- "affectedAreas" (array of strings)
- "suggestedApproach" (3-5 step approach array)
- "risks" (array of { area: string, risk: string })
- "agents" (array of roles needed)

Format: { "summary": string, "complexity": string, "estimatedEffort": string, "affectedAreas": string[], "suggestedApproach": string[], "risks": Array<{area: string, risk: string}>, "agents": string[] }`;

      try {
        const response: CompletionResponse = await this.provider.complete({
          model: 'deepseek-v4-flash-free',
          messages: [
            { role: 'system', content: "You are Vestara's product advisor. Return JSON only." },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
          maxTokens: 1024,
        });
        if (response.content) {
          try {
            const parsed = JSON.parse(response.content);
            const lines = [`Feature Analysis: ${feature}`, ''];
            lines.push(`  Summary: ${parsed.summary || feature}`);
            lines.push(
              `  Complexity: ${parsed.complexity || 'Unknown'} · Estimated: ${parsed.estimatedEffort || 'Unknown'}`,
            );
            if (parsed.affectedAreas?.length > 0) lines.push(`  Affected Areas: ${parsed.affectedAreas.join(', ')}`);
            if (parsed.agents?.length > 0) lines.push(`  Agents Needed: ${parsed.agents.join(', ')}`);
            if (parsed.suggestedApproach?.length > 0) {
              lines.push('', '  Suggested Approach:');
              for (const step of parsed.suggestedApproach) lines.push(`    ${step}`);
            }
            if (parsed.risks?.length > 0) {
              lines.push('', '  Risks:');
              for (const r of parsed.risks) lines.push(`    [${r.area}] ${r.risk}`);
            }
            return lines.join('\n');
          } catch {}
        }
      } catch {}
    }

    // Deterministic fallback
    return [
      `Feature Analysis: ${feature}`,
      '',
      '  (AI provider unavailable — deterministic estimation)',
      `  Workspace: ${profile.name}`,
      `  Packages: ${profile.packageCount} · Files: ${profile.fileCount}`,
      `  Suggested next step: create a plan with "plan ${feature}"`,
    ].join('\n');
  }

  renderSuggestions(suggestions: Suggestion[]): string {
    if (suggestions.length === 0) return 'No suggestions at this time. Workspace looks good.';
    return suggestions
      .map(
        (s) =>
          `  ${s.priority === 'high' ? '⚠' : '•'} [${s.priority}] ${s.title}\n     ${s.description}\n     ${s.command} — ${s.impact}`,
      )
      .join('\n\n');
  }

  private _sort(s: Suggestion[]): Suggestion[] {
    const order = { high: 0, medium: 1, low: 2 };
    return s.sort((a, b) => order[a.priority] - order[b.priority]);
  }
}

export { SUGGESTION_ICONS };
