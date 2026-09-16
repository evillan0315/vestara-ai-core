// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CICorrelationDetails,
  CIGitHubConnection,
  CIGitHubStatus,
  CIStatusSeparationNote,
  CIVerificationWaitList,
  CIVestaraVerification,
  CIWebhookHealth,
  correlationFromWait,
  waitToView,
  type CIWaitProjection,
} from '../src/components/ci/index.js';
import { ThemeProvider } from '../src/lib/theme.js';

function renderCI(node: ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

const WAIT: CIWaitProjection = {
  taskId: 'task-ci-1',
  taskSummary: 'CI-UI-003 CI settings surface',
  taskStatus: 'awaiting-verification',
  waitRef: 'ci-corr:vestara-ai-core:abc123:task-ci-1',
  provider: 'github-actions',
  runRef: 'run-98765',
  repository: 'vestara-ai-core',
  commitSha: 'abc1234567890',
  branch: 'main',
  originatingWorkflowRunId: 'wfr-42',
  originatingOperationId: 'op-7',
  suspendedAt: '2026-09-16T00:00:00.000Z',
};

describe('CI integration components', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  it('renders an unconfigured connection as an honest offline state', () => {
    renderCI(<CIGitHubConnection connection={{ status: 'unconfigured', tokenConfigured: false }} />);
    expect(screen.getAllByText('Not configured').length).toBeGreaterThan(0);
    expect(screen.getByText('CI observation is offline')).toBeTruthy();
    expect(screen.getByText('HOLD')).toBeTruthy();
  });

  it('renders configured-but-unverified connectivity distinctly from connected', () => {
    renderCI(<CIGitHubConnection connection={{ status: 'configured', tokenConfigured: true }} />);
    expect(screen.getAllByText('Configured').length).toBeGreaterThan(0);
    expect(screen.getByText('Connectivity not verified')).toBeTruthy();
    expect(screen.queryAllByText('Connected')).toHaveLength(0);
  });

  it('renders a connected/idle connection with no active waits', () => {
    renderCI(
      <>
        <CIGitHubConnection connection={{ status: 'connected', tokenConfigured: true, adapterVersion: '0.1.0' }} />
        <CIVerificationWaitList waits={[]} />
      </>,
    );
    expect(screen.getAllByText('Connected').length).toBeGreaterThan(0);
    expect(screen.getByText('No external-verification waits are recorded.')).toBeTruthy();
  });

  it('renders no-observation, queued and running GitHub CI states', () => {
    const { rerender } = renderCI(<CIGitHubStatus state={{ availability: 'unavailable' }} />);
    expect(screen.getByText('No CI observation is available')).toBeTruthy();

    rerender(
      <ThemeProvider>
        <CIGitHubStatus state={{ availability: 'available', status: 'queued' }} />
      </ThemeProvider>,
    );
    expect(screen.getAllByText('Queued').length).toBeGreaterThan(0);

    rerender(
      <ThemeProvider>
        <CIGitHubStatus state={{ availability: 'available', status: 'running', runId: 'run-1' }} />
      </ThemeProvider>,
    );
    expect(screen.getAllByText('Running').length).toBeGreaterThan(0);
    expect(screen.getByText('No conclusion')).toBeTruthy();
  });

  it('renders CI passed with Vestara verification pending — never verified', () => {
    renderCI(
      <>
        <CIGitHubStatus state={{ availability: 'available', status: 'completed', conclusion: 'passed' }} />
        <CIVestaraVerification
          state={{
            availability: 'available',
            disposition: 'pending-verification',
            action: 'PROCEED_TO_VERIFICATION',
          }}
        />
        <CIStatusSeparationNote githubPassed />
      </>,
    );
    expect(screen.getAllByText('Passed').length).toBeGreaterThan(0);
    expect(screen.getByText('Pending Vestara verification')).toBeTruthy();
    expect(screen.getByText('Proceed to verification')).toBeTruthy();
    expect(screen.getAllByText(/CI PASS ≠ objective verification/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/objective is verified/i)).toBeNull();
  });

  it('renders a failed GitHub run with a HOLD Vestara decision', () => {
    renderCI(
      <>
        <CIGitHubStatus state={{ availability: 'available', status: 'completed', conclusion: 'failed' }} />
        <CIVestaraVerification
          state={{ availability: 'available', disposition: 'hold', action: 'HOLD' }}
        />
      </>,
    );
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('HOLD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('HOLD — decision deferred').length).toBeGreaterThan(0);
  });

  it('renders a running workflow task awaiting verification', () => {
    renderCI(<CIVerificationWaitList waits={[waitToView(WAIT)]} />);
    expect(screen.getByText('awaiting-verification')).toBeTruthy();
    expect(screen.getAllByText(WAIT.waitRef).length).toBeGreaterThan(0);
    expect(screen.getByText('Awaiting verification')).toBeTruthy();
  });

  it('renders a resumed wait with its cited decision reference', () => {
    const resumed: CIWaitProjection = {
      ...WAIT,
      taskStatus: 'in-progress',
      resumedAt: '2026-09-16T00:10:00.000Z',
      decisionRef: 'ciobs-1:PROCEED_TO_VERIFICATION',
    };
    const view = waitToView(resumed);
    renderCI(
      <>
        <CIVerificationWaitList waits={[view]} />
        <CICorrelationDetails correlation={view.correlation} />
      </>,
    );
    expect(screen.getAllByText('Resumed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ciobs-1:PROCEED_TO_VERIFICATION').length).toBeGreaterThan(0);
    expect(screen.getByText('in-progress')).toBeTruthy();
  });

  it('renders webhook health without inferring it from absence', () => {
    const { rerender } = renderCI(<CIWebhookHealth health={{ state: 'unknown' }} />);
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
    expect(screen.getByText(/Absence of a recent delivery/)).toBeTruthy();

    rerender(
      <ThemeProvider>
        <CIWebhookHealth health={{ state: 'configured', detail: 'secret configured' }} />
      </ThemeProvider>,
    );
    expect(screen.getAllByText('Configured').length).toBeGreaterThan(0);

    rerender(
      <ThemeProvider>
        <CIWebhookHealth health={{ state: 'receiving' }} />
      </ThemeProvider>,
    );
    expect(screen.getAllByText('Receiving').length).toBeGreaterThan(0);

    rerender(
      <ThemeProvider>
        <CIWebhookHealth health={{ state: 'error', detail: 'ingress error' }} />
      </ThemeProvider>,
    );
    const panel = screen.getByText('Webhook Ingress').closest('div');
    expect(panel).toBeTruthy();
    expect(within(panel as HTMLElement).getAllByText('Error').length).toBeGreaterThan(0);
  });

  it('renders retrieval failure distinctly from CI failure', () => {
    renderCI(
      <CIGitHubStatus
        state={{
          availability: 'available',
          status: 'completed',
          conclusion: 'unknown',
          retrievalFailure: true,
          retrievalError: 'GitHub API 502',
        }}
      />,
    );
    expect(screen.getByText('Retrieval failure')).toBeTruthy();
    expect(screen.getByText(/retrieval failure, not a CI failure/)).toBeTruthy();
  });

  it('holds unavailable sub-models instead of fabricating state', () => {
    renderCI(
      <>
        <CIGitHubStatus state={{ availability: 'unavailable' }} />
        <CIVestaraVerification state={{ availability: 'unavailable', disposition: 'unavailable' }} />
      </>,
    );
    expect(screen.getByText('No CI observation is available')).toBeTruthy();
    expect(screen.getByText('No Vestara verification decision is available')).toBeTruthy();
  });

  it('keeps correlation free of secret values and uses canonical tokens', () => {
    const { container } = renderCI(<CICorrelationDetails correlation={correlationFromWait(WAIT)} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/ghp_|ghs_|Bearer /);
    expect(container.innerHTML).toContain('var(--vestara-');
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
