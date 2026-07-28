import { useEffect, useState } from 'react';

export interface UnderstandingData {
  id: string;
  identity: {
    name: string;
    primaryLanguage: string;
    languageConfidence: number;
    framework: string | null;
    architecture: string;
  };
  architecture: {
    kind: string;
    entryPoints: readonly { path: string; role: string; confidence: number }[];
    dependencyCycles: readonly string[][];
    layers: readonly { packageName: string; layer: string; confidence: number }[];
  };
  maturity: {
    level: string;
    healthScore: number;
    testCoverage: string;
    documentationLevel: string;
    codeQuality: string;
    risks: readonly { category: string; severity: string; summary: string }[];
  };
  activity: {
    currentMilestone: string | null;
    recentChanges: readonly { description: string; author: string; timestamp: string }[];
    activeBranches: readonly string[];
    uncommittedWork: boolean;
    stalledSince: string | null;
  };
  memory: {
    recentDecisions: readonly { title: string; summary: string; timestamp: string }[];
    keyFacts: readonly string[];
    memoryCount: number;
  };
  state: {
    status: string;
    isIndexed: boolean;
    indexFreshness: string;
    isCached: boolean;
  };
  summary: string;
}

export function useUnderstanding() {
  const [data, setData] = useState<UnderstandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/understanding');
        if (!res.ok) {
          if (res.status === 503) {
            if (!cancelled) setLoading(true);
            return;
          }
          throw new Error(`API error: ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load understanding');
          setLoading(false);
        }
      }
    }

    load();
    const interval = setInterval(load, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { data, loading, error };
}
