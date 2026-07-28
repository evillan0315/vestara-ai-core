import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EventBus } from '@vestara/event-bus';
import { ProductEventTranslator } from '../runtime/product-events';
import type { ProjectPlan } from './project-planner';

export interface WorkflowProgress {
  currentStep: number;
  totalSteps: number;
  stepName: string;
  status: 'running' | 'completed' | 'failed';
}

export class ProjectWorkflow {
  private readonly eventBus?: EventBus;
  private readonly translator?: ProductEventTranslator;

  constructor(opts?: { eventBus?: EventBus; translator?: ProductEventTranslator }) {
    this.eventBus = opts?.eventBus;
    this.translator = opts?.translator;
  }

  async execute(plan: ProjectPlan, workspacePath: string): Promise<WorkflowProgress> {
    const totalSteps = plan.steps.length;

    this.translator?.emit({
      type: 'workflow.started',
      timestamp: new Date().toISOString(),
      payload: { projectName: plan.projectName, totalSteps },
      actor: 'system',
    });

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const currentStep = i + 1;

      const progress: WorkflowProgress = { currentStep, totalSteps, stepName: step.name, status: 'running' };

      this.translator?.emit({
        type: 'workflow.step.changed',
        timestamp: new Date().toISOString(),
        payload: { step: step.id, name: step.name, currentStep, totalSteps },
        actor: 'system',
      });

      await this.executeStep(step.id, plan.projectName, workspacePath);

      void this.eventBus?.emit({
        type: 'workflow:step.completed',
        source: 'project-workflow',
        payload: { stepId: step.id, projectName: plan.projectName },
      });

      progress.status = 'completed';
    }

    this.translator?.emit({
      type: 'workflow.completed',
      timestamp: new Date().toISOString(),
      payload: { projectName: plan.projectName, totalSteps },
      actor: 'system',
    });

    return { currentStep: totalSteps, totalSteps, stepName: 'complete', status: 'completed' };
  }

  private async executeStep(stepId: string, projectName: string, basePath: string): Promise<void> {
    const projectDir = path.join(basePath, projectName);

    switch (stepId) {
      case 'create-workspace': {
        fs.mkdirSync(projectDir, { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'docs'), { recursive: true });
        fs.mkdirSync(path.join(projectDir, '.memory'), { recursive: true });
        break;
      }
      case 'init-repo': {
        fs.writeFileSync(path.join(projectDir, '.gitkeep'), '');
        break;
      }
      case 'create-readme': {
        const readme = `# ${projectName}\n\nCreated with Vestara.\n\n## Getting Started\n\nTODO\n`;
        fs.writeFileSync(path.join(projectDir, 'README.md'), readme);
        break;
      }
      case 'save-memory': {
        const memory = JSON.stringify(
          { project: projectName, createdAt: new Date().toISOString(), status: 'initialized', source: 'EV-001a' },
          null,
          2,
        );
        fs.writeFileSync(path.join(projectDir, '.memory', 'project.json'), memory);
        break;
      }
      case 'complete': {
        const manifest = JSON.stringify(
          { name: projectName, version: '0.1.0', vestara: { workflow: 'project-creation', status: 'completed' } },
          null,
          2,
        );
        fs.writeFileSync(path.join(projectDir, 'vestara.json'), manifest);
        break;
      }
    }
  }
}
