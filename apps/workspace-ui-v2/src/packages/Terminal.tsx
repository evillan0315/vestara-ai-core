import { TERMINAL_LINES, TERMINAL_PROMPT, type TranscriptMargin, type TranscriptTone } from './terminal.fixtures';

const TONE_CLASS: Record<TranscriptTone, string> = {
  muted: 'text-[var(--vestara-text-shell-muted)]',
  secondary: 'text-[var(--vestara-text-shell-secondary)]',
  accent: 'text-[var(--vestara-accent-shell)]',
};

const MARGIN_CLASS: Record<TranscriptMargin, string> = {
  none: '',
  tight: ' mt-1',
  loose: ' mt-3',
};

export function TerminalPkg() {
  return (
    <div className="p-4 font-mono text-[length:var(--vestara-font-size-label)] leading-[1.6] bg-[var(--vestara-surface-shell-canvas)] min-h-full">
      {TERMINAL_LINES.map((l) => (
        <div key={l.text} className={`${TONE_CLASS[l.tone]}${MARGIN_CLASS[l.margin]}`}>
          {l.text}
        </div>
      ))}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-[var(--vestara-accent-shell)]">{TERMINAL_PROMPT.marker}</span>
        <span className="text-[var(--vestara-status-shell-info)]">{TERMINAL_PROMPT.host}</span>
        <span className="text-[var(--vestara-text-shell-muted)]"> {TERMINAL_PROMPT.branch}</span>
        <span className="w-2 h-3 bg-[var(--vestara-text-shell-primary)] animate-pulse inline-block ml-1" />
      </div>
    </div>
  );
}
