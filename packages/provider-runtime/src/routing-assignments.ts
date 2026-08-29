import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  EngineeringAgentRole,
  ProviderModelRef,
  RoutingAssignment,
  RoutingAssignmentStatus,
  RoutingReassignmentRequest,
  RoutingReassignmentResult,
} from './routing-types.js';
import { RoutingAssignmentConflictError } from './routing-types.js';

interface AssignmentFile {
  readonly assignments: readonly RoutingAssignment[];
}

export class FileRoutingAssignmentStore {
  private readonly assignments = new Map<string, RoutingAssignment>();

  constructor(private readonly filePath: string) {
    if (!fs.existsSync(filePath)) return;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as AssignmentFile;
    for (const assignment of parsed.assignments ?? []) this.assignments.set(assignment.taskId, assignment);
  }

  list(): RoutingAssignment[] {
    return [...this.assignments.values()].map((assignment) => structuredClone(assignment));
  }

  get(taskId: string): RoutingAssignment | undefined {
    const assignment = this.assignments.get(taskId);
    return assignment ? structuredClone(assignment) : undefined;
  }

  assign(input: {
    taskId: string;
    role: EngineeringAgentRole;
    agentId: string;
    route: ProviderModelRef;
    assignedByClientId: string;
    now?: Date;
  }): RoutingAssignment {
    if (this.assignments.has(input.taskId)) throw new Error(`Task already has a routing assignment: "${input.taskId}"`);
    const timestamp = (input.now ?? new Date()).toISOString();
    const assignment: RoutingAssignment = {
      taskId: input.taskId,
      revision: 0,
      role: input.role,
      agentId: input.agentId,
      route: structuredClone(input.route),
      status: 'assigned',
      sideEffectsRecorded: false,
      assignedAt: timestamp,
      assignedByClientId: input.assignedByClientId,
      updatedAt: timestamp,
    };
    this.assignments.set(input.taskId, assignment);
    this.persist();
    return structuredClone(assignment);
  }

  updateStatus(
    taskId: string,
    status: RoutingAssignmentStatus,
    expectedRevision: number,
    now = new Date(),
  ): RoutingAssignment {
    return this.update(taskId, expectedRevision, (current) => ({ ...current, status, updatedAt: now.toISOString() }));
  }

  recordSideEffect(taskId: string, expectedRevision: number, now = new Date()): RoutingAssignment {
    return this.update(taskId, expectedRevision, (current) => ({
      ...current,
      sideEffectsRecorded: true,
      updatedAt: now.toISOString(),
    }));
  }

  reassign(request: RoutingReassignmentRequest, now = new Date()): RoutingReassignmentResult {
    const current = this.requireCurrent(request.taskId, request.expectedRevision);
    const active = current.status === 'running' || current.status === 'paused';
    if (active && current.sideEffectsRecorded && !request.approved) {
      const paused = this.update(request.taskId, request.expectedRevision, (assignment) => ({
        ...assignment,
        status: 'paused',
        updatedAt: now.toISOString(),
      }));
      return {
        status: 'approval-required',
        assignment: paused,
        reasonCodes: ['active-task', 'side-effects-recorded', 'explicit-approval-required'],
      };
    }

    const reassigned = this.update(request.taskId, request.expectedRevision, (assignment) => ({
      ...assignment,
      agentId: request.agentId,
      route: structuredClone(request.route),
      status: active ? 'paused' : 'assigned',
      sideEffectsRecorded: active ? assignment.sideEffectsRecorded : false,
      assignedByClientId: request.requestedByClientId,
      updatedAt: now.toISOString(),
      previousAssignment: { agentId: assignment.agentId, route: assignment.route },
    }));
    return {
      status: 'reassigned',
      assignment: reassigned,
      reasonCodes: active ? ['approved-active-task-handoff', 'resume-required'] : ['assignment-updated'],
    };
  }

  private update(
    taskId: string,
    expectedRevision: number,
    mutate: (current: RoutingAssignment) => Omit<RoutingAssignment, 'revision'>,
  ): RoutingAssignment {
    const current = this.requireCurrent(taskId, expectedRevision);
    const updated: RoutingAssignment = { ...mutate(current), revision: current.revision + 1 };
    this.assignments.set(taskId, updated);
    this.persist();
    return structuredClone(updated);
  }

  private requireCurrent(taskId: string, expectedRevision: number): RoutingAssignment {
    const current = this.assignments.get(taskId);
    if (!current) throw new Error(`Routing assignment not found: "${taskId}"`);
    if (current.revision !== expectedRevision) throw new RoutingAssignmentConflictError(expectedRevision, current);
    return current;
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    const file: AssignmentFile = { assignments: this.list() };
    fs.writeFileSync(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}
