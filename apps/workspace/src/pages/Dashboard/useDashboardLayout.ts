import { useCallback, useState } from 'react';
import { useDashboardDrag } from '../../components/dashboard/useDashboardDrag';

export function useDashboardLayout() {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('vestara-dashboard-collapsed') || '{}');
    } catch {
      return {};
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
