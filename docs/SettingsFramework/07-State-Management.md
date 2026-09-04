---
title: Settings Framework — State Management
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Settings Framework — State Management

## Purpose

State Management handles the lifecycle of settings values — from user interaction through validation, persistence, and synchronization. It ensures settings are always consistent, validated, and available.

## State Flow

```
User Input
    ↓
Component State (React)
    ↓
Validation (Zod)
    ↓
Settings Store (Memory)
    ↓
EventBus (Notify)
    ↓
Persistence (SQLite)
    ↓
Sync (.vestara/)
```

## Settings Store

### Store Interface

```typescript
export interface SettingsStore {
  /** Get a setting value */
  get(moduleId: string, key: string): Promise<SettingsValue | null>;
  
  /** Get multiple values */
  getMany(moduleId: string, keys: string[]): Promise<SettingsValue[]>;
  
  /** Get all values for a module */
  getAll(moduleId: string): Promise<SettingsValue[]>;
  
  /** Set a value */
  set(moduleId: string, key: string, value: unknown): Promise<SettingsValue>;
  
  /** Set multiple values */
  setMany(moduleId: string, entries: Record<string, unknown>): Promise<SettingsValue[]>;
  
  /** Delete a value */
  delete(moduleId: string, key: string): Promise<void>;
  
  /** Delete all values for a module */
  deleteAll(moduleId: string): Promise<void>;
  
  /** Reset to defaults */
  reset(moduleId: string): Promise<void>;
  
  /** Get default value */
  getDefault(moduleId: string, key: string): unknown;
  
  /** Get all defaults for a module */
  getDefaults(moduleId: string): Record<string, unknown>;
}
```

### Store Implementation

```typescript
export class SQLiteSettingsStore implements SettingsStore {
  constructor(
    private db: Database,
    private registry: ModuleRegistry,
    private eventBus: EventBus,
  ) {}

  async get(moduleId: string, key: string): Promise<SettingsValue | null> {
    // Validate module exists
    const module = this.registry.get(moduleId);
    if (!module) {
      throw new Error(`Module not found: ${moduleId}`);
    }

    // Query database
    const stmt = this.db.prepare(`
      SELECT * FROM settings_values 
      WHERE module_id = ? AND key = ?
    `);
    const row = stmt.get(moduleId, key) as SettingsValueRow | undefined;

    if (!row) {
      // Return default if exists
      const entry = this.registry.getEntry(moduleId, key);
      if (entry) {
        return {
          entryId: entry.id,
          moduleId,
          key,
          value: entry.defaultValue,
          updatedAt: new Date().toISOString(),
          updatedBy: 'system',
        };
      }
      return null;
    }

    return this.mapRowToValue(row);
  }

  async set(moduleId: string, key: string, value: unknown): Promise<SettingsValue> {
    // Validate module exists
    const module = this.registry.get(moduleId);
    if (!module) {
      throw new Error(`Module not found: ${moduleId}`);
    }

    // Validate entry exists
    const entry = this.registry.getEntry(moduleId, key);
    if (!entry) {
      throw new Error(`Setting not found: ${moduleId}.${key}`);
    }

    // Validate value against entry schema
    const validationResult = this.validateValue(entry, value);
    if (!validationResult.success) {
      throw new Error(`Validation failed: ${validationResult.error.message}`);
    }

    // Upsert value
    const stmt = this.db.prepare(`
      INSERT INTO settings_values (module_id, key, value, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(module_id, key) 
      DO UPDATE SET value = ?, updated_at = ?, updated_by = ?
    `);
    
    const now = new Date().toISOString();
    const updatedBy = 'user'; // Get from context
    
    stmt.run(moduleId, key, JSON.stringify(value), now, updatedBy, 
             JSON.stringify(value), now, updatedBy);

    const settingsValue: SettingsValue = {
      entryId: entry.id,
      moduleId,
      key,
      value,
      updatedAt: now,
      updatedBy,
    };

    // Emit event
    this.eventBus.emit('setting:changed', settingsValue);

    return settingsValue;
  }

  async delete(moduleId: string, key: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM settings_values 
      WHERE module_id = ? AND key = ?
    `);
    stmt.run(moduleId, key);

    this.eventBus.emit('setting:deleted', { moduleId, key });
  }

  async reset(moduleId: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM settings_values 
      WHERE module_id = ?
    `);
    stmt.run(moduleId);

    this.eventBus.emit('module:reset', { moduleId });
  }

  private validateValue(entry: SettingsEntry, value: unknown): ValidationResult {
    // Build Zod schema from entry type
    let schema: z.ZodType;
    
    switch (entry.type) {
      case 'string':
        schema = z.string();
        break;
      case 'number':
        schema = z.number();
        break;
      case 'boolean':
        schema = z.boolean();
        break;
      case 'select':
        schema = z.enum(entry.validation?.options || []);
        break;
      case 'json':
        schema = z.record(z.unknown());
        break;
      case 'color':
        schema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
        break;
      default:
        schema = z.unknown();
    }

    return schema.safeParse(value);
  }
}
```

## Unsaved Changes Manager

### Manager Interface

```typescript
export interface UnsavedChangesManager {
  /** Check if there are unsaved changes */
  hasChanges(moduleId: string): boolean;
  
  /** Get all unsaved changes for a module */
  getChanges(moduleId: string): SettingsChange[];
  
  /** Get all unsaved changes across all modules */
  getAllChanges(): SettingsChange[];
  
  /** Mark a value as changed */
  markChanged(moduleId: string, key: string, value: unknown): void;
  
  /** Clear changes for a module (after save) */
  clear(moduleId: string): void;
  
  /** Clear all changes */
  clearAll(): void;
  
  /** Save all changes */
  saveAll(): Promise<void>;
}

export interface SettingsChange {
  moduleId: string;
  key: string;
  previousValue: unknown;
  newValue: unknown;
  timestamp: string;
}
```

### Manager Implementation

```typescript
export class UnsavedChangesManagerImpl implements UnsavedChangesManager {
  private changes = new Map<string, SettingsChange[]>();

  constructor(
    private store: SettingsStore,
    private eventBus: EventBus,
  ) {}

  hasChanges(moduleId: string): boolean {
    const moduleChanges = this.changes.get(moduleId);
    return moduleChanges ? moduleChanges.length > 0 : false;
  }

  getChanges(moduleId: string): SettingsChange[] {
    return this.changes.get(moduleId) || [];
  }

  getAllChanges(): SettingsChange[] {
    const allChanges: SettingsChange[] = [];
    for (const moduleChanges of this.changes.values()) {
      allChanges.push(...moduleChanges);
    }
    return allChanges;
  }

  async markChanged(moduleId: string, key: string, value: unknown): Promise<void> {
    // Get previous value
    const previous = await this.store.get(moduleId, key);
    const previousValue = previous?.value;

    // Create change record
    const change: SettingsChange = {
      moduleId,
      key,
      previousValue,
      newValue: value,
      timestamp: new Date().toISOString(),
    };

    // Add to changes
    const moduleChanges = this.changes.get(moduleId) || [];
    moduleChanges.push(change);
    this.changes.set(moduleId, moduleChanges);

    // Emit event
    this.eventBus.emit('settings:unsaved', change);
  }

  clear(moduleId: string): void {
    this.changes.delete(moduleId);
    this.eventBus.emit('settings:saved', { moduleId });
  }

  clearAll(): void {
    this.changes.clear();
    this.eventBus.emit('settings:saved', { all: true });
  }

  async saveAll(): Promise<void> {
    for (const [moduleId, changes] of this.changes.entries()) {
      for (const change of changes) {
        await this.store.set(moduleId, change.key, change.newValue);
      }
      this.changes.delete(moduleId);
    }

    this.eventBus.emit('settings:saved', { all: true });
  }
}
```

## Validation Engine

### Engine Interface

```typescript
export interface ValidationEngine {
  /** Validate a single value */
  validate(entry: SettingsEntry, value: unknown): ValidationResult;
  
  /** Validate all values for a module */
  validateModule(moduleId: string, values: Record<string, unknown>): ValidationResult;
  
  /** Validate all settings */
  validateAll(values: Record<string, Record<string, unknown>>): ValidationResult;
}

export interface ValidationResult {
  success: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  moduleId: string;
  key: string;
  message: string;
  path: string[];
}
```

### Engine Implementation

```typescript
export class ZodValidationEngine implements ValidationEngine {
  validate(entry: SettingsEntry, value: unknown): ValidationResult {
    let schema: z.ZodType;

    switch (entry.type) {
      case 'string':
        schema = z.string();
        break;
      case 'number':
        schema = z.number();
        break;
      case 'boolean':
        schema = z.boolean();
        break;
      case 'select':
        schema = z.enum(entry.validation?.options || []);
        break;
      case 'multi-select':
        schema = z.array(z.enum(entry.validation?.options || []));
        break;
      case 'json':
        schema = z.record(z.unknown());
        break;
      case 'color':
        schema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
        break;
      default:
        schema = z.unknown();
    }

    const result = schema.safeParse(value);
    
    if (result.success) {
      return { success: true };
    }

    return {
      success: false,
      errors: result.error.errors.map((e) => ({
        moduleId: entry.moduleId,
        key: entry.key,
        message: e.message,
        path: e.path.map(String),
      })),
    };
  }

  validateModule(moduleId: string, values: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    
    for (const [key, value] of Object.entries(values)) {
      const entry = this.registry.getEntry(moduleId, key);
      if (entry) {
        const result = this.validate(entry, value);
        if (!result.success && result.errors) {
          errors.push(...result.errors);
        }
      }
    }

    return errors.length === 0 ? { success: true } : { success: false, errors };
  }
}
```

## Persistence Layer

### SQLite Schema

```sql
-- Settings values
CREATE TABLE settings_values (
  module_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (module_id, key),
  FOREIGN KEY (module_id) REFERENCES settings_modules(id)
);

-- Settings history (for rollback)
CREATE TABLE settings_history (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
```

### Sync with .vestara/

Settings are synced to `.vestara/settings/` for portability:

```typescript
export class SettingsSync {
  constructor(
    private store: SettingsStore,
    private syncDir: string,
  ) {}

  async syncToDir(): Promise<void> {
    const modules = await this.store.getAllModules();
    
    for (const module of modules) {
      const values = await this.store.getAll(module.id);
      const filePath = path.join(this.syncDir, `${module.id}.json`);
      
      await fs.writeFile(filePath, JSON.stringify(values, null, 2));
    }
  }

  async syncFromDir(): Promise<void> {
    const files = await fs.readdir(this.syncDir);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const moduleId = file.replace('.json', '');
        const filePath = path.join(this.syncDir, file);
        const data = await fs.readFile(filePath, 'utf-8');
        const values = JSON.parse(data);
        
        for (const [key, value] of Object.entries(values)) {
          await this.store.set(moduleId, key, value);
        }
      }
    }
  }
}
```

## Event Integration

State changes emit events for other modules to react:

```typescript
// Subscribe to changes
eventBus.on('setting:changed', (event) => {
  console.log(`Setting changed: ${event.moduleId}.${event.key}`);
  console.log(`New value: ${event.value}`);
});

eventBus.on('settings:unsaved', (event) => {
  // Show unsaved indicator in UI
  showUnsavedIndicator(event.moduleId);
});

eventBus.on('settings:saved', (event) => {
  // Hide unsaved indicator
  hideUnsavedIndicator(event.moduleId);
});
```
