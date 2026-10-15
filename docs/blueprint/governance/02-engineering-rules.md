---
title: "Engineering Rules — Universal Non-Negotiable Standards"
volume: "00-governance"
book: "Book 1: Vision & Business"
version: "1.0.0"
status: "approved"
owner: "@chief-architect"
last-reviewed: "2025-07-23"
next-review: "2026-01-23"
tags: ["engineering", "rules", "standards", "non-negotiable"]
---

# Engineering Rules

## Universal Non-Negotiable Standards for All Vestara Code

> **These rules are LAW. No exceptions. No "but this case is different." If a rule conflicts with a requirement, the requirement changes — not the rule.**

---

## ═══════════════════════════════════════════════════════════════════

### 🚫 ABSOLUTE PROHIBITIONS

### ═══════════════════════════════════════════════════════════════════

| Rule | Description | Rationale |
|------|-------------|-----------|
| **NEVER use `any`** | Zero `any` types anywhere. Use `unknown` + Zod validation or proper types. | Type safety is the foundation of maintainability. |
| **NEVER duplicate code** | Extract to `@vestara/utils`, `@vestara/types`, or shared module. | DRY prevents divergence bugs. |
| **NEVER ignore lint errors** | `pnpm lint` must pass with zero errors. Warnings allowed only with TODO ticket. | Lint catches real bugs. |
| **NEVER disable TypeScript** | No `// @ts-ignore`, `// @ts-expect-error`, `tsconfig` loosening. | TypeScript is our safety net. |
| **NEVER hardcode secrets** | API keys, tokens, passwords in `.env` only (gitignored). Use `@vestara/config`. | Security first. |
| **NEVER bypass security** | No disabled CSP, auth, rate limits, validation. Ever. | Security is not optional. |
| **NEVER introduce hidden dependencies** | All deps in `package.json`, no global state, no side-effect imports. | Reproducible builds. |
| **NEVER use `console.log` in production code** | Use `@vestara/core/logger` with appropriate levels. | Observability standards. |
| **NEVER commit without `pnpm build` passing** | CI will fail; you waste everyone's time. | Quality gate. |
| **NEVER implement without specification** | Every capability requires a complete CSP before implementation. See VSDE standard. | VSDE methodology. |

---

## ═══════════════════════════════════════════════════════════════════

### ✅ MANDATORY PATTERNS

### ═══════════════════════════════════════════════════════════════════

### 1. Always Prefer Composition Over Inheritance

```typescript
// ✅ GOOD: Composition
interface Logger { log(msg: string): void; }
interface Metrics { record(name: string, value: number): void; }
class Service {
  constructor(private readonly logger: Logger, private readonly metrics: Metrics) {}
}

// ❌ BAD: Inheritance
class BaseService { logger: Logger; }
class Service extends BaseService { }
```

### 2. Always Document New Modules

```typescript
/**
 * MemoryService manages user memories with automatic consolidation
 * and importance scoring.
 * 
 * @param db - Database instance
 * @param events - EventBus for cross-service communication
 * @example
 * const memory = new MemoryService(db, events);
 * await memory.addMemory(userId, 'fact', 'User prefers dark mode');
 */
export class MemoryService { ... }
```

### 3. Always Update Blueprint When Architecture Changes

- New module → Add to `04-platform/modules/`
- New API → Update `04-platform/api/`
- New data model → Update `12-data/models/`
- Breaking change → ADR in `00-governance/04-decision-log/`

### 4. Always Explain Breaking Changes

```markdown
## Breaking Change: ProjectService.createTask signature changed
**Before**: `createTask(projectId, userId, title)`
**After**: `createTask(projectId, userId, { title, parentId?, tags?, estimatedHours? })`
**Reason**: Support sub-tasks, tags, time tracking (Gen 1 requirements)
**Migration**: All callers updated in same PR
```

### 5. Always Use Explicit Types for Function Parameters

```typescript
// ✅ MANDATORY
function createProject(userId: string, input: CreateProjectInput): Promise<Project>

// ❌ FORBIDDEN
function createProject(userId, input) { ... }
function createProject(userId: any, input: any): any { ... }
```

### 6. Always Validate at Boundaries with Zod

```typescript
// API routes
const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  path: z.string().min(1),
});

export default async function routes(app: VestaraApp) {
  app.post('/api/projects', { preHandler: authMiddleware }, async (request) => {
    const input = CreateProjectSchema.parse(request.body); // THROWS on invalid
    // ...
  });
}
```

### 7. Always Use Parameterized Queries

```typescript
// ✅ MANDATORY
const project = db.get<Project>('SELECT * FROM projects WHERE id = ?', id);
db.run('INSERT INTO projects (id, name) VALUES (?, ?)', id, name);

// ❌ FORBIDDEN - SQL Injection
const project = db.get(`SELECT * FROM projects WHERE id = '${id}'`);
db.run(`INSERT INTO projects (id, name) VALUES ('${id}', '${name}')`);
```

### 8. Always Handle Errors Explicitly

```typescript
// ✅ MANDATORY: Typed errors
class VestaraError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500
  ) { super(message); }
}

// Usage
if (!project) throw new VestaraError('PROJECT_NOT_FOUND', 'Project not found', 404);
```

---

## ═══════════════════════════════════════════════════════════════════

### 📁 FILE & CODE ORGANIZATION

### ═══════════════════════════════════════════════════════════════════

### File Naming

| Type | Convention | Example |
|------|------------|---------|
| Source files | `kebab-case` | `memory-service.ts` |
| Test files | `kebab-case.test.ts` | `memory-service.test.ts` |
| Types/interfaces | `PascalCase` | `MemoryService`, `CreateMemoryInput` |
| Functions/variables | `camelCase` | `createMemory`, `userId` |
| Constants | `SCREAMING_SNAKE_CASE` | `DEFAULT_MODELS`, `MAX_RETRIES` |
| Directories | `kebab-case` | `memory-service/` |

### Module Organization (Feature-First)

```
services/memory/src/
├── index.ts                 # Public exports
├── memory-service.ts        # Core service
├── memory-consolidation.ts  # Consolidation logic
├── memory-search.ts         # Search logic
├── schemas.ts               # Zod schemas
├── types.ts                 # Local types (if not in @vestara/types)
├── memory-service.test.ts   # Unit tests
└── consolidation.test.ts    # Unit tests
```

### Import Order (Enforced by ESLint)

```typescript
// 1. External packages
import { z } from 'zod';
import { Database } from 'better-sqlite3';

// 2. Internal packages (workspace protocol)
import { EventBus } from '@vestara/core';
import { MemorySchema } from '@vestara/validation';

// 3. Local imports (relative)
import { consolidateMemories } from './memory-consolidation';
import { searchMemories } from './memory-search';
```

---

## ═══════════════════════════════════════════════════════════════════

### 🗄️ DATABASE RULES

### ═══════════════════════════════════════════════════════════════════

| Rule | Implementation |
|------|----------------|
| **Table names** | `snake_case` plural: `projects`, `tasks`, `activity_log` |
| **Column names** | `snake_case`: `created_at`, `user_id`, `sort_order` |
| **Primary keys** | `id TEXT PRIMARY KEY` — UUID v7 (timestamp-sortable) |
| **Timestamps** | `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL` (ISO 8601) |
| **Foreign keys** | Explicit `REFERENCES table(id) ON DELETE CASCADE` |
| **Indexes** | Explicit `CREATE INDEX idx_table_column ON table(column)` |
| **Migrations** | Additive only: `ALTER TABLE ADD COLUMN` with `PRAGMA table_info` check |
| **JSON columns** | `TEXT` with `CHECK (json_valid(column))` constraint |
| **Transactions** | Use `db.transaction(() => { ... })` for multi-statement ops |

### Migration Template

```sql
-- Migration: Add parent_id to tasks for sub-tasks
-- Date: 2025-07-23
-- Author: @backend-engineer

-- Check column doesn't exist
-- SQLite: PRAGMA table_info(tasks);
-- If parent_id not in results:

ALTER TABLE tasks ADD COLUMN parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_parent_id ON tasks(parent_id);
```

---

## ═══════════════════════════════════════════════════════════════════

### 🌐 API RULES (FASTIFY)

### ═══════════════════════════════════════════════════════════════════

### Route Handler Signature

```typescript
// ✅ MANDATORY: Use VestaraApp type
import { VestaraApp } from '../types';

export default async function routes(app: VestaraApp) {
  // app.db, app.aiRouter, app.memoryService, app.knowledgeService
  // app.agentRuntime, app.projectService, app.settingsService
  // app.events, app.broadcast — ALL TYPED
}
```

### Authentication

```typescript
// Protected routes
app.get('/api/projects', { preHandler: authMiddleware }, async (request) => {
  // request.user is typed: { id, username, role }
});

// Public routes (system, opencode)
app.get('/api/system/health'); // No auth
app.post('/api/providers/opencode/start'); // No auth
```

### Response Format

```typescript
// Success
return { success: true as const, data: projects };

// Error (thrown, caught by error handler)
throw new VestaraError('PROJECT_NOT_FOUND', 'Project not found', 404);

// Paginated
return { 
  success: true as const, 
  data: projects,
  pagination: { page, limit, total, totalPages }
};
```

### WebSocket

```typescript
app.get('/ws', { websocket: true }, (connection, request) => {
  connection.socket.on('message', (msg) => { ... });
  app.broadcast({ type: 'notification', payload: ... });
});
```

---

## ═══════════════════════════════════════════════════════════════════

### ⚛️ FRONTEND RULES (REACT + TAILWIND)

### ═══════════════════════════════════════════════════════════════════

### Component Structure

```tsx
// apps/dashboard/src/components/TaskItem.tsx
import { useState } from 'react';
import { Task } from '@vestara/types';

interface TaskItemProps {
  task: Task;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
}

export function TaskItem({ task, onUpdate, onDelete }: TaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  // ...
}
```

### Styling

- **Tailwind CSS 4** — Utility-first, no custom CSS unless necessary
- **Design tokens** — Use `vestara-*` color palette from `tailwind.config.ts`
- **Dark mode** — `dark:` prefix, respect `prefers-color-scheme`
- **Accessibility** — Semantic HTML, ARIA labels, focus management

### State Management

- **SWR** for server state (`useSWR`, `useSWRInfinite`)
- **React Context** for global UI state (theme, sidebar)
- **Local state** for ephemeral UI (modals, dropdowns)
- **NO Redux, Zustand, Jotai** — Keep it simple

### Data Fetching

```typescript
// hooks/useProjects.ts
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

export function useProjects() {
  return useSWR<Project[]>('/api/projects', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });
}
```

---

## ═══════════════════════════════════════════════════════════════════

### 🧪 TESTING RULES

### ═══════════════════════════════════════════════════════════════════

| Rule | Standard |
|------|----------|
| **Framework** | Vitest (native TypeScript, fast) |
| **Naming** | `*.test.ts` alongside source |
| **Coverage** | Services: ≥80%, Apps: ≥60% |
| **Database** | Real SQLite in-memory (`:memory:`) — no mocks |
| **API** | Test via Fastify `inject()` — real HTTP stack |
| **Frontend** | React Testing Library + Vitest |
| **E2E** | Playwright (separate repo/CI) |

### Test Structure

```typescript
// memory-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '@vestara/core';
import { EventBus } from '@vestara/core';
import { MemoryService } from './memory-service';

describe('MemoryService', () => {
  let db: Database;
  let events: EventBus;
  let service: MemoryService;

  beforeEach(() => {
    db = new Database(':memory:');
    events = new EventBus();
    service = new MemoryService(db, events);
    // Run migrations
  });

  it('adds and retrieves memories', async () => {
    await service.addMemory('user-1', 'fact', 'Test memory');
    const memories = await service.searchMemories('user-1', 'Test');
    expect(memories).toHaveLength(1);
  });
});
```

---

## ═══════════════════════════════════════════════════════════════════

### 🔧 TOOLING & ENVIRONMENT

### ═══════════════════════════════════════════════════════════════════

| Tool | Version | Config |
|------|---------|--------|
| Node.js | ≥22 LTS | `.nvmrc` |
| pnpm | ≥10 | `pnpm-workspace.yaml` |
| TypeScript | 5.x | `tsconfig.base.json` (strict) |
| ESLint | 9.x | `eslint.config.js` (flat) |
| Prettier | 3.x | `.prettierrc` |
| Vitest | Latest | `vitest.config.ts` |
| Turbo | Latest | `turbo.json` |

### Shell Commands

```bash
# ALWAYS use /usr/bin/sh (not bash, not zsh)
execSync('command', { shell: '/usr/bin/sh' });
spawn('command', [], { shell: '/usr/bin/sh' });
```

---

## ═══════════════════════════════════════════════════════════════════

### 📦 DEPENDENCY RULES

### ═══════════════════════════════════════════════════════════════════

| Rule | Enforcement |
|------|-------------|
| **No unpinned versions** | Exact versions in `package.json` (no `^`, `~`) |
| **No unused dependencies** | `pnpm dedupe` + `depcheck` in CI |
| **No duplicate utilities** | Check `@vestara/utils` first |
| **Workspace protocol** | `"@vestara/types": "workspace:*"` |
| **Peer deps explicit** | React, Fastify, Zod as peerDependencies |
| **Audit** | `pnpm audit` in CI, zero high/critical |

---

## ═══════════════════════════════════════════════════════════════════

### 🔄 GIT & COMMIT RULES

### ═══════════════════════════════════════════════════════════════════

### Conventional Commits (MANDATORY)

```
feat: Add memory consolidation scheduler
fix: Prevent memory leak in knowledge service
docs: Update API documentation for projects
refactor: Extract consolidation logic to separate module
test: Add integration tests for memory search
chore: Update dependencies
perf: Optimize project list query
security: Add rate limiting to auth endpoints
```

### Branch Naming

```
feature/memory-consolidation
fix/knowledge-search-memory-leak
refactor/extract-consolidation-logic
docs/api-documentation-update
```

### Pre-Push Checklist (AUTOMATED IN CI)

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test
```

---

## ═══════════════════════════════════════════════════════════════════

### 📝 DOCUMENTATION RULES

### ═══════════════════════════════════════════════════════════════════

| Rule | Standard |
|------|----------|
| **Public APIs** | JSDoc with `@param`, `@returns`, `@example`, `@throws` |
| **Architecture decisions** | ADR in `00-governance/04-decision-log/` |
| **Blueprint updates** | Same PR as code change |
| **README files** | Every package/service/app has one |
| **CHANGELOG** | Auto-generated from conventional commits |
| **No comments in code** | Unless explaining *why*, not *what* |

---

## ═══════════════════════════════════════════════════════════════════

### 🎯 SUMMARY: THE RULE OF THUMB

### ═══════════════════════════════════════════════════════════════════

> **If you're wondering "is this allowed?" — the answer is NO unless explicitly permitted above.**

> **If you're wondering "which pattern do I use?" — use the one in `14-engineering/` or neighboring code.**

> **If you're wondering "do I need to update the Blueprint?" — YES, if you changed architecture, APIs, data models, or added modules.**

---

**END OF ENGINEERING RULES**

*These rules are enforced by CI, code review, and AI agent constitution. Violations block merge.*
