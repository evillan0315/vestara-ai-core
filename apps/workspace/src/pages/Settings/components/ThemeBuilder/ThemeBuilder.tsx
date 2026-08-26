import { useState, useEffect } from 'react';
import { ThemeBuilderHeader } from './ThemeBuilderHeader';
import { ThemeBuilderTabs } from './ThemeBuilderTabs';
import { PresetGallery } from './PresetGallery/PresetGallery';
import { ThemePreview } from './ThemePreview/ThemePreview';
import { TokenEditor } from './TokenEditor/TokenEditor';
import { ImportExport } from './ImportExport/ImportExport';
import { surface } from '../../settings-ui';

const SIDEBAR_WIDTH = 280;
const PREVIEW_WIDTH = 400;
const MOBILE_BREAKPOINT = 1024;
const SMALL_BREAKPOINT = 768;

export function ThemeBuilder() {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    const checkSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < MOBILE_BREAKPOINT);
      setIsSmall(width < SMALL_BREAKPOINT);
      if (width < MOBILE_BREAKPOINT) {
        setLeftCollapsed(true);
      }
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (!leftCollapsed && isMobile) {
        setLeftCollapsed(true);
      } else if (!rightCollapsed) {
        setRightCollapsed(true);
      }
    }
  };

  return (
    <div
      className="flex flex-col h-full"
      onKeyDown={handleKeyDown}
      role="application"
      aria-label="Theme Builder"
    >
      <ThemeBuilderHeader />

      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left Sidebar - Preset Gallery */}
        <aside
          className={`flex-shrink-0 transition-all duration-200 ease-in-out ${surface} border-r border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] flex flex-col overflow-hidden`}
          style={{
            width: leftCollapsed ? 0 : SIDEBAR_WIDTH,
            minWidth: leftCollapsed ? 0 : SIDEBAR_WIDTH,
            opacity: leftCollapsed ? 0 : 1,
            pointerEvents: leftCollapsed ? 'none' : 'auto',
            overflow: leftCollapsed ? 'hidden' : 'auto',
          }}
          aria-label="Preset Gallery"
          role="complementary"
        >
          {!isMobile && (
            <button
              type="button"
              className="absolute -right-6 top-1/2 -translate-y-1/2 z-10 size-10 rounded-full border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-panel,var(--color-zinc-950))] flex items-center justify-center text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:border-[var(--vestara-accent-border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              aria-label={leftCollapsed ? 'Show preset gallery' : 'Hide preset gallery'}
              aria-expanded={!leftCollapsed}
            >
              <svg
                className={`size-5 transition-transform ${leftCollapsed ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
            <PresetGallery />
          </div>
        </aside>

        {/* Mobile drawer toggle for left sidebar */}
        {isMobile && leftCollapsed && (
          <button
            type="button"
            className="fixed left-4 top-20 z-40 size-10 rounded-full border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-panel,var(--color-zinc-950))] flex items-center justify-center text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:border-[var(--vestara-accent-border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset shadow-lg"
            onClick={() => setLeftCollapsed(false)}
            aria-label="Show preset gallery"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* Center - Token Editor / Tabs */}
        <main className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 0 }}>
          <ThemeBuilderTabs />
        </main>

        {/* Right Sidebar - Theme Preview */}
        <aside
          className={`flex-shrink-0 transition-all duration-200 ease-in-out ${surface} border-l border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] flex flex-col overflow-hidden`}
          style={{
            width: rightCollapsed ? 0 : PREVIEW_WIDTH,
            minWidth: rightCollapsed ? 0 : PREVIEW_WIDTH,
            opacity: rightCollapsed ? 0 : 1,
            pointerEvents: rightCollapsed ? 'none' : 'auto',
            overflow: rightCollapsed ? 'hidden' : 'auto',
          }}
          aria-label="Theme Preview"
          role="complementary"
        >
          {!isMobile && (
            <button
              type="button"
              className="absolute -left-6 top-1/2 -translate-y-1/2 z-10 size-10 rounded-full border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-panel,var(--color-zinc-950))] flex items-center justify-center text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:border-[var(--vestara-accent-border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
              onClick={() => setRightCollapsed(!rightCollapsed)}
              aria-label={rightCollapsed ? 'Show preview' : 'Hide preview'}
              aria-expanded={!rightCollapsed}
            >
              <svg
                className={`size-5 transition-transform ${rightCollapsed ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
            <ThemePreview />
          </div>
        </aside>

        {/* Mobile drawer toggle for right sidebar */}
        {isMobile && rightCollapsed && (
          <button
            type="button"
            className="fixed right-4 top-20 z-40 size-10 rounded-full border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-panel,var(--color-zinc-950))] flex items-center justify-center text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:border-[var(--vestara-accent-border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset shadow-lg"
            onClick={() => setRightCollapsed(false)}
            aria-label="Show preview"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
        )}
      </div>

      <style jsx>{`
        @media (max-width: ${SMALL_BREAKPOINT}px) {
          .theme-builder-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}