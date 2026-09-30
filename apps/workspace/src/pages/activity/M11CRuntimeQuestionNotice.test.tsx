/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PendingRuntimeQuestionProjection } from '@vestara/activity-room';
import M11CRuntimeQuestionNotice from './M11CRuntimeQuestionNotice';

const question: PendingRuntimeQuestionProjection = {
  interactionId: 'rq-ui-test',
  conversationId: 'conversation-ui-test',
  openCodeSessionId: 'session-ui-test',
  openCodeRequestId: 'request-ui-test',
  status: 'pending',
  questions: [
    {
      header: 'AR-LAYOUT-001',
      question: 'How should I proceed?',
      options: [{ label: 'Gap analysis only', description: 'Do not implement.' }],
    },
  ],
  expiresAt: '2026-09-27T12:10:00.000Z',
  createdAt: '2026-09-27T12:00:00.000Z',
  updatedAt: '2026-09-27T12:00:00.000Z',
};

describe('M11CRuntimeQuestionNotice', () => {
  it('presents structured pending question data without response controls', () => {
    render(<M11CRuntimeQuestionNotice questions={[question]} />);

    expect(screen.getByText('Waiting for your response')).toBeTruthy();
    expect(screen.getByText('AR-LAYOUT-001')).toBeTruthy();
    expect(screen.getByText('How should I proceed?')).toBeTruthy();
    expect(screen.getByText('Gap analysis only')).toBeTruthy();
    expect(screen.getByText('Do not implement.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders no surface when there is no active authoritative question', () => {
    const { container } = render(<M11CRuntimeQuestionNotice questions={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
