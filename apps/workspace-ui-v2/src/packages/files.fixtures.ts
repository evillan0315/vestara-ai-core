// Files fixture — favourites rail + directory rows.
// Pattern: apps/workspace/src/features/overview/overview.fixtures.ts.

export const FILE_FAVOURITES = ['Desktop', 'Documents', 'Projects', 'Media'] as const;

export interface ShellFileRow {
  name: string;
  kind: 'folder' | 'file';
  detail: string;
}

export const FILE_ROWS: ShellFileRow[] = [
  { name: 'vestara-platform', kind: 'folder', detail: 'Project • 7 agents' },
  { name: 'Desktop', kind: 'folder', detail: '5 icons' },
  { name: 'Documents', kind: 'folder', detail: 'Shell notes' },
  { name: 'wallpaper-teal-giant-planet-mountain-lake.png', kind: 'file', detail: '222 KB • Image' },
  { name: 'BOOT_LOGS.txt', kind: 'file', detail: '8 lines • Text' },
  { name: 'activity-snapshot.json', kind: 'file', detail: '50 records • JSON' },
];
