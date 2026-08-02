/**
 * WorkflowReplay — temporal replay of a workflow from the event store.
 * Scrub the sequence timeline, step ◀ / ▶, or play at 1× / 2× / 4× to watch
 * how stage, agent, approval, verification, and change state evolved.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { workflowApi, type WorkflowProjection } from '../../lib/workflow';
import { WorkflowRail } from './WorkflowRail';

const SPEEDS = [1, 2, 4] as const;

export function WorkflowReplay({ threadId }: { threadId: string }) {
  const [sequence, setSequence] = useState(0);
  const [maxSequence, setMaxSequence] = useState(0);
  const [projection, setProjection] = useState<WorkflowProjection | null>(null);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [playing, setPlaying] = useState(false);
  const loadSeqRef = useRef(0);

  const load = useCallback(
    async (target: number) => {
      loadSeqRef.current = Math.max(loadSeqRef.current, target);
      const data = await workflowApi.at(threadId, target);
      if (!data) return;
      if (loadSeqRef.current >= target) {
        setProjection(data.projection);
        setMaxSequence(data.maxSequence);
        setSequence(Math.min(target, data.maxSequence));
      }
    },
    [threadId],
  );

  useEffect(() => {
    void load(Number.MAX_SAFE_INTEGER);
  }, [load]);

  const seek = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(target, maxSequence));
      setSequence(clamped);
      void load(clamped);
    },
    [load, maxSequence],
  );

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      setSequence((previous) => {
        const next = previous + speed;
        if (next >= maxSequence) {
          setPlaying(false);
          void load(maxSequence);
          return maxSequence;
        }
        void load(next);
        return next;
      });
    }, 1000 / speed);
    return () => clearTimeout(timer);
  }, [playing, speed, sequence, maxSequence, load]);

  return (
    <div className="mt-2 p-2 bg-black/30 border border-(--vestara-accent-border)/50 rounded-md">
      <div className="flex items-center gap-2 flex-wrap text-[9px] text-(--vestara-text-muted) mb-1.5">
        <span className="uppercase tracking-wider">Replay</span>
        <span>
          seq {sequence}/{maxSequence}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => seek(sequence - 1)}
            disabled={sequence <= 0}
            className="text-[9px] px-1.5 py-0.5 rounded bg-(--vestara-accent-bg) border border-(--vestara-accent-border) disabled:opacity-30 cursor-pointer disabled:cursor-default"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={() => setPlaying((current) => !current)}
            className="text-[9px] px-1.5 py-0.5 rounded bg-(--vestara-accent-bg) border border-(--vestara-accent-border) cursor-pointer"
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            onClick={() => seek(sequence + 1)}
            disabled={sequence >= maxSequence}
            className="text-[9px] px-1.5 py-0.5 rounded bg-(--vestara-accent-bg) border border-(--vestara-accent-border) disabled:opacity-30 cursor-pointer disabled:cursor-default"
          >
            ▶
          </button>
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSpeed(value)}
              className={`text-[9px] px-1.5 py-0.5 rounded border cursor-pointer ${
                speed === value
                  ? 'bg-(--vestara-accent-bg) border-(--vestara-accent-border-active) text-(--vestara-accent-text)'
                  : 'bg-(--vestara-accent-bg) border-(--vestara-accent-border) text-(--vestara-text-muted)'
              }`}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(1, maxSequence)}
        value={sequence}
        onChange={(event) => seek(Number(event.target.value))}
        className="w-full accent-(--vestara-accent)"
        aria-label="Replay timeline"
      />
      {projection && <WorkflowRail workflow={projection} />}
    </div>
  );
}
