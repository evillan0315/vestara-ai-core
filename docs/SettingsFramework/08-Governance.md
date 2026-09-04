---
title: Settings Framework — Governance
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Settings Framework — Governance

## Purpose

Governance defines the rules and processes by which settings modules are created, modified, and removed. It ensures consistency, security, and quality across the entire settings system.

## Governance Principles

1. **Human Authority** — Only humans can approve structural changes
2. **AI Proposal** — AI can propose changes but cannot authorize
3. **Validation Required** — All changes must be validated
4. **Audit Trail** — All changes are logged
5. **Rollback Capability** — All changes can be undone

## Change Proposals

### Proposal Interface

```typescript
export interface SettingsProposal {
  /** Unique identifier */
  readonly uid: string;
  
  /** Type of change */
  readonly type: ProposalType;
  
  /** Target module */
  readonly moduleId: string;
  
  /** Proposed changes */
  readonly changes: ProposalChanges;
  
  /** Who proposed */
  readonly proposedBy: string;
  
  /** When proposed */
  readonly proposedAt: string;
  
  /** Current status */
  status: ProposalStatus;
  
  /** Approval information */
  approvedBy?: string;
  approvedAt?: string;
  
  /** Rejection information */
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export type ProposalType = 
  | 'create-module'
  | 'update-module'
  | 'delete-module'
  | 'create-section'
  | 'update-section'
  | 'delete-section'
  | 'create-entry'
  | 'update-entry'
  | 'delete-entry'
  | 'create-permission'
  | 'update-permission'
  | 'delete-permission';

export type ProposalStatus = 
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'implemented'
  | 'rolled-back';

export interface ProposalChanges {
  current?: unknown;
  proposed: unknown;
  reason?: string;
}
```

### Proposal Schema

```typescript
export const SettingsProposalSchema = z.object({
  uid: z.string().uuid(),
  type: z.enum([
    'create-module', 'update-module', 'delete-module',
    'create-section', 'update-section', 'delete-section',
    'create-entry', 'update-entry', 'delete-entry',
    'create-permission', 'update-permission', 'delete-permission',
  ]),
  moduleId: z.string().min(1),
  changes: z.object({
    current: z.unknown().optional(),
    proposed: z.unknown(),
    reason: z.string().optional(),
  }),
  proposedBy: z.string().min(1),
  proposedAt: z.string().datetime(),
  status: z.enum(['pending', 'approved', 'rejected', 'implemented', 'rolled-back']),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
  rejectedBy: z.string().optional(),
  rejectedAt: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export type SettingsProposal = z.infer<typeof SettingsProposalSchema>;
```

## Proposal Workflow

### 1. Create Proposal

```
AI or User creates proposal
    ↓
Proposal validated against schema
    ↓
Proposal stored in database
    ↓
Event emitted: 'proposal:created'
    ↓
Governance review triggered
```

### 2. Review Proposal

```
Governance checks proposal type:
  - If structural change (create/delete module): Requires human approval
  - If content change (update setting): Can be auto-approved
    ↓
Governance validates proposal:
  - Does target module exist?
  - Does change comply with contracts?
  - Are there conflicts with other proposals?
    ↓
Governance emits 'proposal:reviewed' event
```

### 3. Approve/Reject Proposal

```
Human approves/rejects proposal
    ↓
Status updated to 'approved' or 'rejected'
    ↓
Event emitted: 'proposal:approved' or 'proposal:rejected'
    ↓
If approved:
  - Change implemented
  - Status updated to 'implemented'
  - Event emitted: 'proposal:implemented'
    ↓
If rejected:
  - Rejection reason recorded
  - Status updated to 'rejected'
  - Event emitted: 'proposal:rejected'
```

### 4. Implement Proposal

```typescript
export class SettingsGovernance {
  async implementProposal(proposalUid: string): Promise<void> {
    const proposal = await this.getProposal(proposalUid);
    
    if (proposal.status !== 'approved') {
      throw new Error('Proposal not approved');
    }

    // Implement based on type
    switch (proposal.type) {
      case 'create-module':
        await this.createModule(proposal.changes.proposed);
        break;
      case 'update-module':
        await this.updateModule(proposal.moduleId, proposal.changes.proposed);
        break;
      case 'delete-module':
        await this.deleteModule(proposal.moduleId);
        break;
      // ... other cases
    }

    // Update status
    await this.updateProposalStatus(proposalUid, 'implemented');

    // Emit event
    this.eventBus.emit('proposal:implemented', { proposal });
  }
}
```

## Rollback System

### Rollback Interface

```typescript
export interface RollbackManager {
  /** Create rollback point */
  createRollbackPoint(moduleId: string): Promise<string>;
  
  /** Rollback to point */
  rollback(moduleId: string, rollbackPointId: string): Promise<void>;
  
  /** Get rollback points */
  getRollbackPoints(moduleId: string): Promise<RollbackPoint[]>;
}

export interface RollbackPoint {
  readonly uid: string;
  readonly moduleId: string;
  readonly snapshot: Record<string, unknown>;
  readonly createdAt: string;
  readonly createdBy: string;
}
```

### Rollback Implementation

```typescript
export class SettingsRollbackManager implements RollbackManager {
  constructor(
    private store: SettingsStore,
    private db: Database,
  ) {}

  async createRollbackPoint(moduleId: string): Promise<string> {
    // Get current values
    const values = await this.store.getAll(moduleId);
    const snapshot: Record<string, unknown> = {};
    for (const value of values) {
      snapshot[value.key] = value.value;
    }

    // Store rollback point
    const uid = uuidv7();
    const stmt = this.db.prepare(`
      INSERT INTO settings_rollback_points (uid, module_id, snapshot, created_at, created_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(uid, moduleId, JSON.stringify(snapshot), new Date().toISOString(), 'system');

    return uid;
  }

  async rollback(moduleId: string, rollbackPointId: string): Promise<void> {
    // Get rollback point
    const point = await this.getRollbackPoint(rollbackPointId);
    if (!point) {
      throw new Error('Rollback point not found');
    }

    // Restore values
    for (const [key, value] of Object.entries(point.snapshot)) {
      await this.store.set(moduleId, key, value);
    }

    // Emit event
    this.eventBus.emit('module:rolled-back', { moduleId, rollbackPointId });
  }
}
```

## Audit Trail

### Audit Interface

```typescript
export interface AuditLogger {
  /** Log a change */
  log(entry: AuditEntry): Promise<void>;
  
  /** Get audit log for module */
  getByModule(moduleId: string, limit?: number): Promise<AuditEntry[]>;
  
  /** Get audit log for user */
  getByUser(userId: string, limit?: number): Promise<AuditEntry[]>;
  
  /** Get audit log by time range */
  getByTimeRange(start: string, end: string): Promise<AuditEntry[]>;
}

export interface AuditEntry {
  readonly uid: string;
  readonly moduleId: string;
  readonly action: string;
  readonly key?: string;
  readonly previousValue?: unknown;
  readonly newValue?: unknown;
  readonly performedBy: string;
  readonly performedAt: string;
  readonly metadata?: Record<string, unknown>;
}
```

### Audit Implementation

```typescript
export class SQLiteAuditLogger implements AuditLogger {
  constructor(private db: Database) {}

  async log(entry: AuditEntry): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO settings_audit_log (uid, module_id, action, key, previous_value, new_value, performed_by, performed_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      entry.uid,
      entry.moduleId,
      entry.action,
      entry.key || null,
      entry.previousValue ? JSON.stringify(entry.previousValue) : null,
      entry.newValue ? JSON.stringify(entry.newValue) : null,
      entry.performedBy,
      entry.performedAt,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    );
  }

  async getByModule(moduleId: string, limit = 100): Promise<AuditEntry[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM settings_audit_log 
      WHERE module_id = ? 
      ORDER BY performed_at DESC 
      LIMIT ?
    `);
    const rows = stmt.all(moduleId, limit) as AuditEntryRow[];
    return rows.map(this.mapRowToEntry);
  }
}
```

## Governance Events

Governance emits events for all state changes:

```typescript
// Proposal events
eventBus.on('proposal:created', (event) => { /* ... */ });
eventBus.on('proposal:reviewed', (event) => { /* ... */ });
eventBus.on('proposal:approved', (event) => { /* ... */ });
eventBus.on('proposal:rejected', (event) => { /* ... */ });
eventBus.on('proposal:implemented', (event) => { /* ... */ });

// Rollback events
eventBus.on('module:rolled-back', (event) => { /* ... */ });

// Audit events
eventBus.on('audit:logged', (event) => { /* ... */ });
```

## Role-Based Governance

### Role Permissions

```typescript
export const GovernanceRoles = {
  // Human roles
  SUPER_ADMIN: 'super-admin',     // Can approve anything
  ADMIN: 'admin',                 // Can approve module changes
  MANAGER: 'manager',             // Can approve setting changes
  
  // AI roles
  AI_ADVISOR: 'ai-advisor',       // Can propose changes
  AI_IMPLEMENTER: 'ai-implementer', // Can implement approved changes
  
  // System roles
  SYSTEM: 'system',               // Can perform system operations
} as const;
```

### Permission Matrix

| Action | Super Admin | Admin | Manager | AI Advisor | AI Implementer |
|--------|-------------|-------|---------|------------|----------------|
| Create Module | ✓ | ✓ | ✗ | Proposal | ✗ |
| Update Module | ✓ | ✓ | ✓ | Proposal | ✓ (if approved) |
| Delete Module | ✓ | ✗ | ✗ | Proposal | ✗ |
| Create Setting | ✓ | ✓ | ✓ | Proposal | ✓ (if approved) |
| Update Setting | ✓ | ✓ | ✓ | Proposal | ✓ (if approved) |
| Delete Setting | ✓ | ✓ | ✗ | Proposal | ✗ |
| Approve Proposal | ✓ | ✓ | ✗ | ✗ | ✗ |
| Reject Proposal | ✓ | ✓ | ✗ | ✗ | ✗ |
| Rollback | ✓ | ✗ | ✗ | ✗ | ✗ |
