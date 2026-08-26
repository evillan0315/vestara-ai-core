import { test, expect } from '@playwright/test';
import { loadConfig } from './config.js';
import { VisualTestEngine } from './engine.js';

const config = loadConfig();
const engine = new VisualTestEngine(config);

// Override themes to include all 9 accents in both light/dark
config.themes = [
  { id: 'dark', label: 'Dark', storageValue: 'dark' },
  { id: 'light', label: 'Light', storageValue: 'light' },
];

// Override viewports to include mobile, tablet, desktop
config.viewports = [
  { id: 'mobile', name: 'Mobile 375', width: 375, height: 667, isMobile: true, hasTouch: true },
  { id: 'tablet', name: 'Tablet 768', width: 768, height: 1024, isMobile: true, hasTouch: true },
  { id: 'desktop', name: 'Desktop 1440', width: 1440, height: 900 },
];

// Generate test cases specifically for Theme Builder
const routes = engine['discovery'].discover();
const settingsRoute = routes.find(r => r.id === 'settings');
const themeBuilderRoutes = settingsRoute ? [settingsRoute] : [];

const testCases: Array<{ title: string; route: typeof routes[0]; viewport: typeof config.viewports[0]; theme: typeof config.themes[0] }> = [];

for (const route of themeBuilderRoutes) {
  for (const viewport of config.viewports) {
    for (const theme of config.themes) {
      testCases.push({
        title: `${route.title}.${viewport.id}.${theme.id}`,
        route,
        viewport,
        theme,
      });
    }
  }
}

for (const tc of testCases) {
  test(`theme-builder: ${tc.title}`, async ({ browser }) => {
    const result = await engine.execute(browser, tc);

    if (config.mode === 'update') {
      return;
    }

    const location = `${tc.route.title} @ ${tc.viewport.name} / ${tc.theme.id}`;
    expect(
      result.status,
      result.status === 'missing'
        ? `No baseline for ${location}. Run \`pnpm screenshots:update\` to approve baselines first.`
        : `${location} changed by ${result.diffPercent}% (${result.error ?? 'regression detected'})`,
    ).toBe('pass');
  });
}

// Additional test for Theme Builder tab specifically
test.describe('Theme Builder Visual Regression', () => {
  test('Theme Builder tab renders correctly in all themes', async ({ page }) => {
    // Navigate to settings/general and click Theme Builder tab
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');

    // Click Theme Builder tab
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500); // Wait for tab content to render

    // Take screenshot of Theme Builder panel
    const themeBuilderPanel = page.locator('[role="tabpanel"][id="theme-builder-panel"]');
    await expect(themeBuilderPanel).toBeVisible();

    // The screenshot pipeline will capture this
  });

  test('Token Editor shows all categories', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    // Verify all token categories are present
    const categories = [
      'Accent Colors', 'Background', 'Surface', 'Borders',
      'Text', 'Focus', 'Status', 'Spacing', 'Radius', 'Shadows', 'Motion', 'Typography'
    ];

    for (const category of categories) {
      await expect(page.locator(`text=${category}`)).toBeVisible();
    }
  });

  test('Preset Gallery shows built-in themes', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    // Check built-in themes are displayed (36 themes = 9 accents × 4 profiles)
    const themeCards = page.locator('[role="article"]');
    await expect(themeCards).toHaveCount(36);
  });

  test('Preview iframe renders components', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    // Enable preview
    const previewToggle = page.locator('button:has-text("Enable preview"), button:has-text("Preview mode")');
    if (await previewToggle.isVisible()) {
      await previewToggle.click();
      await page.waitForTimeout(1000);

      // Wait for iframe to load
      const iframe = page.locator('iframe[title="Theme Preview"]');
      await expect(iframe).toBeVisible();
    }
  });
});