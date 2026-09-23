/**
 * AR-COORD-HUMAN-WAIT-001 — Workflow decision waits.
 *
 * This is the workflow-specific adapter between the workflow authority and
 * the producer-neutral StructuredInteraction system. It owns no interaction
 * persistence and Activity Room owns no workflow continuation.
 */

import type { EventBus } from '@vestara/event-bus';
import type { InteractionService } from '@vestara/interaction-app';
import type { VestaraEvent } from '@vestara/shared';
import type { ChoiceId, InteractionId, StructuredInteraction } from '@vestara/types';
import type { WorkflowOrchestrator, WorkflowTask } from '@vestara/workflow-orchestrator';

export const WORKFLOW_APPROVE_CHOICE = 'workflow.approve';
export const WORKFLOW_REQUEST_CHANGES_CHOICE = 'workflow.request-changes';

const PREFIX = 'workflow-approval:';

export interface WorkflowDecisionInteractionBridgeOptions {
  readonly eventBus: EventBus;
  readonly interactionService: InteractionService;
  readonly workflow: WorkflowOrchestrator;
  readonly workspaceId: string;
  readonly resolveParticipantName?: (agentId: string) => Promise<string | undefined>;
  readonly logger?: { warn(message: string): void; info(message: string): void };
}

interface ApprovalIdentity {
  readonly projectId: string;
  readonly taskId: string;
  readonly revision: number;
}

function encodePart(value: string): string {
  return encodeURIComponent(value);
}

function decodePart(value: string): string {
  return decodeURIComponent(value);
}

export function workflowApprovalInteractionId(projectId: string, taskId: string, revision: number): string {
  return `${PREFIX}${encodePart(projectId)}:${encodePart(taskId)}:${revision}`;
}

export function parseWorkflowApprovalInteractionId(interactionId: string): ApprovalIdentity | undefined {
  if (!interactionId.startsWith(PREFIX)) return undefined;
  const parts = interactionId.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return undefined;
  const revision = Number(parts[2]);
  if (!Number.isInteger(revision) || revision < 0) return undefined;
  try {
    return { projectId: decodePart(parts[0]), taskId: decodePart(parts[1]), revision };
  } catch {
    return undefined;
  }
}

function taskForApproval(tasks: readonly WorkflowTask[], identity: ApprovalIdentity): WorkflowTask | undefined {
  return tasks.find(
    (task) =>
      task.id === identity.taskId && task.status === 'awaiting-approval' && task.revisionCount === identity.revision,
  );
}

export function createWorkflowDecisionInteractionBridge(options: WorkflowDecisionInteractionBridgeOptions): {
  dispose: () => void;
} {
  const onApprovalRequested = async (event: VestaraEvent): Promise<void> => {
    const projectId = typeof event.payload.projectId === 'string' ? event.payload.projectId : undefined;
    const taskId = typeof event.payload.taskId === 'string' ? event.payload.taskId : undefined;
    if (!projectId || !taskId) return;
    await presentPendingApproval(projectId, taskId);
  };

  const onInteractionResponded = async (event: VestaraEvent): Promise<void> => {
    const interactionId = typeof event.payload.interactionId === 'string' ? event.payload.interactionId : undefined;
    if (!interactionId) return;
    const identity = parseWorkflowApprovalInteractionId(interactionId);
    if (!identity) return;

    const persisted = await options.interactionService.getResponse(interactionId as InteractionId);
    if (!persisted) return;
    const tasks = await options.workflow.pendingApprovals(identity.projectId);
    const task = taskForApproval(tasks, identity);
    if (!task || task.approvalInteractionId !== interactionId) return;

    if (persisted.response.selectedChoiceId === WORKFLOW_APPROVE_CHOICE) {
      const snapshot = await options.workflow.resolveTaskApproval(identity.projectId, identity.taskId, true);
      if (snapshot.phase === 'executing') {
        void options.workflow
          .runExecution(identity.projectId)
          .catch((error) =>
            options.logger?.warn(
              `workflow approval continuation failed: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
      }
      return;
    }
    if (persisted.response.selectedChoiceId === WORKFLOW_REQUEST_CHANGES_CHOICE) {
      const snapshot = await options.workflow.requestTaskChanges(identity.projectId, identity.taskId);
      if (snapshot.phase === 'executing') {
        void options.workflow
          .runExecution(identity.projectId)
          .catch((error) =>
            options.logger?.warn(
              `workflow revision continuation failed: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
      }
    }
  };

  const unsubscribeApproval = options.eventBus.subscribe('orchestration.task.approval-requested', (event) =>
    onApprovalRequested(event).catch((error) =>
      options.logger?.warn(
        `workflow approval presentation failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    ),
  );
  const unsubscribeResponse = options.eventBus.subscribe('interaction:responded', (event) =>
    onInteractionResponded(event).catch((error) =>
      options.logger?.warn(
        `workflow approval response failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    ),
  );

  const presentPendingApproval = async (projectId: string, taskId: string): Promise<void> => {
    const tasks = await options.workflow.pendingApprovals(projectId);
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;

    const interactionId =
      task.approvalInteractionId ?? workflowApprovalInteractionId(projectId, task.id, task.revisionCount);
    if (!task.approvalInteractionId) {
      await options.workflow.attachTaskApprovalInteraction(projectId, task.id, interactionId);
    }

    const existing = await options.interactionService.getInteraction(interactionId as InteractionId);
    if (existing?.interaction) return;

    const presentingParticipantId = task.assignedAgentId ?? 'agent-planner';
    const presentingParticipantName =
      (await options.resolveParticipantName?.(presentingParticipantId)) ??
      (presentingParticipantId === 'agent-planner' ? 'Planner' : presentingParticipantId);
    const reason = task.approvalReason?.trim() || 'Reason unavailable';
    const interaction: StructuredInteraction = {
      interactionId: interactionId as InteractionId,
      presentingParticipantId,
      presentingParticipantName,
      createdAt: new Date().toISOString(),
      content: `Awaiting Director approval\n${reason}`,
      choices: [
        { choiceId: WORKFLOW_APPROVE_CHOICE as ChoiceId, label: 'Approve' },
        { choiceId: WORKFLOW_REQUEST_CHANGES_CHOICE as ChoiceId, label: 'Request Changes' },
      ],
    };
    await options.interactionService.present(interaction, {
      workflowRunId: projectId,
      taskId: task.id,
      correlationId: interactionId,
    });
    options.logger?.info(`presented workflow decision wait ${interactionId}`);
  };

  void options.workflow
    .listProjects(options.workspaceId)
    .then(async (projects) => {
      for (const project of projects) {
        for (const task of await options.workflow.pendingApprovals(project.id)) {
          await presentPendingApproval(project.id, task.id);
        }
      }
    })
    .catch((error) =>
      options.logger?.warn(
        `workflow approval reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );

  return {
    dispose() {
      unsubscribeApproval();
      unsubscribeResponse();
    },
  };
}
