# Settings Framework — Registry

## Purpose

The Registry is the central coordination point of the Settings Framework. It manages module registration, route generation, permission enforcement, and search indexing. Every module must register with the Registry before it can participate in the settings system.

## Registry Architecture

```
Registry
│
├── Module Registry
│   ├── register(module)
│   ├── unregister(moduleId)
│   ├── get(moduleId)
│   ├── list()
│   └── search(query)
│
├── Route Registry
│   ├── register(route)
│   ├── unregister(moduleId)
│   ├── get(path)
│   └── list()
│
├── Section Registry
│   ├── register(section)
│   ├── unregister(sectionId)
│   ├── getByModule(moduleId)
│   └── list()
│
├── Entry Registry
│   ├── register(entry)
│   ├── unregister(entryId)
│   ├── getBySection(sectionId)
│   └── list()
│
├── Permission Registry
│   ├── register(permission)
│   ├── check(moduleId, action, roles)
│   └── getByModule(moduleId)
│
└── Search Index
    ├── index(module)
    ├── deindex(moduleId)
    └── search(query)
```

## Module Registration

### Registration Flow

```
1. Module calls registry.register(moduleData)
2. Registry validates against ModuleSchema
3. Registry checks for duplicate IDs
4. Registry stores module in internal map
5. Registry auto-generates route (if not provided)
6. Registry indexes module for search
7. Registry emits 'module:registered' event
```

### Registration Code

```typescript
export class SettingsRegistry implements ModuleRegistry {
  private modules = new Map<string, SettingsModule>();
  private routes = new Map<string, SettingsRoute>();
  private sections = new Map<string, SettingsSection>();
  private entries = new Map<string, SettingsEntry>();
  private permissions = new Map<string, SettingsPermission>();
  private searchIndex: SearchIndex;

  register(module: SettingsModule): void {
    // Validate
    const result = SettingsModuleSchema.safeParse(module);
    if (!result.success) {
      throw new Error(`Invalid module: ${result.error.message}`);
    }

    // Check duplicate
    if (this.modules.has(module.id)) {
      throw new Error(`Module already registered: ${module.id}`);
    }

    // Store
    this.modules.set(module.id, module);

    // Auto-generate route if not provided
    if (!this.routes.has(module.id)) {
      this.routes.set(module.id, {
        moduleId: module.id,
        path: module.path,
        component: `Settings${module.id.charAt(0).toUpperCase()}${module.id.slice(1)}`,
        permissions: module.permissions,
      });
    }

    // Index for search
    this.searchIndex.index(module);

    // Emit event
    this.eventBus.emit('module:registered', { module });
  }

  unregister(moduleId: string): void {
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error(`Module not found: ${moduleId}`);
    }

    this.modules.delete(moduleId);
    this.routes.delete(moduleId);
    this.searchIndex.deindex(moduleId);

    this.eventBus.emit('module:unregistered', { moduleId });
  }
}
```

## Route Generation

### Auto-Generated Routes

The Registry auto-generates routes based on module hierarchy:

```typescript
// Parent module
registry.register({
  id: 'ai',
  name: 'AI',
  path: '/settings/ai',
  // ... other fields
});

// Child module
registry.register({
  id: 'providers',
  name: 'AI Providers',
  path: '/settings/ai/providers',
  parentId: 'ai',
  // ... other fields
});

// Generated routes:
// /settings/ai → AI Settings
// /settings/ai/providers → AI Providers Settings
```

### Route Resolution

```typescript
// Get route by path
const route = registry.getRouteByPath('/settings/ai/providers');
// => { moduleId: 'providers', path: '/settings/ai/providers', ... }

// Get routes for module
const routes = registry.getRoutesByModule('ai');
// => [{ moduleId: 'ai', ... }, { moduleId: 'providers', ... }]
```

## Section Registration

### Section Flow

```
1. Section calls registry.registerSection(sectionData)
2. Registry validates against SectionSchema
3. Registry checks parent module exists
4. Registry stores section in internal map
5. Registry emits 'section:registered' event
```

### Section Code

```typescript
registerSection(section: SettingsSection): void {
  // Validate
  const result = SettingsSectionSchema.safeParse(section);
  if (!result.success) {
    throw new Error(`Invalid section: ${result.error.message}`);
  }

  // Check parent module exists
  if (!this.modules.has(section.moduleId)) {
    throw new Error(`Module not found: ${section.moduleId}`);
  }

  // Store
  this.sections.set(section.id, section);

  // Emit event
  this.eventBus.emit('section:registered', { section });
}
```

## Entry Registration

### Entry Flow

```
1. Entry calls registry.registerEntry(entryData)
2. Registry validates against EntrySchema
3. Registry checks parent section exists
4. Registry stores entry in internal map
5. Registry emits 'entry:registered' event
```

### Entry Code

```typescript
registerEntry(entry: SettingsEntry): void {
  // Validate
  const result = SettingsEntrySchema.safeParse(entry);
  if (!result.success) {
    throw new Error(`Invalid entry: ${result.error.message}`);
  }

  // Check parent section exists
  if (!this.sections.has(entry.sectionId)) {
    throw new Error(`Section not found: ${entry.sectionId}`);
  }

  // Store
  this.entries.set(entry.id, entry);

  // Emit event
  this.eventBus.emit('entry:registered', { entry });
}
```

## Permission Registration

### Permission Flow

```
1. Permission calls registry.registerPermission(permissionData)
2. Registry validates against PermissionSchema
3. Registry checks module exists
4. Registry stores permission in internal map
5. Registry emits 'permission:registered' event
```

### Permission Code

```typescript
registerPermission(permission: SettingsPermission): void {
  // Validate
  const result = SettingsPermissionSchema.safeParse(permission);
  if (!result.success) {
    throw new Error(`Invalid permission: ${result.error.message}`);
  }

  // Check module exists
  if (!this.modules.has(permission.moduleId)) {
    throw new Error(`Module not found: ${permission.moduleId}`);
  }

  // Store
  this.permissions.set(`${permission.moduleId}:${permission.action}`, permission);

  // Emit event
  this.eventBus.emit('permission:registered', { permission });
}
```

## Search Indexing

### Indexing Flow

```
1. Module registers with Registry
2. Registry extracts searchable fields (name, description, path)
3. Registry stores in search index
4. Registry emits 'index:updated' event
```

### Indexing Code

```typescript
index(module: SettingsModule): void {
  const document = {
    id: module.id,
    type: 'module',
    name: module.name,
    description: module.description || '',
    path: module.path,
    tags: module.capabilities || [],
  };

  this.searchIndex.add(document);
}

deindex(moduleId: string): void {
  this.searchIndex.remove(moduleId);
}

search(query: string): SettingsModule[] {
  const results = this.searchIndex.search(query);
  return results.map((r) => this.modules.get(r.id)!).filter(Boolean);
}
```

## Registry Events

The Registry emits events for all state changes:

```typescript
// Module events
eventBus.on('module:registered', (event) => { /* ... */ });
eventBus.on('module:unregistered', (event) => { /* ... */ });

// Section events
eventBus.on('section:registered', (event) => { /* ... */ });
eventBus.on('section:unregistered', (event) => { /* ... */ });

// Entry events
eventBus.on('entry:registered', (event) => { /* ... */ });
eventBus.on('entry:unregistered', (event) => { /* ... */ });

// Permission events
eventBus.on('permission:registered', (event) => { /* ... */ });
eventBus.on('permission:unregistered', (event) => { /* ... */ });

// Search events
eventBus.on('index:updated', (event) => { /* ... */ });
```
