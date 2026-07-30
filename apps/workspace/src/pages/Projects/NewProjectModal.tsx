interface NewProjectModalProps {
  open: boolean;
  name: string;
  description: string;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

export default function NewProjectModal({ open, name, description, onNameChange, onDescriptionChange, onCreate, onClose }: NewProjectModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg w-full max-w-md mx-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-(--vestara-accent-border)">
          <h2 className="text-sm font-semibold text-(--vestara-text) flex items-center gap-2">
            <span className="text-accent">+</span> New Project
          </h2>
          <button onClick={onClose} className="text-(--vestara-text-muted) hover:text-(--vestara-text) cursor-pointer text-sm">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[9px] text-(--vestara-text-2) uppercase tracking-widest mb-1 block">Name</label>
            <input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Project name..." className="w-full bg-zinc-800 border border-(--vestara-accent-border) rounded px-2 py-1.5 text-sm text-(--vestara-text) outline-none focus:border-accent" onKeyDown={(e) => e.key === 'Enter' && onCreate()} />
          </div>
          <div>
            <label className="text-[9px] text-(--vestara-text-2) uppercase tracking-widest mb-1 block">Description</label>
            <input value={description} onChange={(e) => onDescriptionChange(e.target.value)} placeholder="Optional description..." className="w-full bg-zinc-800 border border-(--vestara-accent-border) rounded px-2 py-1.5 text-sm text-(--vestara-text) outline-none focus:border-accent" />
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t border-(--vestara-accent-border)">
          <button onClick={onCreate} disabled={!name.trim()} className="flex-1 text-[10px] px-3 py-1.5 accent-btn rounded-lg disabled:opacity-30 cursor-pointer">Create</button>
          <button onClick={onClose} className="text-[10px] px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) cursor-pointer">Cancel</button>
        </div>
      </div>
    </div>
  );
}
