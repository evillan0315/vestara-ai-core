// Terminal transcript fixture — static build log + prompt segments.
// Pattern: apps/workspace/src/features/overview/overview.fixtures.ts
// (fixture-first fallback; no arrays in JSX).

export type TranscriptTone = 'muted' | 'secondary' | 'accent';

export type TranscriptMargin = 'none' | 'tight' | 'loose';

export interface TranscriptLine {
  tone: TranscriptTone;
  margin: TranscriptMargin;
  text: string;
}

export const TERMINAL_LINES: TranscriptLine[] = [
  {
    tone: 'muted',
    margin: 'none',
    text: '$ vestara build --final 112 --clean --teal-logo --small-header --system-menu',
  },
  { tone: 'secondary', margin: 'tight', text: '[1/6] Shell 7 — VestaraShell, TopBar 32px, SystemMenu ✓' },
  { tone: 'secondary', margin: 'none', text: '[2/6] Logo Teal variant #2de8c3 bound to wallpaper giant planet ✓' },
  { tone: 'secondary', margin: 'none', text: '[3/6] VestaraWindow draggable shell extracted ✓' },
  { tone: 'secondary', margin: 'none', text: '[4/6] Boot → Login → Desktop flow ✓' },
  { tone: 'secondary', margin: 'none', text: '[5/6] Dock 48px small clean • DesktopIcons ✓' },
  {
    tone: 'secondary',
    margin: 'none',
    text: '[6/6] Packages wired: terminal, activity, marketplace, agent, diagnostic, overview, settings, files ✓',
  },
  { tone: 'accent', margin: 'loose', text: '✔ Build succeeded — workspace-ui-v2 ready' },
];

export const TERMINAL_PROMPT = {
  marker: '➜',
  host: 'vestara-platform',
  branch: 'git:(main)',
} as const;
