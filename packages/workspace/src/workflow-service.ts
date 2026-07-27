/**
 * WorkflowService — Guided engineering workflows.
 *
 * Defines and orchestrates multi-step engineering processes.
 * Workflows are higher-level than plans — they orchestrate the
 * entire lifecycle: open → explain → plan → predict → implement → verify.
 *
 * Architecture Traceability:
 *   Product Principle: Evolve Intelligence Before Autonomy
 */

import type { Workflow, WorkflowContext, WorkflowId, WorkflowStepDef } from './types';
import type { WorkspaceSession } from './workspace-session';

const WORKFLOW_DEFS: Record<WorkflowId, { name: string; description: string; steps: WorkflowStepDef[] }> = {
  feature: {
    name: 'Feature Development',
    description: 'Build a new feature from understanding through verification.',
    steps: [
      {
        id: 'open',
        label: 'Open Repository',
        command: 'vestara open .',
        description: 'Open the repository to analyze its structure.',
        required: true,
      },
      {
        id: 'explain',
        label: 'Explain Architecture',
        command: 'explain architecture',
        description: 'Understand the current architecture before making changes.',
        required: false,
      },
      {
        id: 'plan',
        label: 'Create Plan',
        command: 'plan <goal>',
        description: 'Describe what you want to build. Vestara creates a structured plan.',
        required: true,
      },
      {
        id: 'predict',
        label: 'Predict Impact',
        command: 'predict plan <id>',
        description: 'See the likely impact before implementing.',
        required: false,
      },
      {
        id: 'recommend',
        label: 'Review Recommendation',
        command: 'recommend plan <id>',
        description: 'Get a recommendation on whether to proceed.',
        required: false,
      },
      {
        id: 'implement',
        label: 'Implement Changes',
        command: 'implement <plan-id>',
        description: 'Generate code changes from the approved plan.',
        required: true,
      },
      {
        id: 'verify',
        label: 'Verify Changes',
        command: 'verify <cs-id>',
        description: 'Run automated checks to validate the changes.',
        required: true,
      },
      {
        id: 'collaborate',
        label: 'Submit for Review',
        command: 'collab submit <cs-id>',
        description: 'Submit changes for review and approval.',
        required: true,
      },
    ],
  },
  bugfix: {
    name: 'Bug Fix',
    description: 'Fix an issue from reproduction through verification.',
    steps: [
      {
        id: 'open',
        label: 'Open Repository',
        command: 'vestara open .',
        description: 'Open the repository containing the bug.',
        required: true,
      },
      {
        id: 'explain',
        label: 'Locate the Issue',
        command: 'explain packages/<module>',
        description: 'Find the relevant module where the bug exists.',
        required: true,
      },
      {
        id: 'plan',
        label: 'Create Fix Plan',
        command: 'plan <fix description>',
        description: 'Describe the fix. Vestara creates a minimal change plan.',
        required: true,
      },
      {
        id: 'predict',
        label: 'Assess Risk',
        command: 'predict plan <id>',
        description: 'Verify the fix has low risk before implementing.',
        required: false,
      },
      {
        id: 'implement',
        label: 'Apply Fix',
        command: 'implement <plan-id>',
        description: 'Generate the code fix.',
        required: true,
      },
      {
        id: 'verify',
        label: 'Verify Fix',
        command: 'verify <cs-id>',
        description: 'Run tests and typecheck to confirm the fix works.',
        required: true,
      },
    ],
  },
  review: {
    name: 'Repository Review',
    description: 'Perform a comprehensive health review of a repository.',
    steps: [
      {
        id: 'open',
        label: 'Open Repository',
        command: 'vestara open .',
        description: 'Open the repository for review.',
        required: true,
      },
      {
        id: 'health',
        label: 'Check Health Score',
        command: 'summary (see Health Score)',
        description: 'Review the overall health score and category breakdown.',
        required: true,
      },
      {
        id: 'risks',
        label: 'Review Risks',
        command: 'risks',
        description: 'Examine all detected risks and hotspots.',
        required: true,
      },
      {
        id: 'explain',
        label: 'Review Architecture',
        command: 'explain architecture',
        description: 'Understand the architectural patterns and entry points.',
        required: true,
      },
      {
        id: 'dependencies',
        label: 'Review Dependencies',
        command: 'explain dependencies',
        description: 'Review package dependencies and relationships.',
        required: true,
      },
      {
        id: 'memory',
        label: 'Index Knowledge',
        command: 'memory index',
        description: 'Index all artifacts into the knowledge graph.',
        required: false,
      },
      {
        id: 'recommendations',
        label: 'Review Recommendations',
        command: 'recommend',
        description: 'Get recommendations for improving repository health.',
        required: false,
      },
    ],
  },
};

export class WorkflowService {
  private workflows: Map<string, Workflow> = new Map();

  /**
   * List all available workflow definitions.
   */
  listDefinitions(): Array<{ id: WorkflowId; name: string; description: string; steps: number }> {
    return Object.entries(WORKFLOW_DEFS).map(([id, def]) => ({
      id: id as WorkflowId,
      name: def.name,
      description: def.description,
      steps: def.steps.length,
    }));
  }

  /**
   * Start a new workflow instance.
   */
  start(workflowId: WorkflowId, goal: string): Workflow {
    const def = WORKFLOW_DEFS[workflowId];
    if (!def) throw new Error(`Unknown workflow: ${workflowId}`);

    const now = new Date().toISOString();
    const workflow: Workflow = {
      id: workflowId,
      name: def.name,
      description: def.description,
      goal,
      steps: def.steps,
      currentStep: 0,
      completedSteps: [],
      status: 'in-progress',
      createdAt: now,
      updatedAt: now,
    };

    const key = `wf-${workflowId}-${Date.now()}`;
    this.workflows.set(key, workflow);
    return workflow;
  }

  /**
   * Advance to the next step in a workflow.
   */
  next(workflowKey: string): Workflow | null {
    const wf = this.workflows.get(workflowKey);
    if (!wf) return null;
    if (wf.status !== 'in-progress') return null;

    const current = wf.steps[wf.currentStep];
    if (current) {
      wf.completedSteps.push(current.id);
    }

    wf.currentStep++;
    wf.updatedAt = new Date().toISOString();

    if (wf.currentStep >= wf.steps.length) {
      wf.status = 'completed';
    }

    return wf;
  }

  /**
   * Get the current step recommendation.
   */
  getCurrentStep(
    workflowKey: string,
  ): { workflow: Workflow; currentStep: WorkflowStepDef | null; progress: number } | null {
    const wf = this.workflows.get(workflowKey);
    if (!wf) return null;

    const currentStep = wf.currentStep < wf.steps.length ? wf.steps[wf.currentStep] : null;
    const progress = wf.steps.length > 0 ? Math.round((wf.completedSteps.length / wf.steps.length) * 100) : 0;

    return { workflow: wf, currentStep, progress };
  }

  /**
   * Cancel a workflow.
   */
  cancel(workflowKey: string): Workflow | null {
    const wf = this.workflows.get(workflowKey);
    if (!wf) return null;
    wf.status = 'cancelled';
    wf.updatedAt = new Date().toISOString();
    return wf;
  }

  /**
   * List active workflows.
   */
  listActive(): Workflow[] {
    return Array.from(this.workflows.values()).filter((w) => w.status === 'in-progress');
  }

  /**
   * Render workflow list for terminal.
   */
  renderWorkflowList(): string {
    const defs = this.listDefinitions();
    const lines: string[] = ['Available Workflows:'];
    for (const d of defs) {
      lines.push(`  ${d.id.padEnd(12)} ${d.name.padEnd(22)} ${d.steps} steps`);
      lines.push(`  ${''.padEnd(12)} ${d.description}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  /**
   * Get a context-aware recommendation for the next step.
   * Analyzes workspace signals to explain why a step is recommended.
   */
  recommend(session: WorkspaceSession): WorkflowContext {
    const health = session.profile.healthScore;
    const plans = session.profile.risks.length;
    const healthOk = health ? health.overall >= 5 : false;
    const hasRisks = plans > 3;
    const comprehensioned = true;

    // Determine the most valuable next step based on workspace state
    if (!comprehensioned) {
      return {
        reason: 'Repository not yet analyzed.',
        confidence: 0.95,
        factors: ['No workspace analysis found', 'Repository needs initial scan'],
        command: 'vestara open .',
        label: 'Open Repository',
      };
    }

    if (healthOk && !hasRisks) {
      return {
        reason: 'Repository is healthy. Define what you want to build.',
        confidence: 0.88,
        factors: [`Health score: ${health?.overall.toFixed(1)}/10`, 'No critical risks detected'],
        command: 'plan <goal>',
        label: 'Create a Plan',
      };
    }

    if (!healthOk) {
      return {
        reason: `Repository health is ${health?.overall.toFixed(1)}/10. Review risks before planning.`,
        confidence: 0.92,
        factors: [`Health score: ${health?.overall.toFixed(1)}/10`, `${session.profile.risks.length} risks detected`],
        command: 'risks',
        label: 'Review Risks',
      };
    }

    if (hasRisks) {
      return {
        reason: `${session.profile.risks.length} risks detected. Review before planning new work.`,
        confidence: 0.85,
        factors: [`${session.profile.risks.length} risks detected`, 'Risk analysis recommended before planning'],
        command: 'explain risks',
        label: 'Analyze Risks',
      };
    }

    return {
      reason: 'Workspace is ready. What would you like to accomplish?',
      confidence: 0.75,
      factors: ['Workspace analyzed', 'No blocking issues'],
      command: 'help',
      label: 'Explore Commands',
    };
  }

  /**
   * Render workflow status with progress.
   */
  renderWorkflowStatus(wf: Workflow): string {
    const lines: string[] = [];
    lines.push(`${wf.name}: ${wf.goal}`);
    lines.push(`Status: ${wf.status}`);
    lines.push(`Progress: ${wf.completedSteps.length}/${wf.steps.length} steps`);
    lines.push('');

    for (let i = 0; i < wf.steps.length; i++) {
      const step = wf.steps[i];
      const completed = wf.completedSteps.includes(step.id);
      const isCurrent = i === wf.currentStep && wf.status === 'in-progress';
      const icon = completed ? '✓' : isCurrent ? '→' : '·';
      lines.push(`  ${icon} ${step.label}`);
      if (isCurrent) {
        lines.push(`     ${step.description}`);
        lines.push(`     Command: ${step.command}`);
      }
    }

    if (wf.status === 'in-progress') {
      const current = wf.steps[wf.currentStep];
      if (current) {
        lines.push('');
        lines.push(`Next: workflow next ${wf.id}-${Date.now()}`);
      }
    }

    return lines.join('\n');
  }
}
