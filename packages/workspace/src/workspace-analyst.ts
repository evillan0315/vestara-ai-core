import type { AIProvider } from '@vestara/shared';
import type { AgentStorage } from './agent-storage';
import type { WorkspaceSession } from './workspace-session';

export interface WorkspaceAnalysis {
  summary: string;
  architecture: string;
  health: string;
  risks: Array<{ severity: string; area: string; finding: string }>;
  recommendations: Array<{ priority: string; action: string; rationale: string }>;
  metrics: {
    totalFiles: number;
    totalPackages: number;
    totalDeps: number;
    entryPoints: number;
    testCoverage: number;
    docCoverage: number;
    agentCount: number;
    executionCount: number;
  };
  agentAssignments: Array<{ role: string; reason: string }>;
}

export class WorkspaceAnalyst {
  private storage: AgentStorage;
  private provider?: AIProvider;

  constructor(storage: AgentStorage, provider?: AIProvider) {
    this.storage = storage;
    this.provider = provider;
  }

  async analyze(session: WorkspaceSession): Promise<WorkspaceAnalysis> {
    const profile = session.profile;
    const health = profile.healthScore;

    // Collect agent data
    const agents = await this.storage.listAgents();
    const execs = await this.storage.listExecutions();
    const activeAgents = agents.filter((a) => a.status === 'active');
    const failedExecs = execs.filter((e) => e.status === 'failed');
    const recentExecs = execs.filter((e) => Date.now() - new Date(e.startedAt).getTime() < 86400000 * 7);

    const metrics = {
      totalFiles: profile.fileCount,
      totalPackages: profile.packageCount,
      totalDeps: profile.dependencyCount,
      entryPoints: profile.entryPoints.length,
      testCoverage: health ? Math.round(health.categories.testCoverage * 10) : 0,
      docCoverage: health ? Math.round(health.categories.documentation * 10) : 0,
      agentCount: activeAgents.length,
      executionCount: recentExecs.length,
    };

    // Build risk assessment
    const risks: WorkspaceAnalysis['risks'] = [];
    for (const r of profile.risks.slice(0, 5)) {
      risks.push({ severity: r.severity, area: r.category, finding: r.detail });
    }
    if (failedExecs.length >= 3) {
      risks.push({ severity: 'high', area: 'agents', finding: `${failedExecs.length} failed agent executions` });
    }
    if (metrics.testCoverage < 50) {
      risks.push({ severity: 'medium', area: 'testing', finding: `Test coverage at ${metrics.testCoverage}%` });
    }

    // AI-powered analysis
    if (this.provider) {
      try {
        const aiResult = await this._aiAnalyze(profile, metrics, risks, agents);
        // Record into agent memory
        await this.storage.saveMemory({
          id: `mem-analysis-${Date.now()}`,
          agentId: 'agent-analyst',
          type: 'observation',
          summary: `Workspace analysis: ${profile.name}`,
          detail: aiResult.summary,
          tags: ['analysis', 'workspace', new Date().toISOString().slice(0, 10)],
          confidence: 0.85,
          createdAt: new Date().toISOString(),
        });
        return aiResult;
      } catch {
        // Fall through to deterministic analysis
      }
    }

    // Deterministic fallback
    return this._deterministicAnalysis(profile, metrics, risks, agents);
  }

  private async _aiAnalyze(
    profile: any,
    metrics: WorkspaceAnalysis['metrics'],
    risks: WorkspaceAnalysis['risks'],
    agents: any[],
  ): Promise<WorkspaceAnalysis> {
    const prompt = `You are Vestara's Workspace Analyst. Analyze this engineering workspace and provide structured insights.

Workspace: ${profile.name}
Language: ${profile.language}
Framework: ${profile.framework || '(none)'}
Monorepo: ${profile.isMonorepo ? 'Yes' : 'No'}

Metrics:
- Files: ${metrics.totalFiles}
- Packages: ${metrics.totalPackages}
- Dependencies: ${metrics.totalDeps}
- Entry Points: ${metrics.entryPoints}
- Test Coverage: ${metrics.testCoverage}%
- Documentation Coverage: ${metrics.docCoverage}%
- Active Agents: ${metrics.agentCount}
- Recent Executions: ${metrics.executionCount}

Health Score: ${profile.healthScore ? profile.healthScore.overall.toFixed(1) : 'N/A'}/10

Entry Points:
${profile.entryPoints
  .slice(0, 10)
  .map((e: any) => `  ${e.path}`)
  .join('\n')}

Risks:
${risks.map((r) => `  [${r.severity}] ${r.area}: ${r.finding}`).join('\n')}

Available Agents:
${agents
  .filter((a) => a.status === 'active')
  .map((a: any) => `  ${a.name} (${a.role}): ${(a.capabilities || []).slice(0, 3).join(', ')}`)
  .join('\n')}

Return a JSON object with this exact structure:
{
  "summary": "One-paragraph workspace summary",
  "architecture": "Architecture description based on entry points and package structure",
  "health": "Health assessment",
  "risks": [{"severity": "high|medium|low", "area": "area name", "finding": "specific finding"}],
  "recommendations": [{"priority": "high|medium|low", "action": "recommended action", "rationale": "why"}],
  "metrics": { ...same as input metrics },
  "agentAssignments": [{"role": "agent role", "reason": "why this agent is needed"}]
}`;

    const response = await this.provider!.complete({
      model: 'deepseek-v4-flash-free',
      messages: [
        {
          role: 'system',
          content: "You are Vestara's Workspace Analyst. Analyze workspaces and return structured JSON only.",
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 2048,
    });

    if (response.content) {
      try {
        const parsed = JSON.parse(response.content);
        return {
          summary: parsed.summary || 'Analysis complete.',
          architecture: parsed.architecture || 'Unknown architecture.',
          health: parsed.health || 'Unknown.',
          risks: parsed.risks || [],
          recommendations: parsed.recommendations || [],
          metrics,
          agentAssignments: parsed.agentAssignments || [],
        };
      } catch {}
    }

    return this._deterministicAnalysis(profile, metrics, risks, agents);
  }

  private _deterministicAnalysis(
    profile: any,
    metrics: WorkspaceAnalysis['metrics'],
    risks: WorkspaceAnalysis['risks'],
    agents: any[],
  ): WorkspaceAnalysis {
    const langMap: Record<string, string> = {
      typescript: 'TypeScript',
      javascript: 'JavaScript',
      python: 'Python',
      rust: 'Rust',
      go: 'Go',
      java: 'Java',
      ruby: 'Ruby',
      csharp: 'C#',
      php: 'PHP',
      swift: 'Swift',
    };

    const architecture = profile.isMonorepo
      ? `Monorepo with ${metrics.totalPackages} packages using ${langMap[profile.language] || profile.language}`
      : `${metrics.totalPackages} package ${langMap[profile.language] || profile.language} project`;

    const health = profile.healthScore
      ? `Health score ${profile.healthScore.overall.toFixed(1)}/10 (code: ${Math.round(profile.healthScore.categories.codeQuality * 10)}%, tests: ${metrics.testCoverage}%, docs: ${metrics.docCoverage}%)`
      : 'Health score not available';

    const summary = `${profile.name} — ${architecture}. ${metrics.totalFiles} files across ${metrics.totalPackages} packages with ${metrics.totalDeps} dependencies. ${metrics.agentCount} active agents available.`;

    const recommendations: WorkspaceAnalysis['recommendations'] = [];
    if (metrics.testCoverage < 50) {
      recommendations.push({
        priority: 'high',
        action: 'Improve test coverage',
        rationale: `Current coverage is ${metrics.testCoverage}%, below 50% threshold`,
      });
    }
    if (metrics.docCoverage < 40) {
      recommendations.push({
        priority: 'medium',
        action: 'Add documentation',
        rationale: `Documentation coverage is ${metrics.docCoverage}%`,
      });
    }
    if (risks.length > 0) {
      recommendations.push({
        priority: 'medium',
        action: 'Address identified risks',
        rationale: `${risks.length} risks detected, including ${risks[0].area}`,
      });
    }

    const agentAssignments = agents
      .filter((a) => a.status === 'active')
      .slice(0, 5)
      .map((a) => ({ role: a.role, reason: `${a.name}: ${(a.capabilities || []).slice(0, 2).join(', ')}` }));

    return {
      summary,
      architecture,
      health,
      risks,
      recommendations,
      metrics,
      agentAssignments,
    };
  }

  renderAnalysis(analysis: WorkspaceAnalysis): string {
    const lines: string[] = [
      `Workspace Analysis for ${analysis.metrics.totalFiles} files across ${analysis.metrics.totalPackages} packages`,
      '',
      analysis.summary,
      '',
      `Architecture: ${analysis.architecture}`,
      `Health: ${analysis.health}`,
      '',
      'Metrics:',
      `  Files: ${analysis.metrics.totalFiles}`,
      `  Packages: ${analysis.metrics.totalPackages}`,
      `  Dependencies: ${analysis.metrics.totalDeps}`,
      `  Entry Points: ${analysis.metrics.entryPoints}`,
      `  Active Agents: ${analysis.metrics.agentCount}`,
      `  Weekly Executions: ${analysis.metrics.executionCount}`,
      '',
    ];

    if (analysis.risks.length > 0) {
      lines.push('Risks:');
      for (const r of analysis.risks) {
        lines.push(`  [${r.severity.toUpperCase()}] ${r.area}: ${r.finding}`);
      }
      lines.push('');
    }

    if (analysis.recommendations.length > 0) {
      lines.push('Recommendations:');
      for (const r of analysis.recommendations) {
        lines.push(`  ${r.priority === 'high' ? '⚠' : '•'} [${r.priority}] ${r.action}`);
        lines.push(`     ${r.rationale}`);
      }
      lines.push('');
    }

    if (analysis.agentAssignments.length > 0) {
      lines.push('Recommended Agents:');
      for (const a of analysis.agentAssignments) {
        lines.push(`  ${a.role}: ${a.reason}`);
      }
    }

    return lines.join('\n');
  }
}
