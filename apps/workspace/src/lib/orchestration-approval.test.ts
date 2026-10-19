import { describe, expect, it } from 'vitest';
import { resolveApprovalGate } from './orchestration-approval';

describe('resolveApprovalGate', () => {
  it('returns the architecture gate while the plan is proposed', () => {
    expect(resolveApprovalGate('architecture')).toMatchObject({
      kind: 'architecture',
      approveLabel: 'Approve architecture',
      rejectLabel: 'Request changes',
    });
  });

  it('returns the director gate once architecture is approved', () => {
    expect(resolveApprovalGate('pending-approval')).toMatchObject({
      kind: 'plan',
      approveLabel: 'Approve plan',
      rejectLabel: 'Reject and cancel',
    });
  });

  it('returns no gate for phases that are not awaiting a human decision', () => {
    for (const phase of ['draft', 'analyzing', 'planning', 'executing', 'verifying', 'completed', 'cancelled', '']) {
      expect(resolveApprovalGate(phase)).toBeNull();
    }
  });
});
