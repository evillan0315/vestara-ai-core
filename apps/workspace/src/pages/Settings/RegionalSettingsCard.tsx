/**
 * VES-DESIGN-007E: RegionalSettingsCard — card for regional configuration
 * fields (language, timezone, date format, time format). Values are projected
 * from the authoritative configuration registry. Screenshot-example values
 * (English (Philippines), GMT+08:00 Manila, etc.) are NOT hard-coded — they
 * are omitted when the owning runtime has not exposed the corresponding
 * settings contract.
 *
 * Authority boundaries (do not blur):
 * - Values resolve from the resolved configuration supplied by the parent.
   The card does not invent locale data or perform its own i18n lookups.
 * - If a setting key has no definition in the workspace-settings authority, the
   field is intentionally omitted (HOLD) rather than displaying fabricated
   defaults.
 * - Save state is managed by the parent General form — the card contributes
   to draft state but does not persist independently.
 */

import type { ResolvedConfiguration } from '@vestara/configuration';
import { useCallback, useState } from 'react';

export interface RegionalSettingsCardProps {
  configuration: ResolvedConfiguration;
  onFieldChange: (key: string, value: unknown) => void;
}

const REGIONAL_FIELDS = [
  // Language — no settings contract currently exposed; HELD until a
  // canonical option definition lands in packages/configuration.
  // { key: 'general.language', label: 'Language', type: 'select' },

  // Timezone — no settings contract currently exposed; HELD until a
  // canonical option definition lands in packages/configuration.
  // { key: 'general.timezone', label: 'Timezone', type: 'text' },

  // Date Format — mapped to the existing general.dateTimeFormat contract.
  { key: 'general.dateTimeFormat', label: 'Date Format', type: 'select' },

  // Time Format — no settings contract currently exposed; HELD until a
  // canonical option definition lands in packages/configuration.
  // { key: 'general.timeFormat', label: 'Time Format', type: 'select' },
] as const;

const DATE_FORMAT_OPTIONS = [
  { value: 'locale', label: 'Locale' },
  { value: 'iso', label: 'ISO 8601' },
];

export function RegionalSettingsCard({
  configuration,
  onFieldChange,
}: RegionalSettingsCardProps) {
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
        Regional
      </h3>

      {REGIONAL_FIELDS.map((field) => {
        const setting = configuration.settings.find((s) => s.key === field.key);
        if (!setting) return null; // HOLD unsupported field

        if (field.type === 'select') {
          return (
            <div key={field.key} className="mb-4">
              <label className="block text-[var(--vestara-font-size-xs)] font-medium text-[var(--vestara-color-text-secondary)] mb-1">
                {field.label}
              </label>
              <select
                value={String(draftValues[field.key] ?? setting.value)}
                onChange={(event) =>
                  handleFieldChange(field.key, event.target.value)
                }
                aria-label={field.label}
                className="w-full rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-panel)] px-3 py-2 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-primary,var(--vestara-text))] focus:outline-none focus:ring-2 focus:ring-[var(--vestara-border-focus)] focus:border-transparent"
              >
                {DATE_FORMAT_OPTIONS.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    selected={String(draftValues[field.key] ?? setting.value) === opt.value}
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        return null;
      })}
    </section>
  );
}