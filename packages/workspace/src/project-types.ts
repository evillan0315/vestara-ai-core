export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type ProjectTaskStatus = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type ProjectTaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type SprintStatus = 'planning' | 'active' | 'completed';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectTaskPriority;
  leadAgentId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  sprintId?: string;
  title: string;
  description: string;
  status: ProjectTaskStatus;
  priority: ProjectTaskPriority;
  assigneeAgentId?: string;
  dependsOn: string[];
  labels: string[];
  estimatedHours?: number;
  actualHours?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  status: SprintStatus;
  startDate: string;
  endDate: string;
  createdAt: string;
  completedAt?: string;
}
