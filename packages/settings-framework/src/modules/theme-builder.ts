/**
 * @vestara/settings-framework — Theme Builder Module
 *
 * Registers the Theme Builder module with the Settings Framework.
 * Provides durable persistence for custom themes via the settings API.
 *
 * Architecture Traceability:
 *   Settings Framework: 03-Contracts.md → Module, Route, Section, Entry
 *   Theme Builder Spec: docs/specs/theme-builder.md
 */

import type {
  CreateModuleInput,
  EntryType,
  SettingsEntry,
  SettingsModule,
  SettingsPermission,
  SettingsRoute,
  SettingsSection,
} from '../types.js';

export const THEME_BUILDER_MODULE_ID = 'theme-builder';
export const THEME_BUILDER_MODULE_PATH = '/settings/theme-builder';

export const themeBuilderModule: CreateModuleInput = {
  name: 'Theme Builder',
  description: 'Create, customize, preview, export, and import custom themes',
  icon: 'palette',
  path: THEME_BUILDER_MODULE_PATH,
  permissions: ['editor'],
  capabilities: ['theme-creation', 'token-editing', 'live-preview', 'import-export', 'theme-sharing'],
  order: 10,
  metadata: {
    version: '1.0.0',
    author: 'Vestara Team',
  },
};

export const themeBuilderRoutes: SettingsRoute[] = [
  {
    moduleId: THEME_BUILDER_MODULE_ID,
    path: THEME_BUILDER_MODULE_PATH,
    exact: true,
    component: 'SettingsThemeBuilder',
    permissions: ['editor'],
    metadata: { title: 'Theme Builder' },
  },
];

export const themeBuilderSections: Omit<SettingsSection, 'id'>[] = [
  {
    moduleId: THEME_BUILDER_MODULE_ID,
    name: 'Token Editor',
    description: 'Edit semantic tokens across all categories',
    component: 'TokenEditor',
    order: 1,
    permissions: ['editor'],
  },
  {
    moduleId: THEME_BUILDER_MODULE_ID,
    name: 'Live Preview',
    description: 'Real-time preview of theme changes',
    component: 'ThemePreview',
    order: 2,
    permissions: ['editor'],
  },
  {
    moduleId: THEME_BUILDER_MODULE_ID,
    name: 'Preset Gallery',
    description: 'Browse built-in and custom theme presets',
    component: 'PresetGallery',
    order: 3,
    permissions: ['editor'],
  },
  {
    moduleId: THEME_BUILDER_MODULE_ID,
    name: 'Import/Export',
    description: 'Import, export, and share themes',
    component: 'ImportExport',
    order: 4,
    permissions: ['editor'],
  },
];

export const themeBuilderEntries: Omit<SettingsEntry, 'id'>[] = [
  {
    moduleId: THEME_BUILDER_MODULE_ID,
    sectionId: 'theme-builder-custom-themes',
    key: 'customThemes',
    type: 'json' as EntryType,
    label: 'Custom Themes',
    description: 'Array of user-created custom themes',
    defaultValue: [],
    validation: {
      schema: 'CustomThemeArray',
      maxItems: 100,
    },
    permissions: ['editor'],
    metadata: {
      persistence: 'server',
      arrayOf: 'CustomTheme',
    },
  },
  {
    moduleId: THEME_BUILDER_MODULE_ID,
    sectionId: 'theme-builder-custom-themes',
    key: 'activeCustomThemeId',
    type: 'string' as EntryType,
    label: 'Active Custom Theme',
    description: 'ID of the currently applied custom theme',
    defaultValue: '',
    validation: {
      pattern: '^(built-in-|custom-)?[a-z0-9-]+$',
    },
    permissions: ['editor'],
    metadata: {
      persistence: 'server',
    },
  },
];

export const themeBuilderPermissions: SettingsPermission[] = [
  {
    moduleId: THEME_BUILDER_MODULE_ID,
    action: 'read',
    roles: ['viewer', 'editor', 'admin'],
  },
  {
    moduleId: THEME_BUILDER_MODULE_ID,
    action: 'write',
    roles: ['editor', 'admin'],
  },
  {
    moduleId: THEME_BUILDER_MODULE_ID,
    action: 'admin',
    roles: ['admin'],
  },
];

export function registerThemeBuilderModule(registry: {
  registerModule: (input: CreateModuleInput) => SettingsModule;
  registerRoute: (route: SettingsRoute) => void;
  registerSection: (section: Omit<SettingsSection, 'id'>) => SettingsSection;
  registerEntry: (entry: Omit<SettingsEntry, 'id'>) => SettingsEntry;
  registerPermission: (permission: SettingsPermission) => void;
}): {
  module: SettingsModule;
  routes: SettingsRoute[];
  sections: SettingsSection[];
  entries: SettingsEntry[];
} {
  const module = registry.registerModule(themeBuilderModule);

  const registeredSections = themeBuilderSections.map((section) =>
    registry.registerSection({ ...section, moduleId: module.id }),
  );

  const registeredEntries = themeBuilderEntries.map((entry) =>
    registry.registerEntry({ ...entry, moduleId: module.id, sectionId: registeredSections[0].id }),
  );

  const registeredRoutes = themeBuilderRoutes.map((route) => {
    registry.registerRoute({ ...route, moduleId: module.id });
    return { ...route, moduleId: module.id };
  });

  themeBuilderPermissions.forEach((permission) => {
    registry.registerPermission({ ...permission, moduleId: module.id });
  });

  return {
    module,
    routes: registeredRoutes,
    sections: registeredSections,
    entries: registeredEntries,
  };
}
