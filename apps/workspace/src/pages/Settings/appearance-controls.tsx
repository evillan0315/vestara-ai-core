import { type ThemeSettings, useTheme } from '../../lib/theme.js';
import { input } from './settings-ui.js';

/**
 * SETTINGS-UI-001: Appearance controls.
 *
 * SelectField is shared with the General tab (Preferences → Typography,
 * Layout). All panel routes moved into Settings → General.
 *
 * Options accept plain values (label derived from the value) or
 * value/label pairs for human-friendly labels (e.g. font names).
 */
export type SelectOption<K extends keyof ThemeSettings> = ThemeSettings[K] | { value: ThemeSettings[K]; label: string };

export function SelectField<K extends keyof ThemeSettings>({
  settingKey,
  options,
}: {
  settingKey: K;
  options: readonly SelectOption<K>[];
}) {
  const { settings, updateSetting } = useTheme();
  const normalized: { value: ThemeSettings[K]; label: string }[] = options.map((option) =>
    typeof option === 'object'
      ? (option as { value: ThemeSettings[K]; label: string })
      : { value: option as ThemeSettings[K], label: String(option) },
  );
  return (
    <select
      aria-label={settingKey}
      value={String(settings[settingKey])}
      onChange={(event) => updateSetting(settingKey, event.target.value as ThemeSettings[K])}
      className={input}
    >
      {normalized.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
