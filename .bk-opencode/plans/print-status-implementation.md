# Print Status Implementation Plan

## Overview
Implement the 4 "not implemented" sections in `vestara-ai-core/apps/cli/src/commands/status.ts`:
1. **Workspace Runtime** - Uses existing `WorkspaceRuntimeService` pattern
2. **Database** - Uses existing `openSharedDb()` pattern  
3. **Routing** - Requires workspace dir discovery, provider manager initialization
4. **API Gateway** - Requires HTTP calls to running API server

## Current State
- Sections defined in `VALID_SECTIONS` (lines 6-19)
- Stub implementations at lines 449-487 returning "not_implemented"
- Framework for section filtering, output formats (json/table/csv/yaml/brief), and file output already implemented
- Comprehensive test suite in `apps/cli/__tests__/status.test.ts` covering existing sections

## Implementation Order (by complexity)

### Phase 1: Workspace Runtime (Week 1, Day 1-2)
**Complexity**: Low - Follows existing pattern from `cli-context.ts`
**Files**: `apps/cli/src/commands/status.ts`
**Dependencies**: `@vestara/workspace` (WorkspaceRuntimeService)

**Tasks**:
- [ ] T1.1: Import `WorkspaceRuntimeService` from `@vestara/workspace`
- [ ] T1.2: Implement section handler (replace lines 459-467)
- [ ] T1.3: Handle JSON and default output formats
- [ ] T1.4: Add error handling with "(not available)" fallback
- [ ] T1.5: Add cleanup (runtime.stop(), runtime.destroy())
- [ ] T1.6: Add unit tests for workspaceRuntime section

### Phase 2: Database (Week 1, Day 2-3)
**Complexity**: Low - Uses existing `openSharedDb()` from `apps/cli/src/lib/db.ts`
**Files**: `apps/cli/src/commands/status.ts`, `apps/cli/src/lib/db.ts` (may need to export more)
**Dependencies**: `sql.js`, `@vestara/workspace` (PLANS_MANIFEST)

**Tasks**:
- [ ] T2.1: Import required modules (openSharedDb, PLANS_MANIFEST, fs, path)
- [ ] T2.2: Implement section handler (replace lines 479-487)
- [ ] T2.3: Collect: file existence, size, migration version, migration log, table counts
- [ ] T2.4: Handle JSON and default output formats
- [ ] T2.5: Add error handling with error details in JSON
- [ ] T2.6: Add unit tests for database section

### Phase 3: Routing (Week 1, Day 3-4)
**Complexity**: Medium - Requires workspace dir discovery, multiple store initializations
**Files**: `apps/cli/src/commands/status.ts`
**Dependencies**: `@vestara/provider-runtime`, `@vestara/provider-opencode`, `fs`, `path`

**Tasks**:
- [ ] T3.1: Import FileRoutingStore, FileRoutingAssignmentStore, DefaultProviderManager, providers
- [ ] T3.2: Implement workspace dir discovery (reuse API logic)
- [ ] T3.3: Implement section handler (replace lines 469-477)
- [ ] T3.4: Open routing store, get selection + revision
- [ ] T3.5: Open assignment store, list assignments
- [ ] T3.6: Initialize provider manager with 3 providers for catalog health
- [ ] T3.7: Handle JSON and default output formats
- [ ] T3.8: Add error handling
- [ ] T3.9: Add unit tests for routing section

### Phase 4: API Gateway (Week 1-2, Day 4-5)
**Complexity**: Medium - Depends on external API server, requires HTTP endpoints
**Files**: `apps/cli/src/commands/status.ts`
**Dependencies**: Node 22+ global fetch

**Tasks**:
- [ ] T4.1: Read VESTARA_API_URL env var (default http://127.0.0.1:3001)
- [ ] T4.2: Implement section handler (replace lines 449-457)
- [ ] T4.3: Call `/api/health/ready` with 500ms timeout
- [ ] T4.4: Call `/api/telemetry/http` for metrics (optional)
- [ ] T4.5: Handle registered routes count (static: 63)
- [ ] T4.6: Handle WebSocket connections (placeholder, needs API endpoint)
- [ ] T4.7: Handle uptime (placeholder, needs API endpoint)
- [ ] T4.8: Handle JSON and default output formats
- [ ] T4.9: Add error handling for unreachable API
- [ ] T4.10: Add unit tests for apiGateway section

### Phase 5: Testing & Verification (Week 2, Day 1-2)
**Tasks**:
- [ ] T5.1: Run full test suite: `pnpm --filter @vestara/cli test`
- [ ] T5.2: Manual verification of each section:
  - `pnpm vestara status --section=workspaceRuntime`
  - `pnpm vestara status --section=database`
  - `pnpm vestara status --section=routing`
  - `pnpm vestara status --section=apiGateway`
  - `pnpm vestara status --section=workspaceRuntime,database,routing,apiGateway --format=json`
- [ ] T5.3: Lint check: `pnpm lint:check`
- [ ] T5.4: Build: `pnpm build`

## Acceptance Criteria
1. All 4 sections return real data (not "not_implemented")
2. Each section works with `--format=json`, `--format=table`, `--format=csv`, `--format=yaml`, `--format=brief`, default
3. Each section works with `--section` filtering
4. Each section works with `--output` file writing
5. Error handling shows "(not available)" in default mode, includes error in JSON
6. All existing tests pass + new tests for 4 sections
7. `pnpm lint:check && pnpm build && pnpm test` passes

## Dependencies to Verify
- `@vestara/workspace` exports `WorkspaceRuntimeService`, `PLANS_MANIFEST`
- `@vestara/provider-runtime` exports `FileRoutingStore`, `FileRoutingAssignmentStore`, `DefaultProviderManager`
- `@vestara/provider-opencode` exports `OpenCodeProvider`, `OpenCodeGoProvider`, `OpenAIProvider`
- API server has `/api/health/ready`, `/api/telemetry/http` endpoints
- `sql.js` database at `.vestara/plans/plans.db`

## Risk Mitigation
- API Gateway: Make HTTP calls optional with graceful fallback
- Routing: Handle missing workspace directory gracefully
- Database: Handle missing tables (migrations not run)
- All: 500ms timeout on external calls to prevent hangs
