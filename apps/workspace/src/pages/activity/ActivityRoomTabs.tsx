import type { ReactNode } from 'react';

export type ActivityRoomView = 'activity' | 'operations' | 'timeline' | 'evidence' | 'files' | 'notes';

interface ActivityRoomTab {
  readonly id: ActivityRoomView;
  readonly label: string;
  readonly icon: ReactNode;
  readonly disabled?: boolean;
}

const TABS: readonly ActivityRoomTab[] = [
  { id: 'activity', label: 'Activity', icon: '◉' },
  { id: 'operations', label: 'Operations', icon: '✣' },
  { id: 'timeline', label: 'Timeline', icon: '⌁' },
  { id: 'evidence', label: 'Evidence', icon: '◈' },
  { id: 'files', label: 'Files', icon: '□', disabled: true },
  { id: 'notes', label: 'Notes', icon: '✎', disabled: true },
];

interface ActivityRoomTabsProps {
  readonly activeView: ActivityRoomView;
  readonly onViewChange: (view: ActivityRoomView) => void;
}

export default function ActivityRoomTabs({ activeView, onViewChange }: ActivityRoomTabsProps) {
  return (
    <div className="ar-activity-tabs" role="tablist" aria-label="Activity Room views">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeView === tab.id}
          aria-disabled={tab.disabled || undefined}
          disabled={tab.disabled}
          onClick={() => onViewChange(tab.id)}
          className={`ar-activity-tab ${activeView === tab.id ? 'ar-activity-tab--active' : ''}`}
        >
          <span aria-hidden="true">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
