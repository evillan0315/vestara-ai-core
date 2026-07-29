import type { ReactNode } from 'react';
import { useCallback } from 'react';
import MilestoneEraSection from '../../components/dashboard/MilestoneEraSection';
import type { DragSectionProps } from './DashboardSection';
import {
  ActiveDevSection,
  AgentHealthSection,
  AnalyzeFeatureSection,
  ExecSessionsSection,
  PlansSection,
  ProjectsSection,
  RecentActivitySection,
  RecentMilestonesSection,
  RecentSessionsSection,
  RepoHealthSection,
  SprintsSection,
  SuggestionsSection,
  SystemSection,
} from './sections';
import type { DashboardData } from './useDashboardData';

interface UseSectionRendererProps {
  data: DashboardData;
  dragWrap: (id: string) => { dragSection: DragSectionProps; style: { order: number } };
  expandedEra: string | null;
  onToggleEra: (era: string) => void;
  collapsedSections: Record<string, boolean>;
  onToggleSection: (name: string) => void;
  autoRefreshIntervalActive: boolean;
}

export function useSectionRenderer({
  data,
  dragWrap,
  expandedEra,
  onToggleEra,
  collapsedSections,
  onToggleSection,
  autoRefreshIntervalActive,
}: UseSectionRendererProps) {
  const renderSection = useCallback(
    (id: string): ReactNode | null => {
      const { dragSection, style } = dragWrap(id);

      const renderers: Record<string, () => ReactNode> = {
        'repo-health': () =>
          data.workspace ? (
            <RepoHealthSection workspace={data.workspace} execStats={data.execStats} dragSection={dragSection} />
          ) : null,
        'analyze-feature': () => <AnalyzeFeatureSection dragSection={dragSection} />,
        projects: () => <ProjectsSection projects={data.projects} dragSection={dragSection} onRefresh={data.refresh} />,
        plans: () => <PlansSection plans={data.plans} dragSection={dragSection} onRefresh={data.refresh} />,
        'active-dev': () => (
          <ActiveDevSection
            activeMilestones={data.activeMilestones}
            upcomingMilestones={data.upcomingMilestones}
            updateMilestoneStatus={data.updateMilestoneStatus}
            dragSection={dragSection}
          />
        ),
        sprints: () => (
          <SprintsSection sprints={data.sprints} execSessions={data.execSessions} dragSection={dragSection} />
        ),
        'exec-sessions': () => <ExecSessionsSection execSessions={data.execSessions} dragSection={dragSection} />,
        'recent-milestones': () => (
          <RecentMilestonesSection recentCompletions={data.recentCompletions} dragSection={dragSection} />
        ),
        suggestions: () => <SuggestionsSection suggestions={data.suggestions} dragSection={dragSection} />,
        'agent-health': () => <AgentHealthSection execStats={data.execStats} dragSection={dragSection} />,
        'recent-sessions': () => <RecentSessionsSection execSessions={data.execSessions} dragSection={dragSection} />,
        'milestones-era': () => (
          <MilestoneEraSection
            milestones={data.milestones}
            expandedEra={expandedEra}
            collapsed={collapsedSections['milestones']}
            onToggle={() => onToggleSection('milestones')}
            onToggleEra={onToggleEra}
            dragSection={dragSection}
            style={style}
          />
        ),
        system: () => (
          <SystemSection
            connected={data.connected}
            events={data.events}
            execSessions={data.execSessions}
            autoRefreshIntervalActive={autoRefreshIntervalActive}
            lastRefresh={data.lastRefresh}
            dragSection={dragSection}
          />
        ),
        'recent-activity': () => <RecentActivitySection logEvents={data.logEvents} dragSection={dragSection} />,
      };

      const renderer = renderers[id];
      return renderer ? renderer() : null;
    },
    [data, dragWrap, expandedEra, collapsedSections, onToggleSection, autoRefreshIntervalActive],
  );

  return { renderSection };
}
