# Print Status Enhancement Plan

## Overview
Enhance the existing `vestara status` CLI command with additional output formats, filtering capabilities, watch mode, and extended health checks.

## Current State
The `runSystemStatus` command in `apps/cli/src/commands/status.ts` provides:
- Default colored output with 8 sections
- `--json` machine-readable output
- `--brief` single-line summary
- Exit code 1 if providers or agents unavailable

## Enhancement Scope

### 1. Section Filtering (`--section` flag)
Allow users to display only specific sections:
```bash
vestara status --section runtime,providers,agents
vestara status --section=projects,milestones
```

### 2. Watch Mode (`--watch` / `-w` flag)
Continuous status updates with configurable interval:
```bash
vestara status --watch              # Default 5s interval
vestara status --watch --interval 2 # 2s interval
vestara status -w -i 10             # Short flags
```

### 3. Additional Output Formats
- `--format table` - Tabular output (default for non-TTY?)
- `--format csv` - CSV export
- `--format yaml` - YAML output
- `--output <file>` - Write to file instead of stdout

### 4. Extended Health Checks (New Sections)
- **API Gateway** - HTTP/WebSocket endpoint health
- **Workspace Runtime** - Connection status, active sessions
- **Routing** - Assignment queue, provider failover status
- **Database** - Connection pool, migration status

### 5. Color Theme Support
- `--theme default|light|dark|monochrome` for accessibility

### 6. Historical Comparison (Future)
- `--compare <timestamp>` - Show status delta from previous run

## Task Breakdown

### Phase 1: Core Infrastructure (Week 1)
| Task | Agent | Description |
|------|-------|-------------|
| T1.1 | Developer | Add `--section` flag parsing and filtering logic |
| T1.2 | Developer | Add `--format` flag with table/csv/yaml renderers |
| T1.3 | Developer | Add `--output` flag for file writing |
| T1.4 | Tester | Unit tests for new flag parsing and filtering |

### Phase 2: Watch Mode (Week 1-2)
| Task | Agent | Description |
|------|-------|-------------|
| T2.1 | Developer | Implement `--watch` with interval, signal handling |
| T2.2 | Developer | Add screen clearing and cursor management |
| T2.3 | Tester | Integration tests for watch mode |

### Phase 3: Extended Health Checks (Week 2)
| Task | Agent | Description |
|------|-------|-------------|
| T3.1 | Developer | Add API Gateway health check section |
| T3.2 | Developer | Add Workspace Runtime status section |
| T3.3 | Developer | Add Routing status section |
| T3.4 | Developer | Add Database health section |
| T3.5 | Tester | Tests for new health check sections |

### Phase 4: Polish & Accessibility (Week 2-3)
| Task | Agent | Description |
|------|-------|-------------|
| T4.1 | Developer | Add `--theme` flag with color schemes |
| T4.2 | Developer | Update help text and documentation |
| T4.3 | Tester | Accessibility testing, edge cases |
| T4.4 | Reviewer | Code review and linting |

## Technical Design

### Section Filtering
```typescript
interface StatusSections {
  runtime: boolean;
  audio: boolean;
  providers: boolean;
  agents: boolean;
  projects: boolean;
  milestones: boolean;
  conversationFeatures: boolean;
  testsAndBuild: boolean;
  apiGateway: boolean;      // NEW
  workspaceRuntime: boolean; // NEW
  routing: boolean;         // NEW
  database: boolean;        // NEW
}
```

### Watch Mode Implementation
- Use `setInterval` with `process.on('SIGINT')` for cleanup
- Clear screen with ANSI escape codes (`\x1b[2J\x1b[H`)
- Reuse existing data fetching, just re-render

### Output Formatters
```typescript
type OutputFormat = 'default' | 'json' | 'brief' | 'table' | 'csv' | 'yaml';

interface Formatter {
  render(data: StatusData, options: FormatOptions): string;
}
```

## Acceptance Criteria

1. `vestara status --section providers,agents` shows only those sections
2. `vestara status --watch --interval 3` updates every 3 seconds
3. `vestara status --format csv --output status.csv` writes CSV file
4. New sections (apiGateway, workspaceRuntime, routing, database) appear in default output
5. `vestara status --theme monochrome` works without colors
6. All existing tests pass + new tests for enhancements
7. `pnpm lint:check && pnpm build && pnpm test` passes

## Dependencies
- `@vestara/api` for gateway health
- `@vestara/workspace` for runtime status
- `@vestara/workflow-orchestrator` for routing status
- `sql.js` / database layer for DB health
- `yaml` package for YAML output (new dependency)

## Risks
- Watch mode may conflict with TTY detection
- New health checks add latency to status command
- File output permissions in restricted environments
- ANSI escape code compatibility across terminals