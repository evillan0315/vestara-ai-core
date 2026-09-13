import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';
import { DashPill, DashTile, enterDelay } from '../dashPremium';

interface Suggestion {
  id: string;
  priority: string;
  title: string;
  description?: string;
  impact?: string;
  category?: string;
}

interface SuggestionsSectionProps {
  suggestions: Suggestion[];
  dragSection: DragSectionProps;
}

const ICON_MAP: Record<string, string> = {
  health: '🩺',
  risk: '⚠️',
  planning: '📋',
  testing: '🧪',
  documentation: '📝',
  architecture: '🏗️',
  dependency: '🔗',
  agent: '🤖',
  milestone: '🎯',
};

export default function SuggestionsSection({ suggestions, dragSection }: SuggestionsSectionProps) {
  if (suggestions.length === 0) return null;

  return (
    <DashboardSection title="Suggestions" icon="💡" dragSection={dragSection}>
      <ul className="space-y-1">
        {suggestions.slice(0, 5).map((s, i) => {
          const accent = s.priority === 'high' ? '#ef4444' : s.priority === 'medium' ? '#f59e0b' : '#52525b';
          return (
            <li key={s.id || i} className="mpg-enter" style={enterDelay(i)}>
              <div className="mpg-category-row group">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <DashTile accent={accent}>{ICON_MAP[s.category || ''] || '💡'}</DashTile>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-[var(--vestara-text-primary)]">
                      {s.title}
                    </span>
                    {s.description && (
                      <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">{s.description}</span>
                    )}
                  </span>
                </span>
                <DashPill dot={accent}>{s.priority}</DashPill>
              </div>
            </li>
          );
        })}
      </ul>
    </DashboardSection>
  );
}
