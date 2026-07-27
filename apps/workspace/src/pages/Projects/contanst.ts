export const STATUS_COLORS: Record<string, string> = {
  planning: '#f59e0b',
  active: '#10b981',
  on_hold: '#ef4444',
  completed: '#3b82f6',
  cancelled: '#6b7280',
};
export const PRIORITY_COLORS: Record<string, string> = {
  low: '#6b7280',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};
export const STATUS_OPTIONS = ['backlog', 'ready', 'in_progress', 'review', 'done'];
const SEARCH_ICONS: Record<string, string> = {
  backlog: '○',
  ready: '◔',
  in_progress: '◐',
  review: '◗',
  done: '●',
};
export const BOARD_COLUMNS = [
  { key: 'backlog', label: 'Backlog', icon: '○', color: '#52525b' },
  { key: 'ready', label: 'Ready', icon: '◔', color: '#3b82f6' },
  { key: 'in_progress', label: 'In Progress', icon: '◐', color: '#f59e0b' },
  { key: 'review', label: 'Review', icon: '◗', color: '#a78bfa' },
  { key: 'done', label: 'Done', icon: '●', color: '#10b981' },
];
