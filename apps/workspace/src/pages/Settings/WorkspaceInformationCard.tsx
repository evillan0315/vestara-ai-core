/**
 * VES-DESIGN-007D: WorkspaceInformationCard — read-write card for workspace
 * identity fields. Every editable field maps to an existing settings contract
 * in packages/configuration/src/workspace-settings.ts. No values are invented;
 * unsupported fields are simply absent.
 *
 * Authority boundaries (do not blur):
 * - Values resolve from the authoritative resolved configuration supplied by
   the parent SettingsPage. The card does not read localStorage or perform
   its own fetches.
 * - The card contributes to the shared draft state; Save state is managed by
   the parent General form — the card does not implement its own persistence.
 * - Logo actions (Change/Remove) are omitted entirely because no API
   endpoint for logo upload/ deletion exists in the current runtime contract.
 */

import { Input } from '@vestara/ui';
import type { ResolvedConfiguration } from '@vestara/configuration';
import { useCallback, useState } from 'react';

export interface WorkspaceInformationCardProps {
  configuration: ResolvedConfiguration;
  onFieldChange: (key: string, value: unknown) => void;
}

const WORKSPACE_IDENTITY_FIELDS = [
  { key: 'general.workspaceName', label: 'Workspace Name', type: 'text' },
  // Description, URL, and Logo have no existing settings contract in the
  // workspace-settings definition — they are intentionally omitted to
  // avoid fake upload behavior and unauthorized persistence.
] as const;

export function WorkspaceInformationCard({
  configuration,
  onFieldChange,
}: WorkspaceInformationCardProps) {
  const [draftValues, setDraftValues] = useState<Record<string, unknown>>(
    () => {
      const values: Record<string, unknown> = {};
      const generalSettings = configuration.settings.filter(
        (s) => s.section === 'general',
      );
      for (const setting of generalSettings) {
        values[setting.key] = setting.value;
      }
      return values;
    },
  );

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      setDraftValues((prev) => {
        const updated = { ...prev, [key]: value };
        onFieldChange(key, value);
        return updated;
      });
    },
    [onFieldChange],
  );

  return (
    <section className="st-panel p-4 sm:p-6">
      <h3 className="text-[var(--vestara-font-size-base)] font-semibold text-[var(--vestara-color-text-primary)] mb-4">
        Workspace
      </h3>

      {WORKSPACE_IDENTITY_FIELDS.map((field) => {
        const setting = configuration.settings.find((s) => s.key === field.key);
        if (!setting) return null;

        if (field.type === 'text') {
          return (
            <div key={field.key} className="mb-4">
              <label htmlFor={`workspace-name-${field.key}`} className="block text-[var(--vestara-font-size-xs)] font-medium text-[var(--vestara-color-text-secondary)] mb-1">
                {field.label}
              </label>
              <Input
                id={`workspace-name-${field.key}`}
                value={String(draftValues[field.key] ?? setting.value ?? '') as string}
                onChange={(event) => handleFieldChange(field.key, event.target.value)}
                placeholder={String(setting.value)}
                aria-label={field.label}
                className="w-full"
              />
            </div>
          );
        }

        return null;
      })}
    </section>
  );
}