export type Phase = 'boot' | 'login' | 'desktop' | 'shutdown';
export type LoginMode = 'default' | 'locked' | 'switch';

export type WinType =
  | 'workspace'
  | 'terminal'
  | 'marketplace'
  | 'files'
  | 'overview'
  | 'settings'
  | 'agent'
  | 'diagnostic'
  | 'activity'
  | 'voice';

export type WinData = {
  id: string;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  prev?: { x: number; y: number; w: number; h: number };
  type: WinType;
};

export type PackageDef = {
  id: WinType;
  title: string;
  subtitle: string;
  icon: string;
  defaultSize: { w: number; h: number };
};
