import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import DriveFileRenameOutlineRoundedIcon from '@mui/icons-material/DriveFileRenameOutlineRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OpenCodeSessionView } from '../../lib/opencode';

interface OpenCodeSessionActionsProps {
  session: OpenCodeSessionView;
  onRename: (title: string) => void;
  onDelete: () => void;
  onAbort?: () => void;
  aborted?: boolean;
}

export function OpenCodeSessionActions({ session, onRename, onDelete, onAbort, aborted }: OpenCodeSessionActionsProps) {
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(session.title);

  const canAbort = session.status === 'active' && !aborted;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => navigate(`/opencode/sessions/${encodeURIComponent(session.id)}`)}
        title="Open session"
        className="p-1 rounded text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-zinc-800 cursor-pointer"
      >
        <OpenInNewRoundedIcon fontSize="inherit" className="text-[14px]" />
      </button>
      {renaming ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = draft.trim();
            if (trimmed && trimmed !== session.title) onRename(trimmed);
            setRenaming(false);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Rename session"
            className="text-[10px] px-1.5 py-0.5 bg-zinc-900 border border-(--vestara-accent-border) rounded text-(--vestara-text) w-28"
          />
          <button type="submit" className="text-[10px] text-(--vestara-green) cursor-pointer px-1">
            Save
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            className="text-[10px] text-(--vestara-text-muted) cursor-pointer px-1"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(session.title);
            setRenaming(true);
          }}
          title="Rename session"
          className="p-1 rounded text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-zinc-800 cursor-pointer"
        >
          <DriveFileRenameOutlineRoundedIcon fontSize="inherit" className="text-[14px]" />
        </button>
      )}
      {canAbort && onAbort && (
        <button
          type="button"
          onClick={onAbort}
          title="Abort running session"
          className="p-1 rounded text-amber-400 hover:text-amber-300 hover:bg-zinc-800 cursor-pointer"
        >
          <StopCircleRoundedIcon fontSize="inherit" className="text-[14px]" />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        title="Delete session"
        className="p-1 rounded text-(--vestara-text-2) hover:text-(--vestara-red) hover:bg-zinc-800 cursor-pointer"
      >
        <DeleteRoundedIcon fontSize="inherit" className="text-[14px]" />
      </button>
    </div>
  );
}
