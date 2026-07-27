import { useState, useRef, useEffect } from 'react';
import type { Model } from './types';

interface ModelSelectorProps {
  models: Model[];
  selectedModel: string;
  onModelChange: (id: string) => void;
}

export function ModelSelector({ models, selectedModel, onModelChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = models.find((m) => m.id === selectedModel);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-zinc-500 border border-zinc-700/50 rounded-lg hover:text-zinc-300 hover:border-zinc-600 transition-colors cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
          />
        </svg>
        <span className="truncate max-w-[120px]">{selected?.name || selectedModel}</span>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-64 bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl z-50 py-1 max-h-72 overflow-y-auto backdrop-blur-xl">
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onModelChange(m.id);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 text-[12px] hover:bg-zinc-800 transition-colors flex items-center justify-between ${
                m.id === selectedModel ? 'text-amber-400' : 'text-zinc-400'
              }`}
            >
              <div>
                <div className={m.id === selectedModel ? 'text-amber-400 font-medium' : 'text-zinc-300'}>{m.name}</div>
                {m.provider && <div className="text-[10px] text-zinc-700 mt-0.5">{m.provider}</div>}
              </div>
              {m.id === selectedModel && (
                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
