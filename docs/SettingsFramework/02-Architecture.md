# Settings Framework — Architecture

## Layer Position

```
Layer 0: Identity        (Actor identity system)
Layer 1: Relationships   (Actor connections)
Layer 2: Capabilities    (Skill matching)
Layer 3: Knowledge       (Information assets)
Layer 4: Governance      (Decision authority)
Layer 5: Settings        (Configuration management) ← HERE
Layer 6: Runtime         (Execution engine)
Layer 7: Workflow        (Process orchestration)
```

## Core Architecture Principles

1. **Module-Based Composition** — Each settings domain is an independent module
2. **Registry-Driven Navigation** — Routes and sidebar generated from registry
3. **Contract-First Design** — Interfaces defined before implementation
4. **Permission-Aware** — Every module respects role-based access
5. **Validation at Boundaries** — Zod schemas validate all data flow
6. **Event-Driven Updates** — Modules communicate through EventBus
7. **Persistent State** — Settings stored in SQLite, synced via .vestara/

## System Architecture

```
Settings Framework
│
├── Module System
│   ├── Module Registry          (registers modules)
│   ├── Module Loader            (lazy loads modules)
│   └── Module Lifecycle         (init, activate, deactivate, destroy)
│
├── Navigation
│   ├── Route Registry           (URL → module mapping)
│   ├── Sidebar Generator        (auto-generates sidebar from registry)
│   ├── Breadcrumb Builder       (path-based breadcrumbs)
│   └── Search Index             (cross-module search)
│
├── State Management
│   ├── Settings Store           (centralized state)
│   ├── Persistence Layer        (SQLite + .vestara/ sync)
│   ├── Unsaved Changes Manager  (dirty tracking)
│   └── Validation Engine        (Zod-based)
│
├── Permission System
│   ├── Role Registry            (role definitions)
│   ├── Permission Checker       (access control)
│   └── Audit Logger             (permission events)
│
├── Plugin System
│   ├── Plugin Registry          (extension points)
│   ├── Plugin Loader            (dynamic loading)
│   └── Plugin Lifecycle         (install, activate, deactivate)
│
├── Import/Export
│   ├── Settings Serializer      (JSON export)
│   ├── Settings Deserializer    (JSON import)
│   ├── Validation Pipeline      (import validation)
│   └── Migration Engine         (version upgrades)
│
└── Reset Engine
    ├── Default Values           (per-module defaults)
    ├── Reset Pipeline           (selective reset)
    └── Rollback System          (version-based recovery)
```

## Data Flow

```
User Interaction
    ↓
Settings UI Component
    ↓
Module Handler
    ↓
Validation (Zod)
    ↓
Settings Store
    ↓
EventBus (notify other modules)
    ↓
Persistence (SQLite)
    ↓
Sync (.vestara/)
```

## Module Communication

Modules communicate through the EventBus, not direct imports:

```typescript
// Module A emits
eventBus.emit('settings:providers:changed', { providerId: 'openai' });

// Module B subscribes
eventBus.on('settings:providers:changed', (event) => {
  // Update routing based on provider change
});
```

## File Structure

```
settings-framework/
├── src/
│   ├── core/
│   │   ├── module-registry.ts
│   │   ├── module-loader.ts
│   │   ├── route-registry.ts
│   │   ├── settings-store.ts
│   │   ├── permission-engine.ts
│   │   ├── search-engine.ts
│   │   ├── validation-engine.ts
│   │   └── event-bus.ts
│   ├── modules/
│   │   ├── ai/
│   │   │   ├── providers/
│   │   │   ├── routing/
│   │   │   ├── memory/
│   │   │   └── agents/
│   │   ├── workspace/
│   │   │   ├── layout/
│   │   │   ├── widgets/
│   │   │   └── profiles/
│   │   ├── appearance/
│   │   │   ├── theme/
│   │   │   ├── typography/
│   │   │   └── colors/
│   │   ├── system/
│   │   │   ├── updates/
│   │   │   ├── logs/
│   │   │   └── storage/
│   │   └── security/
│   │       ├── authentication/
│   │       ├── permissions/
│   │       └── api-keys/
│   ├── shared/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── utils/
│   └── api/
│       ├── settings-api.ts
│       └── validation.ts
├── contracts/
│   ├── module.ts
│   ├── route.ts
│   ├── permission.ts
│   └── settings.ts
├── testing/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── README.md
```
