---
title: Settings Framework — Identity Model (Layer 0)
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Settings Framework — Identity Model (Layer 0)

## Purpose

The Identity Model is the foundational layer (Layer 0) of the Settings Framework. Every entity that participates in the settings system — modules, plugins, users, roles, permissions — is represented as an Actor with a persistent identity.

## Core Principle

> **Everything with identity is an Actor.**

This includes:
- Settings Modules
- Settings Plugins
- Users (humans and AI agents)
- Roles
- Permissions
- Capabilities
- Knowledge Objects
- Configuration Profiles

## Actor Identity

### Actor Interface

```typescript
export interface Actor {
  /** Immutable unique identifier */
  readonly uid: string;
  
  /** Human-readable name */
  readonly name: string;
  
  /** Actor type classification */
  readonly type: ActorType;
  
  /** Current status */
  status: ActorStatus;
  
  /** When the actor was created */
  readonly createdAt: string;
  
  /** When the actor was last updated */
  updatedAt: string;
  
  /** Arbitrary metadata */
  metadata: Record<string, unknown>;
}

export type ActorType = 
  | 'module'
  | 'plugin'
  | 'user'
  | 'role'
  | 'permission'
  | 'capability'
  | 'knowledge'
  | 'profile';

export type ActorStatus = 
  | 'active'
  | 'inactive'
  | 'suspended'
  | 'archived';
```

### Actor Identity Schema

```typescript
import { z } from 'zod';

export const ActorSchema = z.object({
  uid: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(['module', 'plugin', 'user', 'role', 'permission', 'capability', 'knowledge', 'profile']),
  status: z.enum(['active', 'inactive', 'suspended', 'archived']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}),
});

export type Actor = z.infer<typeof ActorSchema>;
```

## Actor Relationships

Actors connect through relationships, not hierarchies.

### Relationship Interface

```typescript
export interface ActorRelationship {
  /** Unique identifier */
  readonly uid: string;
  
  /** Source actor */
  readonly sourceUid: string;
  
  /** Target actor */
  readonly targetUid: string;
  
  /** Relationship type */
  readonly type: RelationshipType;
  
  /** Relationship metadata */
  metadata: Record<string, unknown>;
  
  /** When the relationship was created */
  readonly createdAt: string;
}

export type RelationshipType =
  | 'contains'        // Module contains Section
  | 'provides'        // Module provides Setting
  | 'requires'        // Module requires Capability
  | 'belongs-to'      // User belongs-to Role
  | 'grants'          // Role grants Permission
  | 'extends'         // Plugin extends Module
  | 'depends-on'      // Module depends-on Module
  | 'managed-by';     // Module managed-by User
```

### Relationship Schema

```typescript
export const ActorRelationshipSchema = z.object({
  uid: z.string().uuid(),
  sourceUid: z.string().uuid(),
  targetUid: z.string().uuid(),
  type: z.enum([
    'contains', 'provides', 'requires', 'belongs-to',
    'grants', 'extends', 'depends-on', 'managed-by',
  ]),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
});

export type ActorRelationship = z.infer<typeof ActorRelationshipSchema>;
```

## Identity Registry

### Registry Interface

```typescript
export interface IdentityRegistry {
  /** Create a new actor */
  create(actor: Omit<Actor, 'uid' | 'createdAt' | 'updatedAt'>): Actor;
  
  /** Read an actor by UID */
  read(uid: string): Actor | undefined;
  
  /** Update an actor */
  update(uid: string, updates: Partial<Actor>): Actor;
  
  /** Delete an actor (soft delete — sets status to archived) */
  delete(uid: string): void;
  
  /** List all actors of a type */
  listByType(type: ActorType): Actor[];
  
  /** List all actors with a status */
  listByStatus(status: ActorStatus): Actor[];
  
  /** Search actors by name */
  search(query: string): Actor[];
  
  /** Create a relationship between actors */
  relate(sourceUid: string, targetUid: string, type: RelationshipType, metadata?: Record<string, unknown>): ActorRelationship;
  
  /** Get all relationships for an actor */
  getRelationships(uid: string): ActorRelationship[];
  
  /** Get relationships by type */
  getRelationshipsByType(type: RelationshipType): ActorRelationship[];
  
  /** Check if a relationship exists */
  hasRelationship(sourceUid: string, targetUid: string, type: RelationshipType): boolean;
}
```

## Settings Module as Actor

Every settings module is an Actor:

```typescript
const module = identityRegistry.create({
  name: 'AI Providers',
  type: 'module',
  status: 'active',
  metadata: {
    description: 'Configure AI provider connections',
    icon: 'cpu',
    path: '/settings/ai/providers',
  },
});

// Create relationships
identityRegistry.relate(module.uid, aiModule.uid, 'belongs-to');
identityRegistry.relate(module.uid, providerCapability.uid, 'provides');
```

## User as Actor

Every user (human or AI agent) is an Actor:

```typescript
const user = identityRegistry.create({
  name: 'Eddie',
  type: 'user',
  status: 'active',
  metadata: {
    actorType: 'human',
    email: 'eddie@vestara.ai',
  },
});

// Assign role
identityRegistry.relate(user.uid, adminRole.uid, 'belongs-to');
```

## Benefits

1. **Uniform Access** — All entities accessed through same API
2. **Relationship Queries** — Find all actors connected to a given actor
3. **Type Safety** — TypeScript enforces actor types
4. **Extensibility** — New actor types added without changing core
5. **Audit Trail** — All changes tracked via updatedAt timestamps
6. **Graph Queries** — Navigate actor graph for complex queries
