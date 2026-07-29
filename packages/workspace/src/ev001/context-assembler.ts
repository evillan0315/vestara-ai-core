import type { PlanningContext } from './project-planner';

export type ContextContribution = Partial<PlanningContext>;

export interface ContextSource {
  readonly name: string;
  contribute(
    request: string,
    workspaceName: string,
    workspacePath: string,
    userId: string,
  ): Promise<ContextContribution>;
}

export class ContextAssembler {
  private readonly sources: ContextSource[] = [];

  add(source: ContextSource): void {
    this.sources.push(source);
  }

  async assemble(
    request: string,
    workspaceName: string,
    workspacePath: string,
    userId: string,
  ): Promise<PlanningContext> {
    const base: PlanningContext = {
      request,
      workspaceName,
      architectureDecisions: [],
      repositorySummary: '',
      outstandingWork: [],
      conversationSummary: '',
    };

    for (const source of this.sources) {
      try {
        const contribution = await source.contribute(request, workspaceName, workspacePath, userId);
        base.architectureDecisions.push(...(contribution.architectureDecisions ?? []));
        base.outstandingWork.push(...(contribution.outstandingWork ?? []));
        if (contribution.repositorySummary) base.repositorySummary = contribution.repositorySummary;
        if (contribution.conversationSummary) base.conversationSummary = contribution.conversationSummary;
      } catch {
        // Source failed silently — other sources still contribute
      }
    }

    return base;
  }
}
