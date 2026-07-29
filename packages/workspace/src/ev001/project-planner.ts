export interface PlanningContext {
  request: string;
  workspaceName: string;
  architectureDecisions: string[];
  repositorySummary: string;
  outstandingWork: string[];
  conversationSummary: string;
}

export interface ProjectStep {
  id: string;
  name: string;
  description: string;
}

export interface ProjectPlan {
  projectName: string;
  steps: ProjectStep[];
}

export interface ProjectPlanner {
  createPlan(context: PlanningContext): Promise<ProjectPlan>;
}
