// Local token DEFINITION site — canonical authority is
// packages/ui-tokens/src/tokens.ts (COLOR.shell). Values mirror it so the
// standalone Vite app renders identically without a build-time dep.
export const TOKENS = {
  bg: '#0a1214',
  surface: '#0d191b',
  surface2: '#111e20',
  surface3: '#132528',
  border: '#1a3a3d',
  accent: '#2de8c3',
  text: '#c8ddd9',
  muted: '#8ab3ad',
  faint: '#5a7a78',
  danger: '#ff5a5a',
  success: '#4ade80',
  warning: '#facc15',
} as const;

export const BOOT_LOGS = [
  '[ OK ] Mounted vestara-corefs v2.0.0',
  '[ OK ] Teal surface driver initialized',
  '[ OK ] Wired package registry sync',
  '[ OK ] Agent mesh 7 nodes ready',
  '[ OK ] Draggable workspace compositor',
  '[ OK ] Shell header 32px clean mode',
  '[ OK ] V logo teal gradient bound',
  '[ OK ] Desktop vignette loaded',
];

export const WORKSPACE = 'vestara-platform';
