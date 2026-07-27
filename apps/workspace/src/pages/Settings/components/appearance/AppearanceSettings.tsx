/**
 * Appearance Settings — Theme, colors, and typography.
 *
 * Architecture Traceability:
 *   Settings Framework: 01-Overview.md → Purpose
 *   Natural Law: Intelligence exists in many forms
 *   Purpose: Let's Change the World
 */

import { useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface AppearanceSettings {
  theme: Theme;
  fontSize: number;
  fontFamily: string;
  accentColor: string;
}

const DEFAULT_SETTINGS: AppearanceSettings = {
  theme: 'dark',
  fontSize: 14,
  fontFamily: 'Inter',
  accentColor: '#6366f1',
};

const FONT_OPTIONS = ['Inter', 'Roboto', 'Source Sans Pro', 'Nunito', 'Poppins'];
const COLOR_OPTIONS = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Orange', value: '#f97316' },
];

export default function AppearanceSettings() {
  const [settings, setSettings] = useState<AppearanceSettings>(DEFAULT_SETTINGS);

  const handleThemeChange = (theme: Theme) => {
    setSettings((prev) => ({ ...prev, theme }));
  };

  const handleFontSizeChange = (fontSize: number) => {
    setSettings((prev) => ({ ...prev, fontSize }));
  };

  const handleFontFamilyChange = (fontFamily: string) => {
    setSettings((prev) => ({ ...prev, fontFamily }));
  };

  const handleAccentColorChange = (accentColor: string) => {
    setSettings((prev) => ({ ...prev, accentColor }));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Appearance</h1>
      <p className="text-[var(--text-secondary)] mb-6">Customize the look and feel of your workspace.</p>

      <div className="space-y-8">
        {/* Theme */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Theme</h2>
          <div className="grid grid-cols-3 gap-4">
            {(['dark', 'light', 'system'] as Theme[]).map((theme) => (
              <button
                key={theme}
                type="button"
                onClick={() => handleThemeChange(theme)}
                className={`
                  p-4 rounded-lg border text-center transition-colors
                  ${
                    settings.theme === theme
                      ? 'border-[var(--accent-primary)] bg-[var(--bg-tertiary)]'
                      : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--border-secondary)]'
                  }
                `}
              >
                <div className="text-2xl mb-2">{theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '💻'}</div>
                <span className="font-medium text-[var(--text-primary)] capitalize">{theme}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Font Size */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Font Size</h2>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="12"
              max="18"
              value={settings.fontSize}
              onChange={(e) => handleFontSizeChange(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-[var(--text-primary)] font-medium w-12 text-center">{settings.fontSize}px</span>
          </div>
        </section>

        {/* Font Family */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Font Family</h2>
          <div className="grid grid-cols-2 gap-2">
            {FONT_OPTIONS.map((font) => (
              <button
                key={font}
                type="button"
                onClick={() => handleFontFamilyChange(font)}
                className={`
                  p-3 rounded-lg border text-left transition-colors
                  ${
                    settings.fontFamily === font
                      ? 'border-[var(--accent-primary)] bg-[var(--bg-tertiary)]'
                      : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--border-secondary)]'
                  }
                `}
                style={{ fontFamily: font }}
              >
                <span className="text-[var(--text-primary)]">{font}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Accent Color */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Accent Color</h2>
          <div className="flex flex-wrap gap-3">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => handleAccentColorChange(color.value)}
                className={`
                  w-10 h-10 rounded-full border-2 transition-transform
                  ${
                    settings.accentColor === color.value
                      ? 'border-[var(--text-primary)] scale-110'
                      : 'border-transparent hover:scale-105'
                  }
                `}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
        </section>

        {/* Preview */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Preview</h2>
          <div
            className="p-6 rounded-lg border border-[var(--border-primary)]"
            style={{
              fontFamily: settings.fontFamily,
              fontSize: `${settings.fontSize}px`,
            }}
          >
            <p className="text-[var(--text-primary)] mb-2">This is how your text will appear.</p>
            <button
              type="button"
              className="px-4 py-2 rounded-md text-white"
              style={{ backgroundColor: settings.accentColor }}
            >
              Sample Button
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
