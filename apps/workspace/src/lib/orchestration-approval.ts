/**
 * Approval-gate model for the Orchestration (Workflows) inspector.
 *
 * Pure and side-effect free: maps a project phase to the human decision that
 * unlocks the next transition. Endpoint wiring stays in the page.
 *
 * Transitions (PCS-025 §7.1):
 *   architecture     --approve--> pending-approval
 *   architecture     --reject --> planning (plan needs-revision)
 *   pending-approval --approve--> executing
 *   pending-approval --reject --> cancelled (terminal)
 */

export type ApprovalGateKind = 'architecture' | 'plan';

export interface ApprovalGate {
  kind: ApprovalGateKind;
  title: string;
  detail: string;
  approveLabel: string;
  rejectLabel: string;
  rejectConsequence: string;
}

export function resolveApprovalGate(phase: string): ApprovalGate | null {
  switch (phase) {
    case 'architecture':
      return {
        kind: 'architecture',
        title: 'Architecture review',
        detail:
          'The plan is proposed. Approve the architecture to move it to director approval, or request changes to return it to planning.',
        approveLabel: 'Approve architecture',
        rejectLabel: 'Request changes',
        rejectConsequence:
          'Requesting changes marks the plan as needs-revision and moves the project back to planning.',
      };
    case 'pending-approval':
      return {
        kind: 'plan',
        title: 'Director approval',
        detail:
          'Architecture is approved. Approving starts execution; rejecting cancels the workflow.',
        approveLabel: 'Approve plan',
        rejectLabel: 'Reject and cancel',
        rejectConsequence:
          'Rejecting cancels the project. Cancellation is terminal — the workflow cannot be resumed.',
      };
    default:
      return null;
  }
}
