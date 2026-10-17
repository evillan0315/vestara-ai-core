import { useCallback, useEffect, useRef, useState } from 'react';

export type Phase = 0 | 1 | 2 | 3 | 4 | 5;

export function useBootSequence() {
  const [phase, setPhase] = useState<Phase>(0);
  const [hashText, setHashText] = useState('');
  const [progress, setProgress] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [paused, setPaused] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showExtManager, setShowExtManager] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const replay = useCallback(() => {
    clearTimers();
    setPhase(0);
    setHashText('');
    setProgress(0);
    setActiveIndex(0);
    setCompletedSteps([]);
    setPaused(false);
    setShowRecovery(false);
    setShowExtManager(false);
    setReplayKey((k) => k + 1);
  }, [clearTimers]);

  // Keyboard controls per spec
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (e.key === 'Escape') {
        setShowRecovery((v) => !v);
        setShowExtManager(false);
      }
      if (e.key.toLowerCase() === 'e' && !e.metaKey && !e.ctrlKey) {
        setShowExtManager((v) => !v);
        setShowRecovery(false);
      }
      if (e.key.toLowerCase() === 'r') replay();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [replay]);

  return {
    phase,
    setPhase,
    hashText,
    setHashText,
    progress,
    setProgress,
    activeIndex,
    setActiveIndex,
    completedSteps,
    setCompletedSteps,
    paused,
    setPaused,
    showRecovery,
    setShowRecovery,
    showExtManager,
    setShowExtManager,
    replayKey,
    replay,
    clearTimers,
    timers,
  };
}
