/**
 * VES-UI-001 T5: Agents Package Data Hook
 *
 * API first (`GET /api/agents` via `getAgents`) → `agentsPackageFixture`.
 * Never hardcoded arrays in JSX — components render this hook's output.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T5 Agent Workforce)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import { useCallback, useEffect, useState } from 'react';
import { getAgents } from '../../../lib/api';
import { type AgentsPackageAgent, agentsPackageFixture } from './packages.fixtures';

export interface UseAgentsPackageReturn {
  readonly agents: readonly AgentsPackageAgent[];
  readonly isLoading: boolean;
  readonly isLive: boolean;
  readonly refetch: () => Promise<void>;
}

function normalizeAgent(raw: {
  id?: string;
  name?: string;
  role?: string;
  status?: string;
  model?: string;
}): AgentsPackageAgent | null {
  if (!raw.id || !raw.name) return null;
  return {
    id: String(raw.id),
    name: String(raw.name),
    role: typeof raw.role === 'string' && raw.role ? raw.role : 'Agent',
    status: typeof raw.status === 'string' && raw.status ? raw.status : 'offline',
    model: typeof raw.model === 'string' && raw.model ? raw.model : 'unknown',
  };
}

export function useAgentsPackage(): UseAgentsPackageReturn {
  const [agents, setAgents] = useState<readonly AgentsPackageAgent[]>(agentsPackageFixture);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const live = await getAgents();
      if (Array.isArray(live) && live.length > 0) {
        const normalized = live
          .map((entry) => normalizeAgent(entry as Parameters<typeof normalizeAgent>[0]))
          .filter((entry): entry is AgentsPackageAgent => entry !== null);
        if (normalized.length > 0) {
          setAgents(normalized);
          setIsLive(true);
          return;
        }
      }
      setAgents(agentsPackageFixture);
      setIsLive(false);
    } catch {
      setAgents(agentsPackageFixture);
      setIsLive(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { agents, isLoading, isLive, refetch: fetchData };
}
