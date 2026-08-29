import { expect, type Page, test } from '@playwright/test';

const profiles = ['Default', 'Minimal', 'Presentation', 'Accessibility'] as const;
const accents = ['Vestara Gold', 'Amber', 'Emerald', 'Blue', 'Violet', 'Rose', 'Teal', 'Neutral', 'Orange'] as const;
const modes = ['dark', 'light', 'system'] as const;

async function mockSettingsApi(page: Page): Promise<void> {
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
          {
            key: 'providers.defaultProvider',
            section: 'providers',
            value: 'opencode',
            source: 'default',
            inherited: true,
            sensitive: false,
          },
          {
            key: 'filesystem.dryRun',
            section: 'filesystem',
            value: true,
            source: 'default',
            inherited: true,
            sensitive: false,
          },
          {
            key: 'verification.profile',
            section: 'verification',
            value: 'standard',
            source: 'default',
            inherited: true,
            sensitive: false,
          },
          {
            key: 'telemetry.level',
            section: 'telemetry',
            value: 'detailed',
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
}

async function openGeneral(page: Page): Promise<void> {
  await mockSettingsApi(page);
  await page.goto('/settings/general');
  await expect(page.getByRole('heading', { name: 'Workspace Profile' })).toBeVisible();
}

async function attachScreenshot(page: Page, name: string): Promise<void> {
  await test.info().attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
}

for (const mode of modes) {
  test(`settings theme mode: ${mode}`, async ({ page }) => {
    await openGeneral(page);
    await page.getByRole('button', { name: mode, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'system' ? /dark|light/ : mode);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('vestara-theme'))).toBe(mode);
    await attachScreenshot(page, `settings-mode-${mode}`);
  });
}

for (const profile of profiles) {
  test(`settings workspace profile: ${profile}`, async ({ page }) => {
    await openGeneral(page);
    const control = page.getByRole('button', { name: new RegExp(profile, 'i') }).last();
    await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('vestara-theme-profile')))
      .toBe(profile.toLowerCase());
    await attachScreenshot(page, `settings-profile-${profile.toLowerCase()}`);
  });
}

for (const accent of accents) {
  test(`settings accent palette: ${accent}`, async ({ page }) => {
    await openGeneral(page);
    const control = page.getByRole('button', { name: accent, exact: true });
    await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('vestara-theme-settings') ?? '{}').colorTheme,
    );
    expect(stored).toBe(accent === 'Vestara Gold' ? 'gold' : accent.toLowerCase());
    await attachScreenshot(page, `settings-accent-${String(stored)}`);
  });
}

test('settings keyboard focus and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGeneral(page);
  await page.getByLabel('Search settings').first().focus();
  await expect(page.getByLabel('Search settings').first()).toBeFocused();
  const duration = await page
    .getByLabel('Search settings')
    .first()
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(['0s', '0.00001s', '1e-05s']).toContain(duration);
  await attachScreenshot(page, 'settings-keyboard-focus-reduced-motion');
});

test('settings narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGeneral(page);
  await expect(page.getByText('Settings navigation')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Settings sections' }).first()).toBeHidden();
  await attachScreenshot(page, 'settings-mobile-general');
});
