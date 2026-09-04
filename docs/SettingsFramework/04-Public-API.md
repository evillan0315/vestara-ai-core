---
title: Settings Framework — Public API
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Settings Framework — Public API

## Purpose

This document defines the stable public API surface of the Settings Framework. This is the contract that modules, plugins, and applications use to interact with the framework. Internal implementation details are not part of this API.

## API Overview

```typescript
// Main entry point
import { SettingsFramework } from '@vestara/settings-framework';

// Create framework instance
const framework = new SettingsFramework({
  db: database,
  eventBus: eventBus,
  permissionEngine: permissionEngine,
});

// Register modules
framework.registerModule(module);

// Get settings
const value = await framework.get('providers', 'default-model');

// Set settings
await framework.set('providers', 'default-model', 'gpt-4');

// Export/Import
const exportData = await framework.export();
await framework.import(exportData);

// Reset
await framework.reset('providers');
```

## Module Registration

### Register a Module

```typescript
framework.registerModule({
  id: 'providers',
  name: 'AI Providers',
  description: 'Configure AI provider connections',
  icon: 'cpu',
  path: '/settings/ai/providers',
  parentId: 'ai',
  permissions: ['settings:ai:view', 'settings:ai:write'],
  capabilities: ['ai:provider:manage'],
  order: 1,
  enabled: true,
});
```

### Unregister a Module

```typescript
framework.unregisterModule('providers');
```

### Get Module

```typescript
const module = framework.getModule('providers');
// => { id: 'providers', name: 'AI Providers', ... }
```

### Get All Modules

```typescript
const modules = framework.getModules();
// => SettingsModule[]
```

### Get Child Modules

```typescript
const aiModules = framework.getChildModules('ai');
// => [{ id: 'providers', ... }, { id: 'routing', ... }]
```

## Settings Operations

### Get a Setting Value

```typescript
const value = await framework.get('providers', 'default-model');
// => 'gpt-4' or null if not set
```

### Get Multiple Values

```typescript
const values = await framework.getMany('providers', ['default-model', 'api-key']);
// => { 'default-model': 'gpt-4', 'api-key': 'sk-...' }
```

### Get All Values for a Module

```typescript
const allValues = await framework.getAll('providers');
// => { 'default-model': 'gpt-4', 'api-key': 'sk-...', ... }
```

### Set a Value

```typescript
await framework.set('providers', 'default-model', 'gpt-4');
```

### Set Multiple Values

```typescript
await framework.setMany('providers', {
  'default-model': 'gpt-4',
  'api-key': 'sk-...',
});
```

### Delete a Value

```typescript
await framework.delete('providers', 'api-key');
```

### Reset Module to Defaults

```typescript
await framework.reset('providers');
```

## Search

### Search Settings

```typescript
const results = await framework.search('theme');
// => [{ moduleId: 'appearance', key: 'theme', label: 'Theme', ... }]
```

### Search with Filters

```typescript
const results = await framework.search('theme', {
  modules: ['appearance', 'workspace'],
  permissions: ['settings:appearance:view'],
});
```

## Import/Export

### Export Settings

```typescript
// Export all settings
const data = await framework.export();

// Export specific modules
const data = await framework.export(['providers', 'routing']);
```

### Import Settings

```typescript
// Import with validation
const result = await framework.import(data);

if (result.success) {
  console.log(`Imported ${result.count} settings`);
} else {
  console.error('Import failed:', result.errors);
}
```

## Permission Checking

### Check Permission

```typescript
const canRead = await framework.canRead('providers', ['user:role']);
const canWrite = await framework.canWrite('providers', ['admin:role']);
const canAdmin = await framework.canAdmin('providers', ['superadmin:role']);
```

### Get User Permissions

```typescript
const permissions = await framework.getPermissions('providers', ['user:role']);
// => ['read', 'write'] (filtered by role)
```

## Event Subscription

### Subscribe to Changes

```typescript
framework.on('setting:changed', (event) => {
  console.log(`Setting changed: ${event.moduleId}.${event.key}`);
  console.log(`New value: ${event.value}`);
  console.log(`Updated by: ${event.updatedBy}`);
});

framework.on('module:registered', (event) => {
  console.log(`Module registered: ${event.module.id}`);
});

framework.on('module:unregistered', (event) => {
  console.log(`Module unregistered: ${event.moduleId}`);
});
```

## Validation

### Validate a Value

```typescript
const isValid = await framework.validate('providers', 'default-model', 'gpt-4');
// => true

const isValid = await framework.validate('providers', 'port', 'not-a-number');
// => false
```

### Get Validation Errors

```typescript
const errors = await framework.validateWithErrors('providers', 'port', 'not-a-number');
// => [{ message: 'Expected number', path: ['port'] }]
```

## TypeScript Types

```typescript
import type {
  SettingsFramework,
  SettingsModule,
  SettingsRoute,
  SettingsSection,
  SettingsEntry,
  SettingsValue,
  SettingsPlugin,
  SettingsPermission,
  SettingsSearchResult,
  SettingsExportResult,
  SettingsImportResult,
} from '@vestara/settings-framework';
```
