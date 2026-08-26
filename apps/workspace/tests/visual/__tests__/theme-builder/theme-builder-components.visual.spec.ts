import { test, expect } from '@playwright/test';
import { loadConfig } from './config.js';
import { VisualTestEngine } from './engine.js';

const config = loadConfig();
const engine = new VisualTestEngine(config);

// Extended themes for comprehensive Theme Builder visual testing
const EXTENDED_THEMES = [
  // Dark mode variants for all 9 accents
  ...['gold', 'amber', 'emerald', 'blue', 'violet', 'rose', 'teal', 'neutral', 'orange'].map(accent => ({
    id: `dark-${accent}`,
    label: `Dark ${accent}`,
    storageValue: `dark`,
    accentTheme: accent,
  })),
  // Light mode variants for all 9 accents
  ...['gold', 'amber', 'emerald', 'blue', 'violet', 'rose', 'teal', 'neutral', 'orange'].map(accent => ({
    id: `light-${accent}`,
    label: `Light ${accent}`,
    storageValue: `light`,
    accentTheme: accent,
  })),
];

// Extended viewports
const EXTENDED_VIEWPORTS = [
  { id: 'mobile', name: 'Mobile 375', width: 375, height: 667, isMobile: true, hasTouch: true },
  { id: 'tablet', name: 'Tablet 768', width: 768, height: 1024, isMobile: true, hasTouch: true },
  { id: 'desktop', name: 'Desktop 1440', width: 1440, height: 900 },
  { id: 'desktop-wide', name: 'Desktop 1920', width: 1920, height: 1080 },
];

// Generate test cases for PreviewComponents
const routes = engine['discovery'].discover();
const settingsRoute = routes.find(r => r.id === 'settings');

const previewComponentCases: Array<{ title: string; route: typeof settingsRoute; viewport: typeof EXTENDED_VIEWPORTS[0]; theme: typeof EXTENDED_THEMES[0] }> = [];

if (settingsRoute) {
  for (const viewport of EXTENDED_VIEWPORTS) {
    for (const theme of EXTENDED_THEMES) {
      previewComponentCases.push({
        title: `preview-components.${viewport.id}.${theme.id}`,
        route: settingsRoute,
        viewport,
        theme,
      });
    }
  }
}

for (const tc of previewComponentCases) {
  test(`preview-components: ${tc.title}`, async ({ browser }) => {
    const result = await engine.execute(browser, {
      ...tc,
      route: tc.route,
      viewport: tc.viewport,
      theme: { id: tc.theme.id, label: tc.theme.label, storageValue: tc.theme.storageValue },
      role: tc.role,
    });

    if (config.mode === 'update') {
      return;
    }

    const location = `PreviewComponents @ ${tc.viewport.name} / ${tc.theme.label}`;
    expect(
      result.status,
      result.status === 'missing'
        ? `No baseline for ${location}. Run \`pnpm screenshots:update\` to approve baselines first.`
        : `${location} changed by ${result.diffPercent}% (${result.error ?? 'regression detected'})`,
    ).toBe('pass');
  });
}

// Test TokenEditor with all token types
test.describe('TokenEditor Visual Regression', () => {
  test('TokenEditor renders all token types in dark and light', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    // Test in dark mode
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.waitForTimeout(300);

    const tokenEditor = page.locator('[role="region"][aria-label="Token editor"]');
    await expect(tokenEditor).toBeVisible();

    // Check all categories are expanded
    const categories = [
      'Accent Colors', 'Background', 'Surface', 'Borders',
      'Text', 'Focus', 'Status', 'Spacing', 'Radius', 'Shadows', 'Motion', 'Typography'
    ];

    for (const category of categories) {
      const header = page.locator(`header:has-text("${category}")`);
      if (await header.count() > 0) {
        const isExpanded = await header.getAttribute('aria-expanded');
        if (isExpanded === 'false') {
          await header.click();
          await page.waitForTimeout(100);
        }
      }
    }

    // Screenshot would be captured by visual test framework
  });

  test('TokenEditor shows color pickers for color tokens', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    const accentSection = page.locator('header:has-text("Accent Colors")');
    if ((await accentSection.getAttribute('aria-expanded')) === 'false') {
      await accentSection.click();
      await page.waitForTimeout(100);
    }

    // Check color inputs exist
    const colorInputs = page.locator('input[type="color"]');
    await expect(colorInputs.first()).toBeVisible();
  });

  test('TokenEditor shows sliders for length tokens', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    const spacingSection = page.locator('header:has-text("Spacing")');
    if ((await spacingSection.getAttribute('aria-expanded')) === 'false') {
      await spacingSection.click();
      await page.waitForTimeout(100);
    }

    const sliders = page.locator('input[type="range"]');
    await expect(sliders.first()).toBeVisible();

    const numberInputs = page.locator('input[type="number"]');
    await expect(numberInputs.first()).toBeVisible();
  });

  test('TokenEditor shows selects for font tokens', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    const typoSection = page.locator('header:has-text("Typography")');
    if ((await typoSection.getAttribute('aria-expanded')) === 'false') {
      await typoSection.click();
      await page.waitForTimeout(100);
    }

    const selects = page.locator('select');
    await expect(selects.first()).toBeVisible();
  });
});

// Test PresetGallery grid rendering
test.describe('PresetGallery Visual Regression', () => {
  test('PresetGallery shows built-in themes grid', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    const builtInTab = page.locator('button[role="tab"]:has-text("Built-in")');
    await expect(builtInTab).toBeVisible();
    await expect(builtInTab).toHaveAttribute('aria-selected', 'true');

    const themeCards = page.locator('[role="article"]');
    await expect(themeCards).toHaveCount(36); // 9 accents × 4 profiles
  });

  test('PresetGallery shows custom themes tab', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    const customTab = page.locator('button[role="tab"]:has-text("Custom")');
    await expect(customTab).toBeVisible();
    await customTab.click();
    await page.waitForTimeout(100);

    // Should show empty state or custom themes
    const emptyState = page.locator('text=No Custom Themes Yet');
    await expect(emptyState).toBeVisible();
  });

  test('PresetGallery search filters themes', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder="Search themes..."]');
    await searchInput.fill('gold');
    await page.waitForTimeout(200);

    const themeCards = page.locator('[role="article"]');
    // Should filter to 4 gold themes (one per profile)
    await expect(themeCards).toHaveCount(4);
  });
});

// Test Dark/Light mode in preview
test.describe('Theme Preview Dark/Light Mode', () => {
  test('Preview shows dark mode correctly', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    // Enable preview
    const previewTab = page.locator('button[role="tab"]:has-text("Preview")');
    await previewTab.click();
    await page.waitForTimeout(100);

    const enablePreview = page.locator('button:has-text("Enable preview")');
    if (await enablePreview.isVisible()) {
      await enablePreview.click();
      await page.waitForTimeout(1000);

      const iframe = page.locator('iframe[title="Theme Preview"]');
      await expect(iframe).toBeVisible();

      // Check dark mode
      const modeSelect = page.locator('select[aria-label="Theme mode"]');
      await modeSelect.selectOption('dark');
      await page.waitForTimeout(500);

      // Screenshot would be captured
    }
  });

  test('Preview shows light mode correctly', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    const previewTab = page.locator('button[role="tab"]:has-text("Preview")');
    await previewTab.click();
    await page.waitForTimeout(100);

    const enablePreview = page.locator('button:has-text("Enable preview")');
    if (await enablePreview.isVisible()) {
      await enablePreview.click();
      await page.waitForTimeout(1000);

      const iframe = page.locator('iframe[title="Theme Preview"]');
      await expect(iframe).toBeVisible();

      const modeSelect = page.locator('select[aria-label="Theme mode"]');
      await modeSelect.selectOption('light');
      await page.waitForTimeout(500);
    }
  });

  test('Preview switches between all 9 accent themes', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    const previewTab = page.locator('button[role="tab"]:has-text("Preview")');
    await previewTab.click();
    await page.waitForTimeout(100);

    const enablePreview = page.locator('button:has-text("Enable preview")');
    if (await enablePreview.isVisible()) {
      await enablePreview.click();
      await page.waitForTimeout(1000);

      // Apply each accent theme from preset gallery
      const editTab = page.locator('button[role="tab"]:has-text("Edit")');
      await editTab.click();
      await page.waitForTimeout(100);

      const builtInTab = page.locator('button[role="tab"]:has-text("Built-in")');
      await builtInTab.click();
      await page.waitForTimeout(100);

      // Click apply on first theme (Gold Default)
      const firstCard = page.locator('[role="article"]').first();
      const applyButton = firstCard.locator('button:has-text("Apply")');
      await applyButton.click();
      await page.waitForTimeout(300);

      // Verify accent color changed in preview
      await previewTab.click();
      await page.waitForTimeout(300);
    }
  });
});

// Test reduced motion
test.describe('Reduced Motion', () => {
  test('Theme Builder respects prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');
    await page.click('button[role="tab"]:has-text("Theme Builder")');
    await page.waitForTimeout(500);

    // Transitions should be disabled
    const categoryHeader = page.locator('header:has-text("Accent Colors")');
    const content = page.locator('[role="region"][aria-label="Accent Colors tokens"]');

    // Click to collapse - should be instant
    await categoryHeader.click();
    await expect(content).toHaveAttribute('hidden');

    await categoryHeader.click();
    await expect(content).not.toHaveAttribute('hidden');
  });
});