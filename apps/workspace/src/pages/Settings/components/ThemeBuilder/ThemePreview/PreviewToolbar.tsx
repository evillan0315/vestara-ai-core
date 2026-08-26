import type { ReactNode } from 'react';
import { Segmented, Button } from '../../../settings-ui.js';

const surface = 'border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface-panel,var(--color-zinc-900))]';
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))] focus-visible:ring-inset';
const textPrimary = 'text-[var(--vestara-color-text-primary,var(--vestara-text))]';
const textSecondary = 'text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]';
const textMuted = 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]';
const borderDefault = 'border-[var(--vestara-color-border-default,var(--color-zinc-700))]';
const borderSubtle = 'border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]';
const radius = 'rounded-[var(--vestara-radius)]';
const radiusFull = 'rounded-[var(--vestara-radius-full)]';
const transition = 'transition-colors motion-reduce:transition-none';

interface PreviewToolbarProps {
  themeMode: 'dark' | 'light' | 'system';
  onThemeModeChange: (mode: 'dark' | 'light' | 'system') => void;
  viewport: 'mobile' | 'tablet' | 'desktop' | 'full';
  onViewportChange: (viewport: 'mobile' | 'tablet' | 'desktop' | 'full') => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

const VIEWPORTS = [
  { value: 'mobile', label: 'Mobile', width: '375px', icon: '📱' },
  { value: 'tablet', label: 'Tablet', width: '768px', icon: '📟' },
  { value: 'desktop', label: 'Desktop', width: '1024px', icon: '💻' },
  { value: 'full', label: 'Full', width: '100%', icon: '🖥️' },
] as const;

export function PreviewToolbar({
  themeMode,
  onThemeModeChange,
  viewport,
  onViewportChange,
  onRefresh,
  isLoading,
}: PreviewToolbarProps) {
  return (
    <div
      className={`flex items-center gap-3 ${borderSubtle} ${surface} ${radius} px-3 py-2 ${transition}`}
      role="toolbar"
      aria-label="Preview controls"
    >
      <div className="flex items-center gap-2 border-r ${borderSubtle} pr-3" aria-label="Theme mode">
        <span className="text-[var(--vestara-font-size-xs)] font-medium ${textMuted}">Mode</span>
        <Segmented
          label="Theme mode"
          value={themeMode}
          options={['dark', 'light', 'system']}
          onChange={onThemeModeChange}
        />
      </div>

      <div className="flex items-center gap-2 border-r ${borderSubtle} px-3" aria-label="Viewport">
        <span className="text-[var(--vestara-font-size-xs)] font-medium ${textMuted}">Viewport</span>
        <Segmented
          label="Viewport"
          value={viewport}
          options={VIEWPORTS.map((v) => v.value)}
          onChange={onViewportChange}
        />
      </div>

      <div className="flex items-center gap-2 flex-1 justify-end">
        <span className={`inline-flex items-center gap-1.5 ${radiusFull} ${surface} ${borderSubtle} px-2.5 py-1 text-[var(--vestara-font-size-xs)] font-medium ${textSecondary}`}>
          <span className="size-1.5 rounded-full bg-[var(--vestara-green)]" aria-hidden="true" />
          Live Preview
        </span>
        <Button
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="Refresh preview"
          className="flex items-center gap-1.5"
        >
          <svg
            className={`size-4 ${isLoading ? 'animate-spin' : ''} ${transition}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-[var(--vestara-font-size-xs)]">Refresh</span>
        </Button>
      </div>
    </div>
  );
}