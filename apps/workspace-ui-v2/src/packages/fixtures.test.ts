import { describe, expect, it } from 'vitest';
import { LOGIN_FOOTER, LOGIN_PREVIEW_CARDS } from '../lib/login.fixtures';
import {
  ACTIVITY_BRIDGE_STATUS,
  ACTIVITY_COUNTS,
  ACTIVITY_PARTICIPANTS,
  ACTIVITY_RECORDS,
  participantLabel,
} from './activity.fixtures';
import { AGENT_ACTIVE_COUNT, AGENT_NAMES } from './agent.fixtures';
import { DIAGNOSTIC_BAR_COUNT, DIAGNOSTIC_SEED, DIAGNOSTIC_TITLE } from './diagnostic.fixtures';
import { FILE_FAVOURITES, FILE_ROWS } from './files.fixtures';
import { MARKETPLACE_BADGE, MARKETPLACE_CARDS } from './marketplace.fixtures';
import { OVERVIEW_GREETING, OVERVIEW_HEALTH, OVERVIEW_STATS, OVERVIEW_SUBTITLE } from './overview.fixtures';
import {
  SETTINGS_ACTIVE_SECTION,
  SETTINGS_MENU_ROWS,
  SETTINGS_SECTIONS,
  SETTINGS_TOKENS_DOC,
  SETTINGS_TOPBAR_PILLS,
  WORKSPACE_UI_VERSION_FIXTURE,
  WORKSPACE_UI_VERSION_HELP,
  WORKSPACE_UI_VERSION_OPTIONS,
} from './settings.fixtures';
import { TERMINAL_LINES, TERMINAL_PROMPT } from './terminal.fixtures';

describe('package fixtures', () => {
  it('terminal transcript carries toned lines + prompt', () => {
    expect(TERMINAL_LINES.length).toBeGreaterThan(0);
    for (const line of TERMINAL_LINES) {
      expect(['muted', 'secondary', 'accent']).toContain(line.tone);
      expect(line.text).toBeTruthy();
    }
    expect(TERMINAL_PROMPT.host).toBe('vestara-platform');
  });

  it('activity rail composes labels and counts', () => {
    expect(participantLabel({ agent: 'Assistant', detail: 'eddie', status: 'Idle' })).toBe('Assistant eddie Idle');
    expect(participantLabel({ agent: 'Browser', detail: '', status: 'Active' })).toBe('Browser Active');
    expect(ACTIVITY_PARTICIPANTS).toHaveLength(6);
    expect(ACTIVITY_RECORDS).toHaveLength(3);
    expect(ACTIVITY_COUNTS.participants).toBe(25);
    expect(ACTIVITY_COUNTS.records).toBe(50);
    expect(ACTIVITY_BRIDGE_STATUS.endpoint).toContain('ws://');
  });

  it('agent roster holds names + headcount', () => {
    expect(AGENT_NAMES).toHaveLength(6);
    expect(AGENT_ACTIVE_COUNT).toBe(7);
  });

  it('marketplace holds 6 cards + badge', () => {
    expect(MARKETPLACE_CARDS).toHaveLength(6);
    expect(MARKETPLACE_BADGE).toBe('112 FINAL');
  });

  it('overview holds greeting + 4 stats', () => {
    expect(OVERVIEW_GREETING).toBeTruthy();
    expect(OVERVIEW_SUBTITLE).toBeTruthy();
    expect(OVERVIEW_HEALTH).toBe('HEALTHY');
    expect(OVERVIEW_STATS.map((s) => s.key)).toEqual(['WORKSPACE', 'HEALTH', 'FOCUS', 'AGENTS']);
  });

  it('settings holds sections, pills, menu rows, token doc', () => {
    expect(SETTINGS_SECTIONS).toContain(SETTINGS_ACTIVE_SECTION);
    expect(SETTINGS_TOPBAR_PILLS.filter((p) => p.active)).toHaveLength(1);
    expect(SETTINGS_MENU_ROWS).toHaveLength(4);
    expect(SETTINGS_TOKENS_DOC).toContain('#2de8c3');
  });

  it('settings holds the workspace UI toggle options + fixture', () => {
    expect(WORKSPACE_UI_VERSION_OPTIONS.map((o) => o.value)).toEqual(['v1', 'v2']);
    expect(WORKSPACE_UI_VERSION_FIXTURE).toBe('v2');
    expect(WORKSPACE_UI_VERSION_HELP).toContain('general.workspaceUiVersion');
  });

  it('diagnostic holds strip shape + seed', () => {
    expect(DIAGNOSTIC_TITLE).toBeTruthy();
    expect(DIAGNOSTIC_BAR_COUNT).toBe(32);
    expect(Number.isInteger(DIAGNOSTIC_SEED)).toBe(true);
  });

  it('files hold favourites + rows with kinds', () => {
    expect(FILE_FAVOURITES.length).toBeGreaterThan(0);
    expect(FILE_ROWS.length).toBeGreaterThan(0);
    for (const row of FILE_ROWS) expect(['folder', 'file']).toContain(row.kind);
  });

  it('login holds preview cards + footer', () => {
    expect(LOGIN_PREVIEW_CARDS).toHaveLength(3);
    for (const card of LOGIN_PREVIEW_CARDS) expect(['terminal', 'activity', 'store']).toContain(card.icon);
    expect(LOGIN_FOOTER.left).toBeTruthy();
    expect(LOGIN_FOOTER.right).toBeTruthy();
  });
});
