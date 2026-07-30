import { useState } from 'react';

interface TeamCreatorModalProps {
  onSave: (name: string, description: string) => void;
  onClose: () => void;
}

export default function TeamCreatorModal({ onSave, onClose }: TeamCreatorModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-xl p-6 w-full max-w-md mx-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-(--vestara-text)">New Team</h2>
          <button onClick={onClose} className="text-zinc-600 hover:text-(--vestara-text-2) text-base cursor-pointer">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" className="w-full bg-zinc-800 border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this team works on" className="w-full bg-zinc-800 border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500" />
          </div>
          <div className="flex gap-2 pt-2 border-t border-(--vestara-accent-border)">
            <button onClick={() => onSave(name, description)} disabled={!name.trim()} className="flex-1 text-xs px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-lg hover:bg-amber-400/20 disabled:opacity-30 transition-colors cursor-pointer font-medium">Create Team</button>
            <button onClick={onClose} className="text-xs px-3 py-2 bg-zinc-800 border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
