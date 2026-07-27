# Settings Framework — Contracts

## Purpose

This document defines the TypeScript interfaces and Zod schemas that form the stable contract surface of the Settings Framework. Every module, plugin, and integration must conform to these contracts.

## Core Contracts

### SettingsModule

The fundamental building block. Every settings domain implements this interface.

```typescript
import { z } from 'zod';

export const SettingsModuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  path: z.string().min(1),
  parentId: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
  order: z.number().optional(),
  enabled: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

export type SettingsModule = z.infer<typeof SettingsModuleSchema>;
```

### SettingsRoute

Maps URL paths to modules.

```typescript
export const SettingsRouteSchema = z.object({
  moduleId: z.string().min(1),
  path: z.string().min(1),
  exact: z.boolean().default(false),
  component: z.string().min(1),
  permissions: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SettingsRoute = z.infer<typeof SettingsRouteSchema>;
```

### SettingsSection

A group of related settings within a module.

```typescript
export const SettingsSectionSchema = z.object({
  id: z.string().min(1),
  moduleId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  component: z.string().min(1),
  order: z.number().optional(),
  permissions: z.array(z.string()).optional(),
});

export type SettingsSection = z.infer<typeof SettingsSectionSchema>;
```

### SettingsEntry

An individual setting within a section.

```typescript
export const SettingsEntrySchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  moduleId: z.string().min(1),
  key: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'select', 'multi-select', 'json', 'color']),
  label: z.string().min(1),
  description: z.string().optional(),
  defaultValue: z.unknown(),
  validation: z.record(z.unknown()).optional(),
  permissions: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SettingsEntry = z.infer<typeof SettingsEntrySchema>;
```

### SettingsValue

The stored value for a setting.

```typescript
export const SettingsValueSchema = z.object({
  entryId: z.string().min(1),
  moduleId: z.string().min(1),
  key: z.string().min(1),
  value: z.unknown(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().min(1),
});

export type SettingsValue = z.infer<typeof SettingsValueSchema>;
```

### SettingsPlugin

Extension point for third-party settings.

```typescript
export const SettingsPluginSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  author: z.string().min(1),
  modules: z.array(SettingsModuleSchema),
  permissions: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SettingsPlugin = z.infer<typeof SettingsPluginSchema>;
```

### SettingsPermission

Role-based access control for settings.

```typescript
export const SettingsPermissionSchema = z.object({
  moduleId: z.string().min(1),
  action: z.enum(['read', 'write', 'admin']),
  roles: z.array(z.string()),
  conditions: z.record(z.unknown()).optional(),
});

export type SettingsPermission = z.infer<typeof SettingsPermissionSchema>;
```

## Registry Contracts

### Module Registry

```typescript
export interface ModuleRegistry {
  register(module: SettingsModule): void;
  unregister(moduleId: string): void;
  get(moduleId: string): SettingsModule | undefined;
  getAll(): SettingsModule[];
  getByParent(parentId: string): SettingsModule[];
  search(query: string): SettingsModule[];
}
```

### Route Registry

```typescript
export interface RouteRegistry {
  register(route: SettingsRoute): void;
  unregister(moduleId: string): void;
  get(path: string): SettingsRoute | undefined;
  getByModule(moduleId: string): SettingsRoute[];
  getAll(): SettingsRoute[];
}
```

### Permission Registry

```typescript
export interface PermissionRegistry {
  register(permission: SettingsPermission): void;
  check(moduleId: string, action: string, roles: string[]): boolean;
  getByModule(moduleId: string): SettingsPermission[];
}
```

## API Contracts

### Settings API

```typescript
export interface SettingsAPI {
  getModule(moduleId: string): Promise<SettingsModule>;
  getModules(): Promise<SettingsModule[]>;
  getSettings(moduleId: string): Promise<SettingsValue[]>;
  getSetting(moduleId: string, key: string): Promise<SettingsValue | null>;
  setSetting(moduleId: string, key: string, value: unknown): Promise<SettingsValue>;
  resetSettings(moduleId: string): Promise<void>;
  exportSettings(moduleIds?: string[]): Promise<string>;
  importSettings(data: string): Promise<void>;
}
```

## Validation Schemas

All API boundaries validate with Zod:

```typescript
import { z } from 'zod';

export const GetSettingsQuerySchema = z.object({
  moduleId: z.string().min(1),
  keys: z.array(z.string()).optional(),
});

export const SetSettingsBodySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

export const ExportSettingsQuerySchema = z.object({
  moduleIds: z.array(z.string()).optional(),
  format: z.enum(['json']).default('json'),
});

export const ImportSettingsBodySchema = z.object({
  data: z.string().min(1),
  overwrite: z.boolean().default(false),
});
```
