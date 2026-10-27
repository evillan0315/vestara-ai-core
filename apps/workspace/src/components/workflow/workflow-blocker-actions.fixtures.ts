/**
 * WorkflowBlockerActions fixtures — typed local mock data for tests and
 * offline preview. Never inline task arrays in JSX; import from here.
 */

export interface BlockedTaskFixture {
  projectId: string;
  taskId: string;
  taskSummary: string;
  taskStatus: string;
}

export const BLOCKED_TASK_FIXTURE: BlockedTaskFixture = {
  projectId: 'project-1793051572452-1',
  taskId: 'task-1793051589019-2',
  taskSummary: 'Extract the identified sub-components and move co-located state',
  taskStatus: 'blocked',
};

export const FAILED_TASK_FIXTURE: BlockedTaskFixture = {
  projectId: 'project-1793051572452-1',
  taskId: 'task-1793051589019-9',
  taskSummary: 'Verify behavior is unchanged and the acceptance boundary holds',
  taskStatus: 'failed',
};

export function retryCommandFixture(projectId: string, taskId: string): string {
  return `curl -X POST '/api/orchestration/projects/${projectId}/tasks/${taskId}/retry' -H 'Content-Type: application/json' -d '{"reason":"manual retry from Orchestration UI"}'`;
}
