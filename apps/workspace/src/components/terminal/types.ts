export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export type ProcessStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface TerminalSession {
  id: string;
  name: string;
  shell: string;
  cwd: string;
  status: SessionStatus;
  processStatus: ProcessStatus;
  processId?: number;
  exitCode?: number;
  createdAt: number;
}

export interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  cursorStyle: 'block' | 'underline' | 'bar';
  cursorBlink: boolean;
  scrollback: number;
}

export const DEFAULT_SETTINGS: TerminalSettings = {
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  lineHeight: 1.35,
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 10000,
};
