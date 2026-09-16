import { expect, type Page, test } from '@playwright/test';

/**
 * CI-UI-003 visual coverage — Settings → Integrations → Continuous Integration.
 *
 * Mocks the provider-neutral CI read model (`/api/ci/status`) so the surface is
 * deterministic. Follows the same capture convention as `settings-matrix`.
 */

const CI_STATUS = {
  provider: 'github-actions',
  generatedAt: '2026-09-16T00:00:00.000Z',
  availability: {
    connection: 'available',
    observation: 'available',
    verification: 'available',
    webhookHealth: 'available',
    correlation: 'available',
  },
  connection: {
    provider: 'github-actions',
    status: 'connected',
    credentialConfigured: true,
    webhookConfigured: true,
    adapterVersion: '0.1.0',
    repositories: ['evillan0315/vestara-ai-core'],
    connectivity: {
      state: 'connected',
      checkedAt: '2026-09-16T00:00:00.000Z',
      repository: 'evillan0315/vestara-ai-core',
    },
  },
  observation: {
    availability: 'available',
    status: 'completed',
    conclusion: 'passed',
    runId: 'run-35031683683',
    commitSha: '598d416bd5998f375f70e43bae81cc8405633006',
    observedAt: '2026-09-16T00:00:00.000Z',
    passedChecks: 3,
    failedChecks: 0,
    skippedChecks: 0,
    trigger: 'webhook',
  },
  verification: {
    availability: 'available',
    verdict: 'hold',
    classification: 'UNKNOWN',
    action: 'PROCEED_TO_VERIFICATION',
    confidence: 'low',
    decisionRef: 'obs-1:PROCEED_TO_VERIFICATION',
    decidedAt: '2026-09-16T00:00:00.000Z',
    observationId: 'obs-1',
  },
  webhookHealth: { state: 'receiving', lastDeliveryAt: '2026-09-16T00:00:00.000Z', detail: 'Recent webhook deliveries received' },
  correlation: {
    availability: 'available',
    staleCount: 0,
    waits: [
      {
        taskId: 'task-ci-1',
        taskSummary: 'CI-UI-003 CI settings surface',
        taskStatus: 'awaiting-verification',
        provider: 'github-actions',
        repository: 'evillan0315/vestara-ai-core',
        branch: 'vestara/task-1',
        commitSha: '598d416bd5998f375f70e43bae81cc8405633006',
        waitRef: 'ci-corr:evillan0315/vestara-ai-core:598d416:task-ci-1',
        runRef: 'run-35031683683',
        suspendedAt: '2026-09-16T00:00:00.000Z',
        deadline: { state: 'active', deadlineMs: 2700000, ageMs: 60000, reason: 'Unresolved but within the deadline' },
      },
    ],
  },
  notifications: {
    availability: 'available',
    items: [
      {
        notificationId: 'obs-1:all-required-checks-passed',
        kind: 'all-required-checks-passed',
        severity: 'info',
        title: 'CI passed',
        body: 'GitHub CI passed. This proceeds to Vestara verification.',
        observationId: 'obs-1',
        commitSha: '598d416bd5998f375f70e43bae81cc8405633006',
        at: '2026-09-16T00:00:00.000Z',
      },
    ],
  },
};

async function mockApis(page: Page): Promise<void> {
  await page.route('**/api/settings', (route) =>
    route.fulfill({
      json: {
        workspaceId: 'visual-workspace',
        revision: 'visual-1',
        generatedAt: '2026-08-01T00:00:00.000Z',
        userConfigPath: '/user/config.json',
        workspaceConfigPath: '/workspace/.vestara/config.json',
        overrideCount: 0,
        settings: [
          {
            key: 'general.workspaceName',
            section: 'general',
            value: 'Vestara Workspace',
            source: 'default',
            inherited: true,
            sensitive: false,
          },
        ],
      },
    }),
  );
  await page.route('**/api/runtime/status', (route) =>
    route.fulfill({
      json: {
        status: 'ready',
        apiEndpoint: 'http://127.0.0.1:3001',
        websocketEndpoint: 'ws://127.0.0.1:3001/ws',
        websocketStatus: 'available',
        runtimeVersion: '0.3.0',
        workspaceId: 'visual-workspace',
        currentSession: 'visual-workspace',
        activeExecutionCount: 0,
        eventBusStatus: 'running',
        engineeringGraphStatus: 'healthy',
        engineeringEventStoreStatus: 'running',
        engineeringEventCount: 4117,
        filesystemRuntimeStatus: 'available',
        verificationRuntimeStatus: 'running',
        telemetryStatus: 'running',
      },
    }),
  );
  await page.route('**/api/cli/status', (route) =>
    route.fulfill({
      json: {
        detected: true,
        executablePath: '/workspace/apps/cli/dist/index.js',
        cliVersion: '0.3.0',
        runtimeVersion: '0.3.0',
        compatible: true,
        runtimeConnected: true,
        connectionEvidence: 'Connected to active runtime.',
        workspaceId: 'visual-workspace',
        connectedWorkspace: '/workspace',
        runtimeEndpoint: 'http://127.0.0.1:3001',
        authenticationStatus: 'local-session',
        localSocketPath: '/tmp/vestara.sock',
        localSocketAvailable: true,
        transport: 'unix-socket',
        configurationSynchronized: true,
      },
    }),
  );
  await page.route('**/api/graph/store', (route) =>
    route.fulfill({
      json: {
        persistence: 'sqlite',
        eventCount: 4117,
        latestSequence: 4117,
        oldestRetainedAt: '2026-07-01T00:00:00.000Z',
        checkpointCount: 8,
        checkpointInterval: 500,
        checkpointRetention: 10,
        eventSchemaVersion: 1,
        workspaceStoreIdentity: 'visual-workspace',
      },
    }),
  );
  await page.route('**/api/ci/status', (route) => route.fulfill({ json: CI_STATUS }));
}

async function openCI(page: Page): Promise<void> {
  await mockApis(page);
  await page.goto('/settings/ci');
  await expect(page.getByRole('heading', { name: 'GitHub Connection' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Continuous Integration' }).first()).toBeVisible();
}

async function attachScreenshot(page: Page, name: string): Promise<void> {
  await test.info().attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
}

test('settings ci dark', async ({ page }) => {
  await openCI(page);
  await page.evaluate(() => {
    localStorage.setItem('vestara-theme', 'dark');
    localStorage.setItem('vestara-theme-profile', 'default');
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'GitHub Connection' })).toBeVisible();
  await expect(page.getByText('Pending Vestara verification', { exact: true })).toBeVisible();
  await attachScreenshot(page, 'settings-ci-dark');
});

test('settings ci light', async ({ page }) => {
  await openCI(page);
  await page.evaluate(() => {
    localStorage.setItem('vestara-theme', 'light');
    localStorage.setItem('vestara-theme-profile', 'default');
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'GitHub Connection' })).toBeVisible();
  await expect(page.getByText('Pending Vestara verification', { exact: true })).toBeVisible();
  await attachScreenshot(page, 'settings-ci-light');
});

test('settings ci narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCI(page);
  await attachScreenshot(page, 'settings-ci-mobile');
});
