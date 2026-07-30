import { useState } from 'react';
import type { Agent, Team } from './types';

interface AgentRegistryModalProps {
  agent: Agent | null;
  teams: Team[];
  onSave: (a: Partial<Agent>) => void;
  onClose: () => void;
}

export default function AgentRegistryModal({ agent, teams, onSave, onClose }: AgentRegistryModalProps) {
  const isNewRegistration = !agent?.id || agent?.id?.startsWith('slot-') || agent?.status === 'unregistered';
  const [name, setName] = useState(agent?.name || '');
  const [role, setRole] = useState(agent?.role || 'custom');
  const [description, setDescription] = useState(agent?.description || '');
  const [provider, setProvider] = useState(agent?.provider || 'opencode');
  const [model, setModel] = useState(agent?.model || '');
  const [teamId, setTeamId] = useState(agent?.teamId || '');
  const [color, setColor] = useState(agent?.color || '#6b7280');
  const [capStr, setCapStr] = useState((agent?.capabilities || []).join(', '));
  const roles = [
    'architect', 'developer', 'verifier', 'reviewer', 'tester', 'documenter', 'analyst',
    'security-agent', 'performance-agent', 'documentation-agent', 'refactoring-agent',
    'release-agent', 'conversation', 'planner', 'frontend', 'dashboard-curator',
  ];
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name, role, description, provider, model,
      teamId: teamId || '', color,
      capabilities: capStr.split(',').map((s) => s.trim()).filter(Boolean),
    });
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-xl p-6 w-full max-w-4xl mx-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-(--vestara-text)">{isNewRegistration ? 'Register Agent' : 'Edit Agent'}</h2>
          <button onClick={onClose} className="text-zinc-600 hover:text-(--vestara-text-2) text-base cursor-pointer">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Agent name" className="w-full bg-zinc-800 border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full bg-zinc-800 border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-zinc-500 cursor-pointer">
                {roles.map((r) => (<option key={r} value={r}>{r}</option>))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this agent does..." className="w-full bg-zinc-800 border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Provider</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full bg-zinc-800 border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 outline-none cursor-pointer">
                <option value="opencode">OpenCode</option>
                <option value="local">Local</option>
                <option value="">None</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Model</label>
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. deepseek-v4-flash-free" className="w-full bg-zinc-800 border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Team</label>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="w-full bg-zinc-800 border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 outline-none cursor-pointer">
                <option value="">No team</option>
                {teams.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 bg-zinc-800 border border-(--vestara-accent-border) rounded-lg cursor-pointer shrink-0" />
                <input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1 bg-zinc-800 border border-(--vestara-accent-border) rounded-lg px-2 py-1.5 text-[10px] text-zinc-300 font-mono outline-none focus:border-zinc-500" />
              </div>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Capabilities (comma-separated)</label>
            <input value={capStr} onChange={(e) => setCapStr(e.target.value)} placeholder="e.g. code-generation, refactoring, testing" className="w-full bg-zinc-800 border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500" />
            {capStr.trim() && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {capStr.split(',').map((s) => s.trim()).filter(Boolean).map((c) => (
                  <span key={c} className="text-[8px] px-1.5 py-0.5 bg-zinc-800 text-(--vestara-text-2) rounded border border-(--vestara-accent-border)/50">{c}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2 border-t border-(--vestara-accent-border)">
            <button type="submit" className="flex-1 text-xs px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-lg hover:bg-amber-400/20 transition-colors cursor-pointer font-medium">
              {isNewRegistration ? 'Register Agent' : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose} className="text-xs px-3 py-2 bg-zinc-800 border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
