import type { ResolvedConfiguration, SettingsSectionId } from '@vestara/configuration';

export interface SettingsDraftState {
  readonly section: SettingsSectionId;
  readonly values: Readonly<Record<string, unknown>>;
  readonly dirtyKeys: readonly string[];
}

export function createDraft(configuration: ResolvedConfiguration, section: SettingsSectionId): SettingsDraftState {
  return {
    section,
    values: Object.fromEntries(
      configuration.settings.filter((setting) => setting.section === section).map((setting) => [setting.key, setting.value]),
    ),
    dirtyKeys: [],
  };
}

export function updateDraft(state: SettingsDraftState, key: string, value: unknown): SettingsDraftState {
  return {
    ...state,
    values: { ...state.values, [key]: value },
    dirtyKeys: state.dirtyKeys.includes(key) ? state.dirtyKeys : [...state.dirtyKeys, key],
  };
}

export function draftOverrides(state: SettingsDraftState): Record<string, unknown> {
  return Object.fromEntries(state.dirtyKeys.map((key) => [key, state.values[key]]));
}
