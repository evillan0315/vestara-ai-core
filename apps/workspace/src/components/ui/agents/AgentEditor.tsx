import { useEffect, useRef, useState } from 'react';
import { ProviderModelPicker } from './ProviderModelPicker';
import { buttonPrimaryClass, buttonSecondaryClass, errorClass, inputClass, labelClass } from './formClasses';
import type { AgentIdentity, AgentSaveData, TeamRef } from './types';

export interface AgentEditorProps {
  agent?: AgentIdentity;
  teams?: TeamRef[];
  roleSuggestions?: string[];
  onSave: (data: AgentSaveData) => Promise<void>;
  onCancel: () => void;
}

/**
 * Agent create/edit form content.
 *
 * NOT coupled to modal or drawer — composes inside any presentation shell.
 *
 * Usage:
 *   <VestaraModal onClose={onClose}>
 *     <AgentEditor onSave={handleCreate} onCancel={onClose} />
 *   </VestaraModal>
 *
 *   <Drawer open={open} onClose={onClose}>
 *     <AgentEditor agent={agent} onSave={handleSave} onCancel={onClose} />
 *   </Drawer>
 */
export function AgentEditor({ agent, teams, roleSuggestions, onSave, onCancel }: AgentEditorProps) {
  const isNew = !agent?.id;
  const [name, setName] = useState(agent?.name || '');
  const [role, setRole] = useState(agent?.role || '');
  const [description, setDescription] = useState(agent?.description || '');
  const [provider, setProvider] = useState(agent?.provider ?? '');
  const [model, setModel] = useState(agent?.model ?? '');
  const [capabilities, setCapabilities] = useState((agent?.capabilities || []).join(', '));
  const [color, setColor] = useState(agent?.color || '#6b7280');
  const [teamId, setTeamId] = useState(agent?.teamId || '');

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const formRef = useRef<HTMLFormElement>(null);

  // Reset form when agent prop changes
  useEffect(() => {
    if (agent) {
      setName(agent.name || '');
      setRole(agent.role || '');
      setDescription(agent.description || '');
      setProvider(agent.provider ?? '');
      setModel(agent.model ?? '');
      setCapabilities((agent.capabilities || []).join(', '));
      setColor(agent.color || '#6b7280');
      setTeamId(agent.teamId || '');
    }
  }, [agent]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!role.trim()) e.role = 'Role is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    validate();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, role: true });
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        role: role.trim(),
        description: description.trim() || undefined,
        provider: provider || undefined,
        model: model || undefined,
        capabilities: capabilities
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        color: color || undefined,
        teamId: teamId || undefined,
      });
    } catch {
      // Error handling is done by the parent via onSave rejection
    } finally {
      setSubmitting(false);
    }
  };

  // Generate unique datalist ID
  const datalistId = `role-suggestions-${agent?.id || 'new'}`;

  return (
    <div className="p-6">
      <h2 className="text-sm font-semibold text-(--vestara-text) mb-4">
        {isNew ? 'Create Agent' : `Edit ${agent?.name || 'Agent'}`}
      </h2>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
        {/* Name */}
        <div>
          <label className={labelClass}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((p) => ({ ...p, name: '' }));
            }}
            onBlur={() => handleBlur('name')}
            placeholder="Agent name"
            className={`${inputClass} ${errors.name && touched.name ? 'border-red-400' : ''}`}
          />
          {errors.name && touched.name && <p className={errorClass}>{errors.name}</p>}
        </div>

        {/* Role (freeform with datalist suggestions) */}
        <div>
          <label className={labelClass}>Role</label>
          <input
            type="text"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              if (errors.role) setErrors((p) => ({ ...p, role: '' }));
            }}
            onBlur={() => handleBlur('role')}
            placeholder="e.g. developer, banana-engineer"
            list={datalistId}
            className={`${inputClass} ${errors.role && touched.role ? 'border-red-400' : ''}`}
          />
          {roleSuggestions && roleSuggestions.length > 0 && (
            <datalist id={datalistId}>
              {[...new Set(roleSuggestions)].map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          )}
          {errors.role && touched.role && <p className={errorClass}>{errors.role}</p>}
        </div>

        {/* Description */}
        <div>
          <label className={labelClass}>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this agent do?"
            className={inputClass}
          />
        </div>

        {/* Provider / Model */}
        <div>
          <label className={labelClass}>Provider / Model</label>
          <ProviderModelPicker
            providerId={provider}
            modelId={model}
            onChange={(p, m) => {
              setProvider(p);
              setModel(m);
            }}
          />
        </div>

        {/* Capabilities */}
        <div>
          <label className={labelClass}>Capabilities (comma-separated)</label>
          <input
            type="text"
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
            placeholder="e.g. code-generation, refactoring"
            className={inputClass}
          />
        </div>

        {/* Color */}
        <div>
          <label className={labelClass}>Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 rounded border border-(--vestara-accent-border) cursor-pointer"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className={`${inputClass} flex-1`}
            />
          </div>
        </div>

        {/* Team */}
        {teams && teams.length > 0 && (
          <div>
            <label className={labelClass}>Team</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className={inputClass}
            >
              <option value="">No team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4 mt-4 border-t border-(--vestara-accent-border)">
          <button type="button" onClick={onCancel} className={buttonSecondaryClass}>
            Cancel
          </button>
          <button type="submit" disabled={submitting} className={buttonPrimaryClass}>
            {submitting ? 'Saving...' : isNew ? 'Create Agent' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
