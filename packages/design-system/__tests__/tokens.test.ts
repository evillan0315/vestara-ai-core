import { describe, expect, it } from 'vitest';
import {
  ACCENT_PALETTES,
  DEFAULT_THEME,
  ENTITY_PRESENTATION,
  presentationFor,
  STATUS_TONES,
  TUI_NAVIGATION,
  TUI_SEMANTIC_PALETTES,
  toneForStatus,
} from '../src/index.js';

describe('design-system tokens', () => {
  it('defaults to metallic gold', () => {
    expect(DEFAULT_THEME).toBe('gold');
    expect(ACCENT_PALETTES.gold.hex).toBe('#D4A843');
  });

  it('covers every accent theme with a terminal palette', () => {
    for (const [name, palette] of Object.entries(ACCENT_PALETTES)) {
      expect(TUI_SEMANTIC_PALETTES[name as keyof typeof TUI_SEMANTIC_PALETTES]).toBeDefined();
      expect(palette.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    const tui = TUI_SEMANTIC_PALETTES.gold;
    expect(tui.accent).toBe('#D4A843');
    expect(tui.background).toBeDefined();
    expect(tui.text).toBeDefined();
  });

  it('maps statuses to semantic tones', () => {
    expect(toneForStatus('running')).toBe('active');
    expect(toneForStatus('completed')).toBe('success');
    expect(toneForStatus('blocked')).toBe('warning');
    expect(toneForStatus('failed')).toBe('error');
    expect(toneForStatus('connecting')).toBe('info');
    expect(toneForStatus('unknown-thing')).toBe('idle');
    expect(toneForStatus(undefined)).toBe('idle');
  });

  it('provides presentation metadata for known entities', () => {
    expect(ENTITY_PRESENTATION.agent.icon).toBe('◈');
    expect(presentationFor('workflow').label).toBe('Workflow');
    expect(presentationFor('nope').label).toBe('nope');
    expect(STATUS_TONES.completed).toBe('success');
  });

  it('defines renderer-neutral navigation', () => {
    expect(TUI_NAVIGATION.length).toBeGreaterThan(5);
    expect(TUI_NAVIGATION[0]?.id).toBe('chat');
    for (const item of TUI_NAVIGATION) {
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });
});
