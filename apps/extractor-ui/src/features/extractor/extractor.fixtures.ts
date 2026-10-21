/** Local fixtures — used until the mock/API extraction endpoint exists. Never inline arrays in JSX. */

export type ComponentIcon = 'file' | 'button' | 'card' | 'code' | 'markdown';

export interface ComponentFile {
  id: string;
  name: string;
  path: string;
  size: string;
  status: 'live' | 'idle';
  icon: ComponentIcon;
}

export interface RecentExtraction {
  name: string;
  time: string;
  size: string;
}

export interface PropRow {
  name: string;
  type: string;
  defaultValue: string;
}

export const componentFiles: ComponentFile[] = [
  { id: 'fileicon', name: 'fileicon', path: 'components/fileicon.tsx', size: '2.1KB', status: 'live', icon: 'file' },
  { id: 'buttons', name: 'buttons', path: 'components/buttons.tsx', size: '1.4KB', status: 'live', icon: 'button' },
  { id: 'card', name: 'card', path: 'components/card.tsx', size: '3.8KB', status: 'idle', icon: 'card' },
  { id: 'snippet', name: 'snippet', path: 'components/snippet.tsx', size: '0.9KB', status: 'idle', icon: 'code' },
  { id: 'readme', name: 'readme', path: 'docs/readme.md', size: '4.2KB', status: 'idle', icon: 'markdown' },
];

export const recentExtractions: RecentExtraction[] = [
  { name: 'vestara_market_v3.html', time: '2m ago', size: '342KB' },
  { name: 'landing_tokens.html', time: '18m ago', size: '128KB' },
  { name: 'dashboard_dark.html', time: '1h ago', size: '89KB' },
];

export const initialProps: PropRow[] = [
  { name: 'components', type: 'ReactNode[]', defaultValue: '[]' },
  { name: 'vars', type: 'Record<string, string>', defaultValue: '{}' },
];

export const headerBadges: string[] = ['Bundle 342KB', 'CSS 18KB', '12 reference components'];

export const referenceNote =
  'Reference examples — drop artifact.html below to replace with live extraction. Nothing here is presented as parsed output.';

export const extractorTip =
  'This inspector is local. Props are inferred from the artifact HTML and never sent to a server. Switch preview modes to see original vs cleaned markup.';
