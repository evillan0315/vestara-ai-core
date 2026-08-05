import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { useNavigate } from 'react-router-dom';

export function OpenCodeSessionEmptyState({ offline }: { offline?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="p-6 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
      {offline ? (
        <>
          <p className="text-[12px] text-(--vestara-text-muted)">OpenCode is offline.</p>
          <p className="text-[10px] text-(--vestara-text-dim) mt-1">
            Sessions cannot be listed or created until the governed runtime is reachable.
          </p>
        </>
      ) : (
        <>
          <p className="text-[12px] text-(--vestara-text-muted)">No OpenCode sessions yet.</p>
          <p className="text-[10px] text-(--vestara-text-dim) mt-1">
            Create a session to start governed engineering work.
          </p>
          <button
            type="button"
            onClick={() => navigate('/opencode/sessions/new')}
            className="mt-3 inline-flex items-center gap-1 text-[10px] px-2.5 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-md text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer"
          >
            <AddRoundedIcon fontSize="inherit" /> New Session
          </button>
        </>
      )}
    </div>
  );
}
