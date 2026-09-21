import { type ThemeSettings, useTheme } from '../../lib/theme.js';
import { input } from './settings-ui.js';

/**
 * SETTINGS-UI-001: Appearance controls.
 *
 * SelectField is shared with the General tab (Preferences → Typography,
 * Layout). All panel routes moved into Settings → General.
 */
export function SelectField<K extends keyof ThemeSettings>({  settingKey,
  options,
}: {
  settingKey: K;
  options: readonly ThemeSettings[K][];
}) {
  const { settings, updateSetting } = useTheme();
  return (
    <select
      aria-label={settingKey}
      value={String(settings[settingKey])}
      onChange={(event) => updateSetting(settingKey, event.target.value as ThemeSettings[K])}
      className={input}
    >
      {options.map((option) => (
        <option key={String(option)} value={String(option)}>
          {String(option)}
        </option>
      ))}
    </select>
  );
}
