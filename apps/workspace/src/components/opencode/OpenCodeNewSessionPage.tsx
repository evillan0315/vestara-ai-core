import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type OpenCodeAgentSummary,
  type OpenCodeProject,
  type OpenCodeProviderSummary,
  openCodeApi,
} from '../../lib/opencode';
import { type OpenCodeNewSessionValues, OpenCodeSessionForm } from './OpenCodeSessionForm';

export function OpenCodeNewSessionPage() {
  const navigate = useNavigate();
  const [project, setProject] = useState<OpenCodeProject | null>(null);
  const [agents, setAgents] = useState<OpenCodeAgentSummary[]>([]);
  const [providers, setProviders] = useState<OpenCodeProviderSummary[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    const [health, projectRes, agentsRes, providersRes] = await Promise.all([
      openCodeApi.health(),
      openCodeApi.project(),
      openCodeApi.agents(),
      openCodeApi.providers(),
    ]);
    setOffline(!health?.reachable);
    setProject(projectRes?.current ?? null);
    setAgents(agentsRes?.agents ?? []);
    setProviders(providersRes?.providers ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const handleSubmit = async (values: OpenCodeNewSessionValues) => {
    setPending(true);
    setError(null);
    const result = await openCodeApi.createSession({
      title: values.title,
      agent: values.agent,
      model: values.providerId ? { providerId: values.providerId, modelId: values.modelId } : undefined,
      directory: project?.worktree,
    });
    setPending(false);
    if (!result) {
      setError('Session creation failed. The runtime may be offline or the request was rejected.');
      return;
    }
    navigate(`/opencode/sessions/${encodeURIComponent(result.session.id)}`);
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={() => navigate('/opencode/sessions')}
          className="p-1 rounded text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-zinc-800 cursor-pointer"
          aria-label="Back to sessions"
        >
          <ArrowBackRoundedIcon fontSize="inherit" className="text-[16px]" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">New Session</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">
            Create a governed OpenCode session bound to the current workspace
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-center text-[11px] text-(--vestara-text-muted) animate-pulse">
          Loading execution context…
        </div>
      ) : (
        <OpenCodeSessionForm
          project={project}
          agents={agents}
          providers={providers}
          offline={offline}
          pending={pending}
          error={error}
          onSubmit={(values) => void handleSubmit(values)}
          onCancel={() => navigate('/opencode/sessions')}
        />
      )}
    </div>
  );
}
