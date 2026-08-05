import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { useEffect, useState } from 'react';

export type OpenCodeComposerStatus =
  | 'ready'
  | 'submitting'
  | 'submitted'
  | 'failed'
  | 'disabled-running'
  | 'disabled-terminal';

interface OpenCodeMessageComposerProps {
  status: OpenCodeComposerStatus;
  error?: string | null;
  onSubmit: (text: string) => void;
}

export function OpenCodeMessageComposer({ status, error, onSubmit }: OpenCodeMessageComposerProps) {
  const [draft, setDraft] = useState('');
  const disabled = status === 'submitting' || status === 'disabled-running' || status === 'disabled-terminal';

  useEffect(() => {
    if (status === 'submitted') setDraft('');
  }, [status]);

  const submit = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSubmit(text);
  };

  const hint =
    status === 'disabled-running'
      ? 'Session is running — send again after it completes.'
      : status === 'disabled-terminal'
        ? 'Session is terminal and cannot accept messages.'
        : 'Ctrl/Cmd+Enter to send';

  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={disabled}
        rows={2}
        placeholder={status === 'disabled-terminal' ? 'Session is terminal' : 'Send a follow-up message…'}
        className="w-full text-[12px] px-2.5 py-2 bg-zinc-900 border border-(--vestara-accent-border) rounded-md text-(--vestara-text) placeholder:text-(--vestara-text-dim) resize-y disabled:opacity-50"
      />
      {error && <p className="text-[10px] text-(--vestara-red) mt-1">{error}</p>}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[9px] text-(--vestara-text-dim)">{hint}</span>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || draft.trim().length === 0}
          className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text) hover:bg-(--vestara-accent) cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <SendRoundedIcon fontSize="inherit" /> {status === 'submitting' ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
