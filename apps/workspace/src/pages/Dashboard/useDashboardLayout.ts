import { useCallback, useState } from 'react';
import { DEFAULT_ORDER, useDashboardDrag } from '../../components/dashboard/useDashboardDrag';

const DEFAULT_COLLAPSED_THRESHOLD = 3;

export function useDashboardLayout() {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('vestara-dashboard-collapsed') || '{}');
      const defaults: Record<string, boolean> = {};
      DEFAULT_ORDER.forEach((id, i) => {
        if (i >= DEFAULT_COLLAPSED_THRESHOLD) {
          defaults[id] = stored[id] !== undefined ? stored[id] : true;
        }
      });
      return { ...defaults, ...stored };
    } catch {
      const defaults: Record<string, boolean> = {};
      DEFAULT_ORDER.forEach((id, i) => {
        if (i >= DEFAULT_COLLAPSED_THRESHOLD) defaults[id] = true;
      });
      return defaults;
    }
  });

  const [sectionVisibility, setSectionVisibility] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('vestara-dash-visibility') || '{}');
    } catch {
      return {};
    }
  });

  const [expandedEra, setExpandedEra] = useState<string | null>(null);

  const toggleSection = useCallback((name: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      localStorage.setItem('vestara-dashboard-collapsed', JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    setSectionVisibility((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem('vestara-dash-visibility', JSON.stringify(next));
      return next;
    });
  }, []);

  const drag = useDashboardDrag();

  return {
    collapsedSections,
    sectionVisibility,
    expandedEra,
    setExpandedEra,
    toggleSection,
    toggleVisibility,
    ...drag,
  };
}
