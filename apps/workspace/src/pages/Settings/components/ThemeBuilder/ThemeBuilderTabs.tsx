import { useState } from 'react';
import { TokenEditor } from './TokenEditor/TokenEditor';
import { ThemePreview } from './ThemePreview/ThemePreview';
import { PresetGallery } from './PresetGallery/PresetGallery';
import { ImportExport } from './ImportExport/ImportExport';
import { focus } from '../../settings-ui';

type ThemeBuilderTab = 'editor' | 'preview' | 'presets' | 'import-export';

const TABS: Array<{ id: ThemeBuilderTab; label: string; icon: React.ReactNode }> = [
  {
    id: 'editor',
    label: 'Editor',
    icon: (
      <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  {
    id: 'preview',
    label: 'Preview',
    icon: (
      <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
  {
    id: 'presets',
    label: 'Presets',
    icon: (
      <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
  },
  {
    id: 'import-export',
    label: 'Import/Export',
    icon: (
      <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
  },
];

export function ThemeBuilderTabs() {
  const [activeTab, setActiveTab] = useState<ThemeBuilderTab>('editor');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'editor':
        return <TokenEditor />;
      case 'preview':
        return <ThemePreview />;
      case 'presets':
        return <PresetGallery />;
      case 'import-export':
        return <ImportExport />;
      default:
        return <TokenEditor />;
    }
  };

  return (
    <div className="flex flex-col h-full" role="region" aria-label="Theme Builder tabs">
      <div
        className="flex items-center gap-1 p-1 border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-4"
        role="tablist"
        aria-label="Theme Builder sections"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${tab.id}-panel`}
            id={`${tab.id}-tab`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-[var(--vestara-radius)] transition-colors ${focus} ${
              activeTab === tab.id
                ? 'bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)] border border-[var(--vestara-accent-border)]'
                : 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:bg-[var(--vestara-color-surface-panel,var(--color-zinc-900))]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {TABS.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`${tab.id}-panel`}
            aria-labelledby={`${tab.id}-tab`}
            hidden={activeTab !== tab.id}
            className="h-full"
          >
            {activeTab === tab.id && renderTabContent()}
          </div>
        ))}
      </div>
    </div>
  );
}