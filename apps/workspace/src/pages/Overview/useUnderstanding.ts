import { useCallback, useEffect, useRef, useState } from 'react';

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
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/understanding');
      if (!res.ok) {
        if (res.status === 503) {
          if (!cancelledRef.current) setLoading(true);
          return;
        }
        throw new Error(`API error: ${res.status}`);
      }
      const json = await res.json();
      if (!cancelledRef.current) {
        setData(json);
        setLoading(false);
        setError(null);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load understanding');
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    const interval = setInterval(load, 10000);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [load]);

  return { data, loading, error, refetch: load };
}
