export interface ProjectData {
  id: string;
  name: string;
  description: string;
  status: string;
  priority: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  stats?: { total: number; done: number; inProgress: number; backlog: number };
}
export interface TaskData {
  id: string;
  projectId: string;
  sprintId?: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
}
export interface SprintData {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  status: string;
  startDate: string;
  endDate: string;
}
