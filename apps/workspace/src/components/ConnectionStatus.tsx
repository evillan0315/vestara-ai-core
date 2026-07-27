import { useConnection } from '../lib/connection';

export default function ConnectionStatus() {
  const { api, ws, lastError, refresh } = useConnection();

  const apiOk = api === 'ok';
  const wsOk = ws === 'open';

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        onClick={refresh}
        title={lastError || 'API health'}
        className="flex items-center gap-1.5 px-2 py-1 rounded border bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${api === 'checking' ? 'bg-zinc-600' : apiOk ? 'bg-green-400' : 'bg-red-400'}`}
        />
        <span className="text-zinc-500">API {api === 'checking' ? '…' : apiOk ? '✓' : '○'}</span>
      </button>
      <div className="flex items-center gap-1.5 px-2 py-1 rounded border bg-zinc-900/50 border-zinc-800">
        <span
          className={`w-1.5 h-1.5 rounded-full ${wsOk ? 'bg-green-400' : ws === 'connecting' ? 'bg-amber-400' : 'bg-red-400'}`}
        />
        <span className="text-zinc-500">WS {wsOk ? '✓' : ws === 'connecting' ? '…' : '○'}</span>
      </div>
    </div>
  );
}
