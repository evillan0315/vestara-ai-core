import type { ProjectPlanner } from './project-planner';
import { ProjectWorkflow } from './project-workflow';
import { ProductEventTranslator } from '../runtime/product-events';
import type { PlanningContext } from './planning-context';
import { MemoryContextService } from './planning-context';
import type { MemoryRuntime } from '@vestara/memory';

export interface CreateProjectResult {
  projectName: string;
  stepsCompleted: number;
  duration: number;
}

export class ProjectOrchestrator {
  private readonly planner: ProjectPlanner;
  private readonly workflow: ProjectWorkflow;
  private readonly translator: ProductEventTranslator;
  private readonly memoryContext?: MemoryContextService;

  constructor(
    planner: ProjectPlanner,
    opts?: { translator?: ProductEventTranslator; memory?: MemoryRuntime },
  ) {
    this.planner = planner;
    this.translator = opts?.translator ?? new ProductEventTranslator();
    this.memoryContext = opts?.memory ? new MemoryContextService(opts.memory) : undefined;
    this.workflow = new ProjectWorkflow({ translator: this.translator });
  }

  async createProject(
    request: string,
    workspacePath: string,
    userId = 'local',
  ): Promise<CreateProjectResult> {
    const startTime = performance.now();
    const workspaceName = request.replace(/\s+/g, '-').toLowerCase();

    const context = this.memoryContext
      ? await this.memoryContext.assemble(request, workspaceName, userId)
      : this.emptyContext(request, workspaceName);

    const plan = await this.planner.createPlan(context);
    const progress = await this.workflow.execute(plan, workspacePath);
    const duration = Math.round(performance.now() - startTime);

    await this.memoryContext?.saveDecision(
      userId,
      workspaceName,
      `Created project ${workspaceName} — ${plan.steps.length} steps completed`,
    );

    this.translator.emit({
      type: 'project.completed',
      timestamp: new Date().toISOString(),
      payload: { projectName: plan.projectName, stepsCompleted: progress.totalSteps, duration },
      actor: 'system',
    });

    return { projectName: plan.projectName, stepsCompleted: progress.totalSteps, duration };
  }

  private emptyContext(request: string, workspaceName: string): PlanningContext {
    return {
      request,
      workspaceName,
      architectureDecisions: [],
      repositorySummary: '',
      outstandingWork: [],
      conversationSummary: '',
    };
  }
}
