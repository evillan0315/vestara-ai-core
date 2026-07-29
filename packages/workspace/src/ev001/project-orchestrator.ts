import type { MemoryRuntime } from '@vestara/memory';
import { ProductEventTranslator } from '../runtime/product-events';
import { ContextAssembler } from './context-assembler';
import { MemoryContextSource } from './planning-context';
import type { PlanningContext, ProjectPlanner } from './project-planner';
import { ProjectWorkflow } from './project-workflow';

export interface CreateProjectResult {
  projectName: string;
  stepsCompleted: number;
  duration: number;
}

export class ProjectOrchestrator {
  private readonly planner: ProjectPlanner;
  private readonly workflow: ProjectWorkflow;
  private readonly translator: ProductEventTranslator;
  private readonly assembler: ContextAssembler;
  private readonly memorySource?: MemoryContextSource;

  constructor(planner: ProjectPlanner, opts?: { translator?: ProductEventTranslator; memory?: MemoryRuntime }) {
    this.planner = planner;
    this.translator = opts?.translator ?? new ProductEventTranslator();
    this.assembler = new ContextAssembler();
    this.workflow = new ProjectWorkflow({ translator: this.translator });

    if (opts?.memory) {
      this.memorySource = new MemoryContextSource(opts.memory);
      this.assembler.add(this.memorySource);
    }
  }

  addSource(source: import('./context-assembler').ContextSource): void {
    this.assembler.add(source);
  }

  async createProject(request: string, workspacePath: string, userId = 'local'): Promise<CreateProjectResult> {
    const startTime = performance.now();
    const workspaceName = request.replace(/\s+/g, '-').toLowerCase();

    const context = await this.assembler.assemble(request, workspaceName, workspacePath, userId);
    const plan = await this.planner.createPlan(context);
    const progress = await this.workflow.execute(plan, workspacePath);
    const duration = Math.round(performance.now() - startTime);

    await this.memorySource?.saveDecision(
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
}
