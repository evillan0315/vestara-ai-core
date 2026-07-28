import type { PlanningContext } from './planning-context';

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
