/**
 * Instruction Box — natural-language multi-step browser commands.
 *
 * Turns free-form instructions ("log in to github.com as alice with s3cret",
 * "search for monitors on example.com") into BrowserTask plans executed by the
 * governed runtime. Steps and viewport frames stream back over the WS while
 * the task runs; the box stays disabled until the POST /api/browser/instruction
 * response finalizes the run.
 */

import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { useState } from 'react';

export interface InstructionBoxProps {
  disabled: boolean;
  onRun(text: string): Promise<{ ok: boolean; message?: string }>;
}

const EXAMPLES = [
  'Go to example.com',
  'Log in to github.com as alice with s3cret',
  'Search for monitors on example.com',
  'Shop for headphones on example.com',
];

export function InstructionBox({ disabled, onRun }: InstructionBoxProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const submit = async (value: string) => {
    const instruction = value.trim();
    if (!instruction || busy || disabled) return;
    setBusy(true);
    setStatusLine('Planning and executing…');
    try {
      const result = await onRun(instruction);
      setStatusLine(result.ok ? '✓ Done' : (result.message ?? 'Failed'));
      if (result.ok) setText('');
    } finally {
      setBusy(false);
    }
  };

  const blocked = disabled || busy;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-(--vestara-accent-border) bg-zinc-900 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AutoAwesomeRoundedIcon fontSize="small" className="text-(--vestara-accent-text)" />
          <h2 className="text-sm font-semibold text-(--vestara-text)">Instructions</h2>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            busy
              ? 'bg-(--vestara-accent-bg) text-(--vestara-accent-text)'
              : 'bg-zinc-800 text-(--vestara-text-muted)'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${busy ? 'bg-(--vestara-accent-text) animate-pulse' : 'bg-(--vestara-text-dim)'}`}
          />
          {busy ? 'Running' : 'Idle'}
        </span>
      </div>

      {/* Textarea + run */}
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit(text);
            }
          }}
          placeholder="Type an instruction: log in, search, buy, visit…"
          disabled={blocked}
          rows={2}
          aria-label="Browser instruction"
          className="min-w-0 flex-1 resize-none rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-(--vestara-text-2) outline-none transition-colors placeholder:text-(--vestara-text-dim) focus:border-(--vestara-accent-border) disabled:cursor-not-allowed disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() => void submit(text)}
          disabled={blocked || !text.trim()}
          aria-label="Run instruction"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-(--vestara-accent-bg) px-3 text-xs font-medium text-(--vestara-accent-text) transition-colors hover:bg-(--vestara-accent-border) disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendRoundedIcon fontSize="small" />
          Run
        </button>
      </div>

      {/* Example chips */}
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => void submit(example)}
            disabled={blocked}
            className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-(--vestara-text-muted) transition-colors hover:border-(--vestara-accent-border) hover:text-(--vestara-accent-text) disabled:cursor-not-allowed disabled:opacity-40"
          >
            {example}
          </button>
        ))}
      </div>

      {statusLine && <p className="text-[11px] text-(--vestara-text-muted)">{statusLine}</p>}
    </div>
  );
}