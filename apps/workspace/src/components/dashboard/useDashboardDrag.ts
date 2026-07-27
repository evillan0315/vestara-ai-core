import { useCallback, useState } from 'react';

const DEFAULT_ORDER = [
  'repo-health',
  'analyze-feature',
  'projects',
  'active-dev',
  'sprints',
  'exec-sessions',
  'recent-milestones',
  'suggestions',
  'agent-health',
  'recent-sessions',
  'milestones-era',
  'system',
  'recent-activity',
];

const DEFAULT_COLUMNS: Record<string, 'left' | 'right'> = {
  'repo-health': 'left',
  'analyze-feature': 'left',
  projects: 'left',
  'active-dev': 'left',
  sprints: 'left',
  'exec-sessions': 'left',
  'recent-milestones': 'left',
  suggestions: 'left',
  'agent-health': 'right',
  'recent-sessions': 'right',
  'milestones-era': 'right',
  system: 'right',
  'recent-activity': 'right',
};

export function useDashboardDrag() {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('vestara-dash-order') || '[]') as string[];
      if (saved.length > 0) return saved;
    } catch {}
    return [...DEFAULT_ORDER];
  });
  const [sectionColumns, setSectionColumns] = useState<Record<string, 'left' | 'right'>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('vestara-dash-columns') || '{}');
      if (Object.keys(saved).length > 0) return saved;
    } catch {}
    return { ...DEFAULT_COLUMNS };
  });

  const isLeftFn = useCallback((id: string) => sectionColumns[id] !== 'right', [sectionColumns]);

  const getIdx = useCallback(
    (id: string) => {
      const idx = sectionOrder.indexOf(id);
      return idx === -1 ? 99 : idx;
    },
    [sectionOrder],
  );

  const persist = (order: string[], columns: Record<string, 'left' | 'right'>) => {
    setSectionOrder(order);
    setSectionColumns(columns);
    localStorage.setItem('vestara-dash-order', JSON.stringify(order));
    localStorage.setItem('vestara-dash-columns', JSON.stringify(columns));
  };

  const dragHandle = useCallback(
    (id: string) => ({
      onDragStart: (e: React.DragEvent) => {
        setDragId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
      },
      onDragEnd: () => {
        setDragId(null);
        setDragOverId(null);
      },
    }),
    [],
  );

  const droppable = useCallback(
    (targetId: string) => ({
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        if (targetId !== dragId) setDragOverId(targetId);
      },
      onDragLeave: () => setDragOverId(null),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const src = e.dataTransfer.getData('text/plain');
        setDragId(null);
        setDragOverId(null);
        if (!src || src === targetId) return;

        const order = [...sectionOrder];
        const columns = { ...sectionColumns };
        let si = order.indexOf(src);
        const di = order.indexOf(targetId);

        // If src not in order, add it
        if (si === -1) {
          order.push(src);
          si = order.length - 1;
        }
        if (di === -1) return;

        // If dropping on a different column, move the section to that column
        if (columns[src] && columns[targetId] && columns[src] !== columns[targetId]) {
          columns[src] = columns[targetId];
        }

        // Reorder
        const next = [...order];
        next.splice(si, 1);
        const adjustedDi = order.indexOf(targetId); // recalc after splice
        next.splice(adjustedDi > si ? adjustedDi - 1 : adjustedDi, 0, src);

        persist(next, columns);
      },
    }),
    [dragId, sectionOrder, sectionColumns],
  );

  return { dragId, dragOverId, sectionOrder, getIdx, isLeft: isLeftFn, dragHandle, droppable };
}
