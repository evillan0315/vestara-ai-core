import { useState } from 'react';
import { VestaraModal } from '../../components/ui/VestaraModal';

interface TeamCreatorModalProps {
  onSave: (name: string, description: string) => void;
  onClose: () => void;
}

export default function TeamCreatorModal({ onSave, onClose }: TeamCreatorModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const inputClass =
    'w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-(--vestara-text-2) placeholder:text-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active) transition-colors';
  const labelClass = 'text-[10px] text-(--vestara-text-muted) uppercase tracking-wider block mb-1';
  return (
    <VestaraModal onClose={onClose} className="max-w-md">
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-(--vestara-text)">New Team</h2>
          <button onClick={onClose} className="text-(--vestara-text-dim) hover:text-(--vestara-text-2) text-base cursor-pointer">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this team works on" className={inputClass} />
          </div>
          <div className="flex gap-2 pt-2 border-t border-(--vestara-accent-border)">
            <button onClick={() => onSave(name, description)} disabled={!name.trim()} className="flex-1 text-xs px-3 py-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border-active) text-(--vestara-accent-text) rounded-lg hover:bg-(--vestara-accent-border)/20 disabled:opacity-30 transition-colors cursor-pointer font-medium">Create Team</button>
            <button onClick={onClose} className="text-xs px-3 py-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:text-(--vestara-text) transition-colors cursor-pointer">Cancel</button>
          </div>
        </div>
      </div>
    </VestaraModal>
  );
}
