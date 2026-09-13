import { useCallback, useEffect, useState } from 'react';

export interface MorningBriefing {
  id: string;
  executedAt: string;
  createdAt: string;
  summary: string;
  details: {
    repoHealth: string;
    workspaceStatus: string;
    activity: string;
    fullContent?: string;
  };
  actor?: { id: string; name: string };
}

export function useMorningBriefing() {
  const [briefing, setBriefing] = useState<MorningBriefing | null>(null);
  const [briefings, setBriefings] = useState<MorningBriefing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch('/api/morning-briefings/latest');
      if (res.ok) {
        const data = await res.json();
        setBriefing(data.briefing ?? null);
      }
    } catch {}
  }, []);

  const fetchAll = useCallback(async (limit = 20) => {
    try {
      const res = await fetch(`/api/morning-briefings?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        setBriefings(data.briefings ?? []);
        if (data.briefings?.[0]) setBriefing(data.briefings[0]);
      }
    } catch {}
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchLatest(), fetchAll()]);
    setLoading(false);
  }, [fetchLatest, fetchAll]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { briefing, briefings, loading, refresh, fetchLatest, fetchAll };
}
