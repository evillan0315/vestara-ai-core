# CLI Status Command Implementation Plan

## Overview

Complete the 4 "not implemented" sections in `vestara-ai-core/apps/cli/src/commands/status.ts`:

1. **API Gateway** (lines 421-429)
2. **Workspace Runtime** (lines 431-439)
3. **Routing** (lines 441-449)
4. **Database** (lines 451-459)

---

## 1. API Gateway Implementation

### Requirements
- Check API server health: running status, port, registered routes count, WebSocket connections, uptime

### Files to Modify
- `apps/cli/src/commands/status.ts` - Main implementation
- `apps/cli/src/lib/api-client.ts` (new) - API health client utilities

### Dependencies to Import
```typescript
// In status.ts
import { fetch } from 'node:fetch'; // or use global fetch (Node 22+)
```

### Implementation Approach

**Option A: Direct HTTP Check (Recommended)**
- Use existing `runtimeAvailable()` pattern from `apps/cli/src/index.ts:142`
- Extend to call `/api/health/ready` endpoint which returns detailed readiness info
- Parse response for: status, workspace status, HTTP metrics, WS connections

**Option B: Shared Context (if CLI has runtime)**
- If CLI has access to `ApiRuntime` or server instance, query directly
- Currently CLI runs independently, so HTTP is the only option

### API Endpoints to Use
- `GET /api/health/live` - Basic liveness (returns `{status: 'ok'}`)
- `GET /api/health/ready` - Detailed readiness (returns `{status, ready, workspaceStatus}`)
- `GET /api/telemetry/http` - HTTP metrics (request counts, durations, errors)

### Data to Collect
```typescript
interface ApiGatewayStatus {
  running: boolean;
  port: number;
  baseUrl: string;
  health: 'ok' | 'degraded' | 'unreachable';
  workspaceStatus: string;
  registeredRoutes: number;
  websocketConnections: number;
  uptimeSeconds: number;
  httpMetrics: {
    totalRequests: number;
    avgDurationMs: number;
    errorRate: number;
  };
}
```

### Implementation Steps
1. Read `VESTARA_API_URL` env var (default `http://127.0.0.1:3001`)
2. Try `/api/health/ready` with 300ms timeout
3. If ready, fetch `/api/telemetry/http` for metrics
4. Count routes from `ROUTE_DEFS` in server.ts (static: 63 route groups)
5. Get WebSocket connections from server (not exposed, may need new endpoint)
6. Calculate uptime from process start time (not available remotely, estimate from readiness)

---

## 2. Workspace Runtime Implementation

### Requirements
- Use existing `WorkspaceRuntimeService.getRuntimeHealth()` which returns:
  - health status (healthy/degraded/unhealthy)
  - indexed files/dirs count
  - git repo status
  - watcher status
  - uptime

### Files to Modify
- `apps/cli/src/commands/status.ts` - Main implementation

### Dependencies to Import
```typescript
import { WorkspaceRuntimeService } from '@vestara/workspace';
import type { WorkspaceRuntimeServiceHealth } from '@vestara/workspace';
```

### Implementation Approach

The CLI already has a pattern for this in `apps/cli/src/context/cli-context.ts`:
- Creates `WorkspaceRuntimeService` with `rootDir: process.cwd()`
- Calls `getRuntimeHealth()` after initialization

### Key Code Location
- `packages/workspace/src/workspace-runtime-service.ts:204-214` - `getRuntimeHealth()` method
- Returns `WorkspaceRuntimeServiceHealth` interface (lines 40-47)

### Data to Collect
```typescript
interface WorkspaceRuntimeStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  indexedFiles: number;
  indexedDirectories: number;
  isGitRepository: boolean;
  gitBranch?: string;
  gitStatus?: 'clean' | 'has uncommitted changes';
  watcherActive: boolean;
  uptimeSeconds: number;
  rootDir: string;
  projectProfile?: {
    name: string;
    language: string;
    frameworks: string[];
    isMonorepo: boolean;
  };
}
```

### Implementation Steps
1. Instantiate `WorkspaceRuntimeService` with `{ rootDir: process.cwd() }`
2. Call `await runtime.initialize()` (or `start()`)
3. Call `getRuntimeHealth()`
4. Optionally get profile info from `runtime.profile`
5. Clean up: `await runtime.stop(); await runtime.destroy()`

### Error Handling
- Wrap in try/catch (pattern used for other sections)
- Show "(not available)" if workspace runtime fails to initialize

---

## 3. Routing Implementation

### Requirements
- Check routing configuration:
  - Active profile
  - Catalog candidates count
  - Health status
  - Assignments count
  - Routing store revision

### Files to Modify
- `apps/cli/src/commands/status.ts` - Main implementation

### Dependencies to Import
```typescript
import { FileRoutingStore, FileRoutingAssignmentStore } from '@vestara/provider-runtime';
import { DefaultProviderManager } from '@vestara/provider-runtime';
import { OpenCodeProvider } from '@vestara/provider-opencode';
import { OpenCodeGoProvider } from '@vestara/provider-opencode';
import { OpenAIProvider } from '@vestara/provider-opencode';
import * as path from 'node:path';
import * as fs from 'node:fs';
```

### Implementation Approach

Routing data is stored in workspace `.vestara/` directory:
- `routing.json` - `FileRoutingStore` (versioned selection)
- `routing-assignments.json` - `FileRoutingAssignmentStore`

Need to:
1. Find workspace directory (same logic as API: look for `.vestara/workspace.json`)
2. Open routing store and assignment store
3. Get provider manager with providers initialized to check catalog health

### Key Code Locations
- `apps/api/src/workspace-context.ts:504-509` - Routing store initialization
- `apps/api/src/routes/routing.ts:70-73` - Catalog endpoint
- `packages/provider-runtime/src/routing-state.ts` - `FileRoutingStore` and `VersionedRoutingStore`

### Data to Collect
```typescript
interface RoutingStatus {
  activeProfile: string;
  profileRevision: number;
  updatedAt: string;
  updatedByClientId: string;
  roles: Record<string, { providerId: string; modelId: string }>;
  catalogCandidates: number;
  availableCandidates: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  assignmentsCount: number;
  assignmentsByStatus: Record<string, number>;
}
```

### Implementation Steps
1. Resolve workspace directory (reuse `resolveRepoRoot` logic from API or check `.vestara/workspace.json`)
2. Open `FileRoutingStore` at `{workspaceDir}/routing.json`
3. Call `routingStore.get()` for selection + revision
4. Open `FileRoutingAssignmentStore` at `{workspaceDir}/routing-assignments.json`
5. Call `routingAssignments.list()` for assignments
6. Initialize provider manager with providers to get catalog health
7. Call `providerManager.routing.catalog.list(providerManager.routing.health)` for candidates

---

## 4. Database Implementation

### Requirements
- Check database file:
  - Existence
  - File size
  - Migration version
  - Table counts (agents, projects, executions, etc.)
  - Connection status

### Files to Modify
- `apps/cli/src/commands/status.ts` - Main implementation

### Dependencies to Import
```typescript
import { openSharedDb } from '../lib/db.js';
import { PLANS_MANIFEST } from '@vestara/workspace';
import * as fs from 'node:fs';
import * as path from 'node:path';
```

### Implementation Approach

The CLI already uses `openSharedDb()` in other sections (agents, projects). This:
- Opens `sql.js` database at `.vestara/plans/plans.db`
- Runs `PLANS_MANIFEST` migrations
- Returns connected `Database` instance

### Key Code Locations
- `apps/cli/src/lib/db.ts` - `openSharedDb()` function
- `packages/workspace/src/agent-migrations.ts` - `PLANS_MANIFEST` with migration history
- `packages/workspace/src/workspace-migrations.ts` - `WORKSPACE_DOMAIN_MANIFEST`
- `packages/workflow-orchestrator` - `ORCHESTRATION_MIGRATIONS`

### Data to Collect
```typescript
interface DatabaseStatus {
  filePath: string;
  exists: boolean;
  fileSizeBytes: number;
  fileSizeHuman: string;
  migrationVersion: number; // user_version from PRAGMA
  migrationLog: Array<{ version: number; name: string; appliedAt: string }>;
  tables: {
    agents: number;
    agent_executions: number;
    agent_teams: number;
    agent_schedules: number;
    agent_memory: number;
    execution_sessions: number;
    projects: number;
    sprints: number;
    tasks: number;
    plans: number;
    change_sets: number;
    verifications: number;
    collaborations: number;
    approvals: number;
    conversations: number;
    knowledge_graph_nodes: number;
    knowledge_graph_relations: number;
    // ... other tables
  };
  connectionStatus: 'connected' | 'error';
  error?: string;
}
```

### Implementation Steps
1. Resolve database path (same as `openSharedDb`: `.vestara/plans/plans.db`)
2. Check file existence and size with `fs.statSync()`
3. Open database via `openSharedDb()` (this runs migrations)
4. Query `PRAGMA user_version` for current migration version
5. Query `SELECT * FROM _vestara_migrations` for migration log
5. For each known table, run `SELECT COUNT(*) FROM table_name`
6. Handle missing tables gracefully (some may not exist if migrations not run)

---

## Test Approach

### Unit Tests
- Add test cases in `apps/cli/__tests__/status.test.ts`
- Mock the new imports (`WorkspaceRuntimeService`, `FileRoutingStore`, etc.)
- Test each section with:
  - Success case (mocked data)
  - Failure case (throw error, shows "not available")
  - JSON output format
  - Default/brief/table/csv/yaml formats

### Integration Tests
- Run `pnpm --filter @vestara/cli test -- apps/cli/__tests__/status.test.ts`
- Test with actual workspace (requires built packages)

### Manual Verification
```bash
# Test all sections
pnpm vestara status --section=apiGateway,workspaceRuntime,routing,database

# Test JSON output
pnpm vestara status --section=apiGateway,workspaceRuntime,routing,database --format=json

# Test brief format
pnpm vestara status --section=apiGateway,workspaceRuntime,routing,database --format=brief
```

---

## Order of Implementation

| Order | Section | Complexity | Dependencies |
|-------|---------|------------|--------------|
| 1 | **Workspace Runtime** | Low | Uses existing `WorkspaceRuntimeService` pattern from `cli-context.ts` |
| 2 | **Database** | Low | Uses existing `openSharedDb()` pattern from agents/projects sections |
| 3 | **Routing** | Medium | Requires finding workspace dir, initializing provider manager |
| 4 | **API Gateway** | Medium | Requires HTTP calls to running API; may need new telemetry endpoint |

### Rationale
1. **Workspace Runtime** - Most self-contained, follows existing pattern in codebase
2. **Database** - Already have db connection logic, just need to add metadata queries
3. **Routing** - Requires provider manager initialization, more setup
4. **API Gateway** - Depends on external API server running; most complex

---

## Implementation Details by Section

### Section 1: Workspace Runtime (Easiest - Start Here)

```typescript
// In status.ts, replace lines 431-439
if (sections.includes('workspaceRuntime')) {
  try {
    const { WorkspaceRuntimeService } = await import('@vestara/workspace');
    const runtime = new WorkspaceRuntimeService({
      rootDir: process.cwd(),
      id: 'cli-status-check',
      type: 'workspace',
    });
    await runtime.start();
    const health = runtime.getRuntimeHealth();
    const profile = runtime.profile;
    
    if (useJson) {
      data.workspaceRuntime = {
        status: health.status,
        indexedFiles: health.indexedFiles,
        indexedDirectories: health.indexedDirectories,
        isGitRepository: health.isGitRepository,
        gitBranch: profile?.git?.branch?.() ?? null,
        gitStatus: profile?.git?.status?.()?.hasUncommitted ? 'has uncommitted changes' : 'clean',
        watcherActive: health.watcherActive,
        uptimeSeconds: health.uptime,
        rootDir: process.cwd(),
        projectProfile: profile ? {
          name: profile.name,
          language: profile.primaryLanguage.name,
          frameworks: profile.frameworks.map(f => f.name),
          isMonorepo: profile.isMonorepo,
        } : null,
      };
    } else if (!useBrief) {
      console.log(`  ${BOLD}Workspace Runtime${RESET}`);
      console.log(`    Status:      ${health.status === 'healthy' ? `${GREEN}${health.status}${RESET}` : health.status === 'degraded' ? `${GOLD}${health.status}${RESET}` : `${RED}${health.status}${RESET}`}`);
      console.log(`    Indexed:     ${health.indexedFiles} files, ${health.indexedDirectories} dirs`);
      console.log(`    Git:         ${health.isGitRepository ? 'yes' : 'no'} (${profile?.git?.branch?.() ?? 'unknown'})`);
      console.log(`    Watcher:     ${health.watcherActive ? `${GREEN}active${RESET}` : `${GRAY}inactive${RESET}`}`);
      console.log(`    Uptime:      ${health.uptime}s`);
      if (profile) {
        console.log(`    Project:     ${profile.name} (${profile.primaryLanguage.name})`);
        console.log(`    Frameworks:  ${profile.frameworks.map(f => f.name).join(', ') || 'none'}`);
      }
      console.log();
    }
    await runtime.stop();
    await runtime.destroy();
  } catch {
    if (!useJson && !useBrief && sections.includes('workspaceRuntime'))
      console.log(`  ${BOLD}Workspace Runtime${RESET} ${GRAY}(not available)${RESET}\n`);
  }
}
```

### Section 2: Database

```typescript
// In status.ts, replace lines 451-459
if (sections.includes('database')) {
  try {
    const dbPath = path.join(process.cwd(), '.vestara', 'plans', 'plans.db');
    const exists = fs.existsSync(dbPath);
    const stats = exists ? fs.statSync(dbPath) : null;
    const fileSize = stats?.size ?? 0;
    
    const db = await openSharedDb();
    
    // Get migration version
    const userVersionResult = db.exec('PRAGMA user_version');
    const migrationVersion = userVersionResult[0]?.values?.[0]?.[0] ?? 0;
    
    // Get migration log
    const migrationLogResult = db.exec('SELECT version, name, applied_at FROM _vestara_migrations ORDER BY version');
    const migrationLog = migrationLogResult[0]?.values?.map((row: any) => ({
      version: row[0],
      name: row[1],
      appliedAt: row[2],
    })) ?? [];
    
    // Table counts
    const tableNames = [
      'agents', 'agent_executions', 'agent_teams', 'agent_schedules',
      'agent_memory', 'execution_sessions', 'projects', 'sprints',
      'tasks', 'plans', 'change_sets', 'verifications', 'collaborations',
      'approvals', 'conversations', 'conversation_sessions', 'conversation_messages',
      'knowledge_graph_nodes', 'knowledge_graph_relations',
      'sessions', 'session_events', 'orders', 'order_items',
      'milestones', 'suggestions', 'audit_log', 'users',
      'workspace_preferences', 'workspace_manifest',
    ];
    
    const tables: Record<string, number> = {};
    for (const table of tableNames) {
      try {
        const result = db.exec(`SELECT COUNT(*) FROM ${table}`);
        tables[table] = result[0]?.values?.[0]?.[0] ?? 0;
      } catch {
        tables[table] = -1; // Table doesn't exist
      }
    }
    
    if (useJson) {
      data.database = {
        filePath: dbPath,
        exists,
        fileSizeBytes: fileSize,
        fileSizeHuman: formatBytes(fileSize),
        migrationVersion,
        migrationLog,
        tables,
        connectionStatus: 'connected',
      };
    } else if (!useBrief) {
      console.log(`  ${BOLD}Database${RESET}`);
      console.log(`    File:        ${dbPath}`);
      console.log(`    Exists:      ${exists ? `${GREEN}yes${RESET}` : `${RED}no${RESET}`}`);
      console.log(`    Size:        ${formatBytes(fileSize)}`);
      console.log(`    Migration:   v${migrationVersion}`);
      console.log(`    Migrations:  ${migrationLog.length} applied`);
      console.log(`    Tables:`);
      for (const [name, count] of Object.entries(tables)) {
        if (count >= 0) {
          console.log(`      ${name}: ${count}`);
        }
      }
      console.log();
    }
  } catch (error) {
    if (!useJson && !useBrief && sections.includes('database'))
      console.log(`  ${BOLD}Database${RESET} ${RED}(error: ${error instanceof Error ? error.message : String(error)})${RESET}\n`);
    if (useJson) {
      data.database = {
        filePath: path.join(process.cwd(), '.vestara', 'plans', 'plans.db'),
        exists: false,
        fileSizeBytes: 0,
        fileSizeHuman: '0 B',
        migrationVersion: 0,
        migrationLog: [],
        tables: {},
        connectionStatus: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Helper function
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
```

### Section 3: Routing

```typescript
// In status.ts, replace lines 441-449
if (sections.includes('routing')) {
  try {
    // Find workspace directory
    const { FileRoutingStore, FileRoutingAssignmentStore } = await import('@vestara/provider-runtime');
    const { DefaultProviderManager } = await import('@vestara/provider-runtime');
    const { OpenCodeProvider } = await import('@vestara/provider-opencode');
    const { OpenCodeGoProvider } = await import('@vestara/provider-opencode');
    const { OpenAIProvider } = await import('@vestara/provider-opencode');
    
    // Resolve workspace dir (same as API)
    function findWorkspaceDir(): string {
      let dir = process.cwd();
      const root = path.parse(dir).root;
      while (dir !== root) {
        if (fs.existsSync(path.join(dir, '.vestara', 'workspace.json'))) {
          return path.join(dir, '.vestara');
        }
        dir = path.dirname(dir);
      }
      return path.join(process.cwd(), '.vestara');
    }
    
    const workspaceDir = findWorkspaceDir();
    const routingPath = path.join(workspaceDir, 'routing.json');
    const assignmentsPath = path.join(workspaceDir, 'routing-assignments.json');
    
    const routingStore = new FileRoutingStore(routingPath, { profileId: 'balanced', roles: {} }, 'cli-status');
    const routingData = routingStore.get();
    const selection = routingData.selection;
    
    const assignmentsStore = new FileRoutingAssignmentStore(assignmentsPath);
    const assignments = assignmentsStore.list();
    
    // Initialize provider manager for catalog health
    const providerManager = new DefaultProviderManager();
    const opencode = new OpenCodeProvider();
    const opencodeGo = new OpenCodeGoProvider();
    const openai = new OpenAIProvider();
    await providerManager.register(opencode);
    await providerManager.register(opencodeGo);
    await providerManager.register(openai);
    await opencode.initialize({});
    await opencodeGo.initialize({});
    await openai.initialize({});
    
    const catalog = providerManager.routing.catalog.list(providerManager.routing.health);
    const availableCandidates = catalog.filter((c: any) => c.availability.available).length;
    
    const assignmentsByStatus: Record<string, number> = {};
    for (const a of assignments) {
      assignmentsByStatus[a.status] = (assignmentsByStatus[a.status] ?? 0) + 1;
    }
    
    if (useJson) {
      data.routing = {
        activeProfile: selection.profileId,
        profileRevision: routingData.revision,
        updatedAt: routingData.updatedAt,
        updatedByClientId: routingData.updatedByClientId,
        roles: selection.roles,
        catalogCandidates: catalog.length,
        availableCandidates,
        healthStatus: availableCandidates === catalog.length ? 'healthy' : availableCandidates > 0 ? 'degraded' : 'unhealthy',
        assignmentsCount: assignments.length,
        assignmentsByStatus,
      };
    } else if (!useBrief) {
      console.log(`  ${BOLD}Routing${RESET}`);
      console.log(`    Profile:     ${selection.profileId} (rev ${routingData.revision})`);
      console.log(`    Updated:     ${routingData.updatedAt} by ${routingData.updatedByClientId}`);
      console.log(`    Roles:`);
      for (const [role, ref] of Object.entries(selection.roles)) {
        console.log(`      ${role}: ${ref.providerId}/${ref.modelId}`);
      }
      console.log(`    Catalog:     ${catalog.length} candidates (${availableCandidates} available)`);
      console.log(`    Health:      ${availableCandidates === catalog.length ? `${GREEN}healthy${RESET}` : availableCandidates > 0 ? `${GOLD}degraded${RESET}` : `${RED}unhealthy${RESET}`}`);
      console.log(`    Assignments: ${assignments.length}`);
      for (const [status, count] of Object.entries(assignmentsByStatus)) {
        console.log(`      ${status}: ${count}`);
      }
      console.log();
    }
  } catch {
    if (!useJson && !useBrief && sections.includes('routing'))
      console.log(`  ${BOLD}Routing${RESET} ${GRAY}(not available)${RESET}\n`);
  }
}
```

### Section 4: API Gateway

```typescript
// In status.ts, replace lines 421-429
if (sections.includes('apiGateway')) {
  const apiUrl = process.env.VESTARA_API_URL ?? 'http://127.0.0.1:3001';
  const port = new URL(apiUrl).port || '3001';
  
  try {
    // Check health/ready endpoint
    const readyResponse = await fetch(new URL('/api/health/ready', apiUrl), { 
      signal: AbortSignal.timeout(500) 
    });
    const readyData = await readyResponse.json();
    
    // Get HTTP metrics
    let httpMetrics = { totalRequests: 0, avgDurationMs: 0, errorRate: 0 };
    try {
      const metricsResponse = await fetch(new URL('/api/telemetry/http', apiUrl), { 
        signal: AbortSignal.timeout(500) 
      });
      if (metricsResponse.ok) {
        const metrics = await metricsResponse.json();
        httpMetrics = {
          totalRequests: metrics.totalRequests ?? 0,
          avgDurationMs: metrics.avgDurationMs ?? 0,
          errorRate: metrics.errorRate ?? 0,
        };
      }
    } catch {
      // Metrics endpoint optional
    }
    
    // Route count (static from server.ts ROUTE_DEFS)
    const registeredRoutes = 63; // Count of route groups in server.ts
    
    // WebSocket connections (would need new endpoint, estimate for now)
    const websocketConnections = 0; // TODO: add /api/health/ws endpoint
    
    // Uptime estimation (from readiness if available)
    const uptimeSeconds = 0; // TODO: add uptime to health endpoint
    
    if (useJson) {
      data.apiGateway = {
        running: readyResponse.ok,
        port: Number(port),
        baseUrl: apiUrl,
        health: readyResponse.ok ? (readyData.ready ? 'ok' : 'degraded') : 'unreachable',
        workspaceStatus: readyData.workspaceStatus ?? 'unknown',
        registeredRoutes,
        websocketConnections,
        uptimeSeconds,
        httpMetrics,
      };
    } else if (!useBrief) {
      console.log(`  ${BOLD}API Gateway${RESET}`);
      console.log(`    Running:     ${readyResponse.ok ? `${GREEN}yes${RESET}` : `${RED}no${RESET}`}`);
      console.log(`    URL:         ${apiUrl}`);
      console.log(`    Port:        ${port}`);
      console.log(`    Health:      ${readyResponse.ok ? (readyData.ready ? `${GREEN}ok${RESET}` : `${GOLD}degraded${RESET}`) : `${RED}unreachable${RESET}`}`);
      console.log(`    Workspace:   ${readyData.workspaceStatus ?? 'unknown'}`);
      console.log(`    Routes:      ${registeredRoutes}`);
      console.log(`    WS Conns:    ${websocketConnections}`);
      console.log(`    Uptime:      ${uptimeSeconds}s`);
      console.log(`    HTTP:        ${httpMetrics.totalRequests} req, ${httpMetrics.avgDurationMs}ms avg, ${(httpMetrics.errorRate * 100).toFixed(1)}% errors`);
      console.log();
    }
  } catch {
    if (useJson) {
      data.apiGateway = {
        running: false,
        port: Number(port),
        baseUrl: apiUrl,
        health: 'unreachable',
        workspaceStatus: 'unknown',
        registeredRoutes: 0,
        websocketConnections: 0,
        uptimeSeconds: 0,
        httpMetrics: { totalRequests: 0, avgDurationMs: 0, errorRate: 0 },
      };
    } else if (!useBrief && sections.includes('apiGateway')) {
      console.log(`  ${BOLD}API Gateway${RESET}`);
      console.log(`    Running:     ${RED}no${RESET}`);
      console.log(`    URL:         ${apiUrl}`);
      console.log(`    Port:        ${port}`);
      console.log(`    Health:      ${RED}unreachable${RESET}`);
      console.log();
    }
  }
}
```

---

## Verification Commands

```bash
# Build first
cd /home/user/projects/vestara/vestara-ai-core
pnpm build

# Test each section
pnpm vestara status --section=workspaceRuntime
pnpm vestara status --section=database
pnpm vestara status --section=routing
pnpm vestara status --section=apiGateway

# Test all together
pnpm vestara status --section=workspaceRuntime,database,routing,apiGateway --format=json

# Run tests
pnpm --filter @vestara/cli test -- apps/cli/__tests__/status.test.ts

# Lint and type check
pnpm lint:check
```