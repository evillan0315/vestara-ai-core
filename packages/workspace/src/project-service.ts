import type { EventBus } from '@vestara/event-bus';
import type { ProjectStorage } from './project-storage';
import type { Project, ProjectTask, ProjectTaskStatus, Sprint } from './project-types';

export class ProjectService {
  readonly id = 'vestara-projects';
  private storage: ProjectStorage;
  private eventBus?: EventBus;

  constructor(opts: { storage: ProjectStorage; eventBus?: EventBus }) {
    this.storage = opts.storage;
    this.eventBus = opts.eventBus;
  }

  async createProject(name: string, description?: string): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: `proj-${Date.now()}`,
      name,
      description: description ?? '',
      status: 'planning',
      priority: 'medium',
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.storage.saveProject(project);
    await this.eventBus?.emit({
      type: 'project:created',
      source: 'project-service',
      payload: { projectId: project.id, name: project.name },
      metadata: { correlationId: project.id },
    });
    return project;
  }

  async listProjects(): Promise<Project[]> {
    return this.storage.listProjects();
  }
  async getProject(id: string): Promise<Project | null> {
    return this.storage.getProject(id);
  }
  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const existing = await this.storage.getProject(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
    await this.storage.saveProject(updated);
    return updated;
  }

  async createTask(
    projectId: string,
    title: string,
    opts?: { description?: string; priority?: string; sprintId?: string },
  ): Promise<ProjectTask> {
    const now = new Date().toISOString();
    const task: ProjectTask = {
      id: `task-${Date.now()}`,
      projectId,
      title,
      description: opts?.description ?? '',
      status: 'backlog',
      priority: (opts?.priority as any) ?? 'medium',
      sprintId: opts?.sprintId,
      dependsOn: [],
      labels: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.storage.saveTask(task);
    await this.eventBus?.emit({
      type: 'task:created',
      source: 'project-service',
      payload: { taskId: task.id, projectId, title },
      metadata: { correlationId: task.id },
    });
    return task;
  }

  async listTasks(projectId?: string, sprintId?: string): Promise<ProjectTask[]> {
    return this.storage.listTasks(projectId, sprintId);
  }
  async updateTaskStatus(taskId: string, status: ProjectTaskStatus): Promise<void> {
    await this.storage.updateTaskStatus(taskId, status);
  }

  async createSprint(projectId: string, name: string, startDate: string, endDate: string): Promise<Sprint> {
    const now = new Date().toISOString();
    const sprint: Sprint = {
      id: `sprint-${Date.now()}`,
      projectId,
      name,
      goal: '',
      status: 'planning',
      startDate,
      endDate,
      createdAt: now,
    };
    await this.storage.saveSprint(sprint);
    return sprint;
  }

  async listSprints(projectId?: string): Promise<Sprint[]> {
    return this.storage.listSprints(projectId);
  }
  async getProjectStats(projectId: string) {
    return this.storage.getProjectStats(projectId);
  }
}
