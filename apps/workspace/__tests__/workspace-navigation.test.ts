/**
 * VES-DESIGN-006: canonical navigation projection tests (pure logic).
 *
 * - Registry ids join to AppRoute ids (one descriptive truth).
 * - Curated sidebar order matches assets/vestara-agents-screen.png.
 * - Visibility overrides, parked capabilities, and custom CRUD entries.
 */
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../src/routes.js';
import {
  WORKSPACE_NAVIGATION,
  buildNavSearchIndex,
  buildWorkspaceNavigation,
} from '../src/layouts/workspace-navigation.js';

describe('workspace navigation registry', () => {
  it('joins every pathed entry to a live AppRoute id', () => {
    const routeIds = new Set(APP_ROUTES.map((r) => r.id));
    for (const entry of WORKSPACE_NAVIGATION) {
      if (entry.action) continue;
      expect(routeIds.has(entry.id), `${entry.id} has no AppRoute`).toBe(true);
    }
  });

  it('exposes the mock sidebar order: Home … Marketplace — Tools, Settings', () => {
    const titles = buildWorkspaceNavigation()[0].items.map((i) => i.title);
    expect(titles).toEqual([
      'Home',
      'Global Assistant',
      'Activity Room',
      'Executions',
      'Agents',
      'Workflows',
      'Projects',
      'Files',
      'Terminal',
      'Marketplace',
      'Tools',
      'Settings',
    ]);
  });

  it('renders one unlabeled section with the divider before Tools', () => {
    const [section] = buildWorkspaceNavigation();
    expect(section.title).toBe('');
    expect(section.items.find((i) => i.title === 'Tools')?.dividerBefore).toBe(true);
  });

  it('hides non-primary tiers by default but keeps them searchable', () => {
    const titles = buildWorkspaceNavigation()[0].items.map((i) => i.title);
    expect(titles).not.toContain('Diagnostics');
    const index = buildNavSearchIndex();
    expect(index.find((e) => e.label === 'Diagnostics')?.path).toBe('/diagnostics');
    expect(index.find((e) => e.label === 'Global Assistant')?.action).toBe('open-assistant');
  });

  it('never exposes the legacy activity-v2 entry', () => {
    const index = buildNavSearchIndex();
    expect(index.find((e) => e.id === 'activity-v2')).toBeUndefined();
    expect(index.find((e) => e.id === 'activity')?.path).toBe('/activity');
  });

  it('applies visibility overrides both ways', () => {
    const hidden = buildWorkspaceNavigation({ visibility: { agents: false } })[0].items;
    expect(hidden.find((i) => i.title === 'Agents')).toBeUndefined();
    const shown = buildWorkspaceNavigation({ visibility: { diagnostics: true } })[0].items;
    expect(shown.find((i) => i.title === 'Diagnostics')).toBeDefined();
  });

  it('drops capability-gated entries when parked', () => {
    const all = buildWorkspaceNavigation({
      visibility: { 'live-browser': true },
      parkedCapabilities: new Set(['browser-runtime']),
    })[0].items;
    expect(all.find((i) => i.title === 'Live Browser')).toBeUndefined();
    const unparked = buildWorkspaceNavigation({ visibility: { 'live-browser': true } })[0].items;
    expect(unparked.find((i) => i.title === 'Live Browser')).toBeDefined();
  });

  it('merges custom CRUD entries in order and skips invalid ones', () => {
    const [section] = buildWorkspaceNavigation({
      custom: [
        { id: 'custom-1', label: 'Runbooks', path: '/runbooks', icon: 'generic', order: 105, visible: true },
        { id: 'custom-2', label: '', path: '/empty', icon: 'generic', order: 106, visible: true },
        { id: 'custom-3', label: 'Hidden', path: '/hidden', icon: 'generic', order: 107, visible: false },
      ],
    });
    const titles = section.items.map((i) => i.title);
    expect(titles).toContain('Runbooks');
    expect(titles.indexOf('Runbooks') > titles.indexOf('Marketplace')).toBe(true);
    expect(titles.indexOf('Runbooks') < titles.indexOf('Tools')).toBe(true);
    expect(titles).not.toContain('');
    expect(titles).not.toContain('Hidden');
  });

  it('keeps registry ids unique', () => {
    const ids = WORKSPACE_NAVIGATION.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
