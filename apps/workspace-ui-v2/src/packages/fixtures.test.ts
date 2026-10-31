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
import { MARKETPLACE_BADGE, MARKETPLACE_FIXTURE } from './marketplace.fixtures';
import { OVERVIEW_GREETING, OVERVIEW_HEALTH, OVERVIEW_STATS, OVERVIEW_SUBTITLE } from './overview.fixtures';
import {
  APPEARANCE_THEME_OPTIONS,
  SETTINGS_ACTIVE_SECTION,
  SETTINGS_EMPTY_SECTION_NOTE,
  SETTINGS_MENU_ROWS,
  SETTINGS_SECTIONS,
  SETTINGS_TOKENS_DOC,
  SETTINGS_TOPBAR_PILLS,
  WORKSPACE_UI_VERSION_FIXTURE,
  WORKSPACE_UI_VERSION_HELP,
  WORKSPACE_UI_VERSION_OPTIONS,
} from './settings.fixtures';
import { TERMINAL_LINES, TERMINAL_PROMPT } from './terminal.fixtures';
import {
  AUDIO_PIPELINE,
  CLINICAL_INTEGRATIONS,
  DEFAULT_DUPLEX_MODEL_ID,
  DEFAULT_STT_MODEL_ID,
  DEFAULT_TTS_VOICE_ID,
  PREFERRED_DUPLEX_MODEL,
  STREAM_PHRASES,
  STT_MODELS,
  TTS_VOICES,
  VOICE_PROVIDERS,
  VOICE_STREAMING_MODES,
} from './voice-streaming.fixtures';

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
    expect(ACTIVITY_PARTICIPANTS).toHaveLength(10);
    expect(ACTIVITY_RECORDS).toHaveLength(3);
    expect(ACTIVITY_COUNTS.participants).toBe(25);
    expect(ACTIVITY_COUNTS.records).toBe(50);
    expect(ACTIVITY_BRIDGE_STATUS.endpoint).toContain('ws://');
  });

  it('agent roster holds names + headcount', () => {
    expect(AGENT_NAMES).toHaveLength(10);
    expect(AGENT_ACTIVE_COUNT).toBe(10);
  });

  it('marketplace holds 7 assets + badge', () => {
    expect(MARKETPLACE_FIXTURE).toHaveLength(7);
    expect(MARKETPLACE_BADGE).toBe('2.0.0');
  });

  it('marketplace lists voice streaming as an installed, enabled package', () => {
    const voice = MARKETPLACE_FIXTURE.find((a) => a.id === 'voice-streaming');
    expect(voice?.displayName).toBe('Voice Streaming');
    expect(voice?.installed).toBe(true);
    expect(voice?.enabled).toBe(true);
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

  it('settings holds eight accent themes mirroring ShellAccentTheme', () => {
    expect(APPEARANCE_THEME_OPTIONS.map((o) => o.value)).toEqual([
      'shell',
      'amber',
      'teal',
      'emerald',
      'blue',
      'violet',
      'rose',
      'neutral',
    ]);
    expect(SETTINGS_EMPTY_SECTION_NOTE).toContain('settings registry');
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

  it('voice streaming models target the opencode provider', () => {
    for (const m of STT_MODELS) expect(m.provider).toBe('opencode');
    for (const v of TTS_VOICES) expect(v.provider).toBe('opencode');
    expect(STT_MODELS.find((m) => m.id === DEFAULT_STT_MODEL_ID)?.family).toBe('muse-spark');
    expect(TTS_VOICES.find((v) => v.id === DEFAULT_TTS_VOICE_ID)).toBeTruthy();
    expect(DEFAULT_DUPLEX_MODEL_ID).toBe('opencode-go/muse-spark-1.3-contributor');
    expect(PREFERRED_DUPLEX_MODEL).toEqual({
      providerId: 'opencode-go',
      modelId: 'muse-spark-1.3-contributor',
    });
    expect(VOICE_PROVIDERS).toEqual([{ id: 'opencode', name: 'OpenCode' }]);
  });

  it('voice streaming holds modes, models, voices, pipeline', () => {
    expect(VOICE_STREAMING_MODES).toEqual(['stt', 'tts', 'duplex']);
    expect(STT_MODELS.length).toBeGreaterThan(0);
    expect(TTS_VOICES.length).toBeGreaterThan(0);
    expect(STREAM_PHRASES.length).toBeGreaterThan(0);
    expect(AUDIO_PIPELINE).toHaveLength(4);
    expect(CLINICAL_INTEGRATIONS.length).toBeGreaterThan(0);
  });

  it('login holds preview cards + footer', () => {
    expect(LOGIN_PREVIEW_CARDS).toHaveLength(3);
    for (const card of LOGIN_PREVIEW_CARDS) expect(['terminal', 'activity', 'store']).toContain(card.icon);
    expect(LOGIN_FOOTER.left).toBeTruthy();
    expect(LOGIN_FOOTER.right).toBeTruthy();
  });
});
