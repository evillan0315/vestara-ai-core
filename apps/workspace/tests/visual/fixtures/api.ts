import type { Page, Route } from '@playwright/test';
import {
  QUALIFICATION_VISUAL_PROFILE_ID,
  qualificationVisualTrial,
  qualificationVisualTrials,
} from './qualification.js';
import type { RouteDefinition } from '../routes/manifest.js';

const QUALIFICATION_ROUTE_IDS = new Set(['qualification', 'qualification-detail', 'qualification-activity']);

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installQualificationFixtures(page: Page): Promise<void> {
  await page.route('**/api/qualification/trials', (route) => json(route, 200, qualificationVisualTrials));
  await page.route('**/api/qualification/trials/*', (route) => {
    const url = new URL(route.request().url());
    const profileId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
    if (profileId === QUALIFICATION_VISUAL_PROFILE_ID) {
      return json(route, 200, { trial: qualificationVisualTrial });
    }
    return json(route, 404, { error: `no qualification visual fixture for ${profileId}` });
  });
}

export async function installVisualApiFixtures(page: Page, route: RouteDefinition): Promise<void> {
  if (QUALIFICATION_ROUTE_IDS.has(route.id)) {
    await installQualificationFixtures(page);
  }
}
