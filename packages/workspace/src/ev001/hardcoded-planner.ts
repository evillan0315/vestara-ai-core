import type { EventBus } from '@vestara/event-bus';
import type { ProductEventTranslator } from '../runtime/product-events';
import type { PlanningContext, ProjectPlan, ProjectPlanner, ProjectStep } from './project-planner';

const DEFAULT_STEPS: ProjectStep[] = [
  { id: 'create-workspace', name: 'Create workspace', description: 'Setting up project directory structure' },
  { id: 'init-repo', name: 'Initialize repository', description: 'Creating git repository' },
  { id: 'create-readme', name: 'Create README', description: 'Writing project README' },
  { id: 'save-memory', name: 'Save project memory', description: 'Persisting project context and decisions' },
  { id: 'complete', name: 'Complete', description: 'Finalizing project creation' },
];

const CONTINUE_STEPS: ProjectStep[] = [
  { id: 'restore-context', name: 'Restore workspace context', description: 'Loading previous workspace state' },
  {
    id: 'review-decisions',
    name: 'Review architecture decisions',
    description: 'Checking previously recorded decisions',
  },
  { id: 'assess-progress', name: 'Assess outstanding work', description: 'Determining next steps from project state' },
  { id: 'plan-next', name: 'Plan next milestone', description: 'Creating execution plan for next milestone' },
  { id: 'save-memory', name: 'Save updated context', description: 'Persisting updated project context' },
];

export class HardcodedProjectPlanner implements ProjectPlanner {
  private readonly eventBus?: EventBus;
  private readonly translator?: ProductEventTranslator;

  constructor(opts?: { eventBus?: EventBus; translator?: ProductEventTranslator }) {
    this.eventBus = opts?.eventBus;
    this.translator = opts?.translator;
  }

  async createPlan(context: PlanningContext): Promise<ProjectPlan> {
    const isResume = context.architectureDecisions.length > 0 || context.outstandingWork.length > 0;
    const steps = isResume ? CONTINUE_STEPS : DEFAULT_STEPS;
    const projectName = context.workspaceName || context.request;

    const plan: ProjectPlan = {
      projectName,
      steps: steps.map((s) => ({ ...s })),
    };

    this.translator?.emit({
      type: 'project.started',
      timestamp: new Date().toISOString(),
      payload: { projectName, stepCount: plan.steps.length, resumed: isResume },
      actor: 'system',
    });

    void this.eventBus?.emit({
      type: 'project:plan.created',
      source: 'project-planner',
      payload: { projectName, steps: plan.steps.length, resumed: isResume },
    });

    return plan;
  }
}
