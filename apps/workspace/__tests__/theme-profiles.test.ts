import { describe, expect, it } from 'vitest';
import { ACCENT_PALETTES, PROFILES } from '../src/lib/theme.js';

// Contract for the Settings → General → Profiles gallery: the premium
// light/dark profiles must be present with gallery-grade display settings
// and their theme modes, while legacy profiles keep mode-independent
// behavior (no forced mode switch on apply).

describe('Theme profiles (Settings General)', () => {
  it('exposes unique profile ids with valid accent themes', () => {
    const ids = PROFILES.map((profile) => profile.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const profile of PROFILES) {
      expect(profile.label).toBeTruthy();
      expect(profile.description).toBeTruthy();
      expect(profile.settings.colorTheme).toBeDefined();
      expect(ACCENT_PALETTES[profile.settings.colorTheme]).toBeDefined();
      if (profile.mode !== undefined) {
        expect(['dark', 'light', 'system']).toContain(profile.mode);
      }
    }
  });

  it('offers a premium light profile for the gallery theme', () => {
    const premium = PROFILES.find((profile) => profile.id === 'premium');
    expect(premium).toBeDefined();
    expect(premium?.mode).toBe('light');
    expect(premium?.settings.colorTheme).toBe('gold');
    expect(premium?.settings.radius).toBe('large');
    expect(premium?.settings.spacing).toBe('comfortable');
    expect(premium?.settings.sidebarWidth).toBe('wide');
    expect(premium?.settings.sidebarEnabled).toBe(true);
  });

  it('offers a premium dark profile for the gallery theme', () => {
    const premiumDark = PROFILES.find((profile) => profile.id === 'premium-dark');
    expect(premiumDark).toBeDefined();
    expect(premiumDark?.mode).toBe('dark');
    expect(premiumDark?.settings.colorTheme).toBe('amber');
    expect(premiumDark?.settings.radius).toBe('large');
    expect(premiumDark?.settings.spacing).toBe('comfortable');
    expect(premiumDark?.settings.sidebarWidth).toBe('wide');
    expect(premiumDark?.settings.sidebarEnabled).toBe(true);
  });

  it('keeps legacy profiles mode-independent', () => {
    for (const id of ['default', 'minimal', 'presentation', 'accessibility']) {
      const profile = PROFILES.find((p) => p.id === id);
      expect(profile).toBeDefined();
      expect(profile?.mode).toBeUndefined();
    }
  });
});
