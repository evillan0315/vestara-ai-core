import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QualificationTrials } from '../src/lib/qualification.js';
import { qualificationClient } from '../src/lib/qualification.js';
import { ThemeProvider } from '../src/lib/theme.js';
import Qualification from '../src/pages/Qualification.js';
import QualificationActivity from '../src/pages/QualificationActivity.js';
import QualificationDetail from '../src/pages/QualificationDetail.js';

const mocks = vi.hoisted(() => ({
  trials: vi.fn(),
  trial: vi.fn(),
  run: vi.fn(),
}));

vi.mock('../src/lib/qualification.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/qualification.js')>();
  return {
    ...original,
    qualificationClient: { ...original.qualificationClient, trials: mocks.trials, trial: mocks.trial, run: mocks.run },
  };
});

function trial(profileId: string, modelId: string): QualificationTrials['trials'][number] {
  return {
    profileId,
    outcome: 'awaiting-human-approval',
    credentialResolved: true,
    identity: { providerId: 'opencode-go', modelId, repositorySha: 'sha', contextHash: 'ctx', promptTemplateVersion: 'v1' },
    execution: { callCount: 4, retryCount: 2, totalInputTokens: 5441, totalOutputTokens: 8247, totalDurationMs: 293633, providerStatuses: ['completed'], controls: { status: 'continue', reasons: [] } },
    planner: {
      schemaValidFirstAttempt: false,
      versions: [{ version: 1, planHash: 'a'.repeat(64) }],
      plan: {
        summary: 'Add a read-only worker scheduling status endpoint',
        steps: [{ id: 's1', description: 'Add WorkerSchedulingStatus type', assignedRole: 'engineer', expectedArtifacts: ['type'], verificationRequirements: ['tests'] }],
        affectedPaths: ['packages/workflow-orchestrator/src/distributed/types.ts'],
        outOfScope: ['no lifecycle semantics changes'],
        requiredApprovals: ['api route approval'],
        risks: [],
        completionCriteria: ['tests pass'],
      },
      materialProgress: true,
    },
    reviewer: {
      review: {
        conclusion: 'approved',
        findings: [
          { id: 'f1', severity: 'info', category: 'style', message: 'Route response style', evidenceRefs: ['repo:1'] },
          { id: 'f2', severity: 'blocking', category: 'scope', message: 'External scope approval required', evidenceRefs: ['repo:2'] },
        ],
        evidenceRefs: ['repo:1', 'repo:2'],
      },
      materialProgress: true,
    },
    workflowResult: { conclusion: 'awaiting-human-approval', stoppedBeforeExecution: true, reasons: ['awaiting human plan approval'], evidenceRefs: [] },
    invocations: [
      { role: 'planner', modelId, providerStatus: 'completed', schemaValid: true, retries: 1, inputTokens: 212, outputTokens: 240, materialProgress: true, schemaErrors: [] },
      { role: 'reviewer', modelId, providerStatus: 'completed', schemaValid: true, retries: 1, inputTokens: 180, outputTokens: 120, materialProgress: true, schemaErrors: [] },
    ],
  };
}

const DEEPSEEK = trial('deepseekV4FlashOpenCodeGo', 'deepseek-v4-flash');
const MIMO = trial('mimoV25OpenCodeGo', 'mimo-v2.5');

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/qualification']}>
        <Routes>
          <Route path="/qualification" element={<Qualification />} />
          <Route path="/qualification/:profileId" element={<QualificationDetail />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mocks.trials.mockReset();
  mocks.trial.mockReset();
  mocks.run.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('Qualification page', () => {
  it('renders the trial comparison and selects the first trial', async () => {
    mocks.trials.mockResolvedValue({ repositorySha: 'sha', contextHash: 'ctx', generatedAt: '2026-08-06T00:00:00.000Z', trials: [DEEPSEEK, MIMO] });
    renderPage();

    expect(await screen.findByText('Engineering Qualification')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('deepseek-v4-flash').length).toBeGreaterThan(0));
    expect(screen.getByText('mimo-v2.5')).toBeTruthy();
    // The first trial's detail is shown with the shared workflow header.
    expect((await screen.findAllByText('Add a read-only worker scheduling status endpoint')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Awaiting Human Approval').length).toBeGreaterThan(0);
  });

  it('distinguishes authoritative from observed state and marks execution blocked', async () => {
    mocks.trials.mockResolvedValue({ repositorySha: 'sha', contextHash: 'ctx', generatedAt: '', trials: [DEEPSEEK] });
    renderPage();

    expect(await screen.findByText('Authoritative · Awaiting Human Approval')).toBeTruthy();
    expect(screen.getByText('Observed · Ready to Continue — Applied: No')).toBeTruthy();
    expect(
      screen.getByText('Execution capability is not enabled for this trial — no implementation task can be created.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve for Execution' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows planner plan content and reviewer findings', async () => {
    mocks.trials.mockResolvedValue({ repositorySha: 'sha', contextHash: 'ctx', generatedAt: '', trials: [DEEPSEEK] });
    renderPage();

    expect(await screen.findByText('Add WorkerSchedulingStatus type')).toBeTruthy();
    expect(screen.getByText('packages/workflow-orchestrator/src/distributed/types.ts')).toBeTruthy();
    expect(screen.getByText(/no lifecycle semantics changes/)).toBeTruthy();
    expect(screen.getByText(/Route response style/)).toBeTruthy();
    expect(screen.getByText(/External scope approval required/)).toBeTruthy();
    expect(screen.getAllByText('approved').length).toBeGreaterThan(0);
  });

  it('renders the empty state when no trials exist', async () => {
    mocks.trials.mockResolvedValue({ repositorySha: '', contextHash: '', generatedAt: '', trials: [] });
    renderPage();
    expect(await screen.findByText(/No qualification trials recorded yet/)).toBeTruthy();
  });

  it('renders the reconstructed governed-flow activity timeline', async () => {
    mocks.trials.mockResolvedValue({ repositorySha: 'sha', contextHash: 'ctx', generatedAt: '', trials: [DEEPSEEK] });
    renderPage();

    expect(await screen.findByText('Plan Version 1')).toBeTruthy();
    expect(screen.getAllByText(/Schema retry 1 succeeded/).length).toBeGreaterThan(0);
    expect(screen.getByText('Review conclusion')).toBeTruthy();
    expect(screen.getByText(/Awaiting human approval/)).toBeTruthy();
    expect(screen.getByText(/Blocked — execution capability is not enabled/)).toBeTruthy();
  });

  it('loads a single trial by profile id on the detail route', async () => {
    mocks.trial.mockResolvedValue(MIMO);
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/qualification/mimoV25OpenCodeGo']}>
          <Routes>
            <Route path="/qualification/:profileId" element={<QualificationDetail />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );
    await waitFor(() => expect(mocks.trial).toHaveBeenCalledWith('mimoV25OpenCodeGo'));
    expect(await screen.findByText('mimo-v2.5 / opencode-go')).toBeTruthy();
    expect(screen.getByText('Authoritative · Awaiting Human Approval')).toBeTruthy();
  });

  it('renders the workflow-scoped Activity Room with a role filter', async () => {
    mocks.trial.mockResolvedValue(DEEPSEEK);
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/qualification/deepseekV4FlashOpenCodeGo/activity?agent=reviewer']}>
          <Routes>
            <Route path="/qualification/:profileId/activity" element={<QualificationActivity />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );
    await waitFor(() => expect(mocks.trial).toHaveBeenCalledWith('deepseekV4FlashOpenCodeGo'));
    expect(await screen.findByText('Activity stream')).toBeTruthy();
    expect(screen.getByText('filtered: reviewer')).toBeTruthy();
    expect(screen.getByText(/Reviewer · deepseek-v4-flash/)).toBeTruthy();
    // Advisory messaging controls are disabled.
    const messageAll = screen.getByRole('button', { name: 'Message All Agents' });
    expect(messageAll.hasAttribute('disabled')).toBe(true);
  });

  it('initiates a live trial from the run action and selects the new trial', async () => {
    const oldData = { repositorySha: 's', contextHash: 'c', generatedAt: 'old', trials: [] };
    const newData = { repositorySha: 's', contextHash: 'c', generatedAt: 'new', trials: [DEEPSEEK] };
    let calls = 0;
    mocks.trials.mockImplementation(async () => {
      calls += 1;
      return calls <= 1 ? oldData : newData;
    });
    mocks.run.mockResolvedValue({ started: true, profileId: 'deepseekV4FlashOpenCodeGo' });
    renderPage();

    expect(await screen.findByText(/No qualification trials recorded yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Run deepseekV4FlashOpenCodeGo/ }));
    await waitFor(() => expect(mocks.run).toHaveBeenCalledWith('deepseekV4FlashOpenCodeGo'));
    // Polling detects the new report and selects the trial.
    expect((await screen.findAllByText('Add a read-only worker scheduling status endpoint', {}, { timeout: 8_000 })).length).toBeGreaterThan(0);
  });
});
