/**
 * VES-DESIGN-007F: PreferencesCard — card for user preference toggles.
 * Values are projected from the authoritative configuration. Only preference
 * controls with existing settings contracts are wired; unsupported portions
 * are held (omitted) to avoid fabricated persistence.
 *
 * Authority boundaries (do not blur):
 * - Values resolve from the resolved configuration supplied by the parent.
   The card does not read localStorage or perform its own fetches.
 * - The card contributes to the shared draft state; Save state is managed by
   the parent General form — the card does not implement its own persistence.
 * - Switch/Toggle components use the canonical vestibular focus styles
   (var(--vestara-*) tokens) and aria-checked state.
 * - Sound notifications maps to the existing `notifications.enabled`
   contract (section: notifications). The value is carried in the general
   draft state for composition within the General surface; the parent form
   routes it on save.
 */

import { Toggle } from './settings-ui';
import type { ResolvedConfiguration } from '@vestara/configuration';
import { useCallback, useState } from 'react';

export interface PreferencesCardProps {
  configuration: ResolvedConfiguration;
  onFieldChange: (key: string, value: unknown) => void;
}

const PREFERENCE_TOGGLES = [
  // Sound notifications — the only preference with an existing settings
  // contract (`notifications.enabled` in the notifications section). The
  // value is carried in the general draft state for composition within the
  // General surface; the parent General form routes it on save.
  {
    key: 'notifications.enabled',
    label: 'Sound notifications',
    type: 'toggle',
  },
  // Reduced motion — no existing settings contract; HELD (omitted) until
  // a canonical option definition is established in the general section.
  // { key: 'general.reducedMotion', label: 'Reduced motion', type: 'toggle' },
  // Welcome tips — no existing settings contract; HELD.
  // { key: 'general.welcomeTips', label: 'Welcome tips', type: 'toggle' },
  // Auto-collapse sidebar on mobile — no existing settings contract; HELD.
  // { key: 'general.autoCollapseSidebar', label: 'Auto-collapse sidebar on mobile', type: 'toggle' },
  // Confirm destructive actions — no existing settings contract; HELD.
  // { key: 'general.confirmDestructive', label: 'Confirm destructive actions', type: 'toggle' },
] as const;

export function PreferencesCard({
  configuration,
  onFieldChange,
}: PreferencesCardProps) {
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
        Preferences
      </h3>

      {PREFERENCE_TOGGLES.map((toggle) => {
        const setting = configuration.settings.find((s) => s.key === toggle.key);
        if (!setting) return null; // HOLD unsupported field

        if (toggle.type === 'toggle') {
          return (
            <div key={toggle.key} className="mb-4">
              <label className="block text-[var(--vestara-font-size-xs)] font-medium text-[var(--vestara-color-text-secondary)] mb-1">
                {toggle.label}
              </label>
              <Toggle
                checked={Boolean(draftValues[toggle.key])}
                onChange={(checked) =>
                  handleFieldChange(toggle.key, checked)
                }
              >
                <span
                  className={`absolute left-0.5 top-1 size-4 rounded-full bg-[var(--color-zinc-50)] shadow transition-transform motion-reduce:transition-none ${Boolean(
                    draftValues[toggle.key],
                  ) ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </Toggle>
            </div>
          );
        }

        return null;
      })}
    </section>
  );
}