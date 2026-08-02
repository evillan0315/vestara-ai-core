# Vestara CLI & TUI Redesign Plan

## Status: DRAFT — Pending User Approval

## Executive Summary

The Vestara CLI (`apps/cli/`) and TUI (`packages/tui/`) are the primary user-facing interfaces. The CLI's entry point has grown to 938 lines with a 521-line monolithic `main()` function containing 34 if/else branches, dead code (legacy REPL, unused CommandRegistry), and duplicated sub-dispatch logic. The TUI's `app.tsx` is 923 lines with 15 sub-components crammed into a single file and a 210-line keyboard handler. Both interfaces diverge from the patterns established by other Vestara packages (interface-first design, barrel exports, component decomposition, shared utilities).

This plan restructures both to align with workspace conventions while preserving all existing functionality.

---

## Phase 0: Cleanup (Remove Dead Code)

**Goal:** Eliminate dead code before restructuring, reducing noise and false dependencies.

### 0.1 Remove `apps/console/` (deprecated shim)
- **Files to delete:** `apps/console/src/index.tsx`, `apps/console/src/controller.ts`, `apps/console/src/index.test.ts`, `apps/console/package.json`, `apps/console/tsconfig.json`, `apps/console/README.md`
- **Evidence:** Zero imports from `@vestara/console` anywhere in the codebase. The CLI's `console`/`tui` command calls `launchTui()` which imports `@vestara/tui` directly.
- **Build impact:** Remove from `tsconfig.references.json` if present.

### 0.2 Remove dead `CommandRegistry` dispatch path
- **Files to delete:** `apps/cli/src/lib/command-registry.ts`
- **Code to remove from `apps/cli/src/index.ts`:**
  - `import { CommandRegistry }` (line 43)
  - `const registry = new CommandRegistry()` (line 262)
  - `registerCommands(registry)` (line 263)
  - The entire `registerCommands()` function (lines 155-258, 104 lines)
- **Rationale:** The registry is populated but `registry.get()` is never called. The if/else chain in `main()` is the actual dispatch mechanism.

### 0.3 Remove dead legacy REPL
- **Code to remove from `apps/cli/src/index.ts`:**
  - `startRepl()` function (lines 782-912, 131 lines)
  - `startBasicRepl()` function (lines 914-933, 20 lines)
  - The entire boot sequence block behind `VESTARA_INTERNAL_LEGACY_REPL` gate (lines 660-779, ~113 lines)
  - Related imports: `readline`, `createCliContext`, `formatWorkspacePrompt`
- **Rationale:** The env gate `VESTARA_INTERNAL_LEGACY_REPL !== '1'` is never set, so lines 660-933 are unreachable.

**Net reduction:** ~530 lines from `apps/cli/src/index.ts` (938 → ~408 lines).

---

## Phase 1: CLI Command Registry (Replace If/Else Chain)

**Goal:** Replace the 34-branch if/else chain in `main()` with a proper command registry pattern, matching how the TUI controller uses lookup tables.

### 1.1 Define `CommandDef` interface
```typescript
// apps/cli/src/lib/command-registry.ts
interface CommandDef {
  name: string;
  aliases?: string[];
  description: string;
  subcommands?: string[];
  handler: (args: string[], flags: Map<string, string>) => Promise<void>;
}
```

### 1.2 Refactor each command file to export a `CommandDef`
Each command file (`commands/doctor.ts`, `commands/provider.ts`, etc.) already exports handler functions. Add a `command` export that bundles the handler with metadata:

```typescript
// commands/doctor.ts
export const doctorCommand: CommandDef = {
  name: 'doctor',
  description: 'System diagnostics',
  subcommands: ['audio', 'conversation', 'agents', 'teams', 'models', 'workspace', 'all'],
  handler: async (args, flags) => {
    const sub = args[0];
    if (sub === 'audio') return runDoctorAudio();
    if (sub === 'conversation') return runDoctorConversation();
    // ... sub-dispatch moves HERE from main()
  },
};
```

### 1.3 Create command registry and simplify `main()`
```typescript
// apps/cli/src/index.ts (after cleanup)
import { doctorCommand } from './commands/doctor';
import { providerCommand } from './commands/provider';
// ... all commands

const commands = new Map<string, CommandDef>();
for (const cmd of [doctorCommand, providerCommand, /* ... */]) {
  commands.set(cmd.name, cmd);
  for (const alias of cmd.aliases ?? []) commands.set(alias, cmd);
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) return launchTui();

  const [cmdName, ...rest] = args;
  if (cmdName === '--help' || cmdName === '-h') return printHelp();
  if (cmdName === '--version' || cmdName === '-v') return printVersion();

  const cmd = commands.get(cmdName);
  if (!cmd) { console.error(`Unknown command: ${cmdName}`); process.exitCode = 1; return; }

  const flags = parseFlags(rest);  // extract --json, --force, etc.
  await cmd.handler(rest.filter(a => !a.startsWith('--')), flags);
}
```

### 1.4 Move sub-dispatch into command files
Each command file absorbs its sub-dispatch logic (currently in `main()`):

| Command | Lines moved from `main()` | Target file |
|---------|--------------------------|-------------|
| `doctor` | Lines 347-378 (8 branches) | `commands/doctor.ts` |
| `provider` | Lines 487-557 (11 branches) | `commands/provider.ts` |
| `session` | Lines 403-426 (5 branches) | `commands/session.ts` |
| `teams` | Lines 329-340 (3 branches) | `commands/teams.ts` |
| `plan` | Lines 569-592 (6 branches) | `commands/plans.ts` |
| `task` | Lines 594-627 (6 branches) | `commands/task.ts` |
| `benchmark` | Lines 380-388 (2 branches) | `commands/benchmark.ts` |
| `demo` | Lines 389-397 (2 branches) | `commands/demo.ts` |
| `config` | Lines 458-476 (4 branches) | `commands/config.ts` |

### 1.5 Extract `launchTui` and `runtimeAvailable`
Move to `commands/tui.ts`:
```typescript
export const tuiCommand: CommandDef = {
  name: 'console',
  aliases: ['tui'],
  description: 'Launch interactive TUI',
  handler: async (args, flags) => {
    const endpoint = flags.get('endpoint');
    await launchTui(endpoint);
  },
};
```

**Net result:** `main()` drops from 521 lines to ~30 lines. Sub-dispatch logic lives in the command files that own it.

---

## Phase 2: CLI Output & Formatting

**Goal:** Align CLI output formatting with the TUI's VDS theme and other packages' patterns.

### 2.1 Consolidate help text
- Move `printHelp()` content into a structured data format (array of `{ command, description, subcommands }` objects)
- Reuse for both `vestara --help` and `vestara help <command>`
- Remove the hardcoded 70-line `console.log` block

### 2.2 Consolidate status formatting
- Create `packages/cli-shared/` or add to `apps/cli/src/lib/format.ts`:
  - `formatStatus(success, label, detail?)` — shared between CLI and TUI
  - `formatHealth(report)` — health report formatting
  - `formatTable(rows, columns?)` — tabular output for `list` commands

### 2.3 Standardize flag parsing
- Create `apps/cli/src/lib/flags.ts`:
  - `parseFlags(args: string[]): Map<string, string | boolean>`
  - `optionValue(args, flag, default?)` — replace ad-hoc `args.includes()`/`indexOf()` patterns
  - Used by all command files consistently

---

## Phase 3: TUI Component Decomposition

**Goal:** Break the 923-line `app.tsx` into focused component files, matching the workspace pattern of small, composable modules.

### 3.1 Create `packages/tui/src/components/` directory
Extract 15 sub-components into focused files:

| Component(s) | New File | Lines | Notes |
|--------------|----------|-------|-------|
| `Header` | `components/header.tsx` | ~15 | Workspace name, branch, connection |
| `Navigation` | `components/navigation.tsx` | ~12 | Left sidebar with view tabs |
| `MainView` | `components/main-view.tsx` | ~61 | View router dispatching to sub-views |
| `Conversation`, `MarkdownText`, `ToolExecution` | `components/chat.tsx` | ~85 | Conversation thread + message rendering |
| `AgentPanel` | `components/agent-panel.tsx` | ~21 | Right sidebar with agent progress |
| `Editor` | `components/editor.tsx` | ~9 | Input composer |
| `StatusBar` | `components/status-bar.tsx` | ~31 | Bottom status bar |
| `ListView` | `components/list-view.tsx` | ~19 | Generic selectable list |
| `Overlay`, `paletteCommands` | `components/overlay.tsx` | ~63 | Command palette + help overlay |
| `RoutingOverlay`, `routingProviders`, `routingModels` | `components/routing-picker.tsx` | ~76 | Three-stage routing picker |
| `Confirmation` | `components/confirmation.tsx` | ~19 | Approval prompt |
| `Toasts` | `components/toasts.tsx` | ~23 | Notification stack |
| `progress` helper | `components/progress.ts` | ~5 | Progress bar rendering |

### 3.2 Extract `useInput` handler
Split the 210-line `useInput` callback into focused hooks:
```typescript
// packages/tui/src/hooks/use-keyboard.ts
export function useKeyboard(input, cursor, view, overlay, busy, handlers): void {
  useInput((key, ctrl) => {
    if (overlay === 'palette') return handlePaletteInput(key, ctrl, handlers);
    if (overlay === 'routing') return handleRoutingInput(key, ctrl, handlers);
    if (overlay === 'help') return handleHelpInput(key, ctrl, handlers);
    return handleMainInput(key, ctrl, view, busy, handlers);
  });
}
```

### 3.3 Create `packages/tui/src/hooks/` directory
| Hook | File | Purpose |
|------|------|---------|
| `useKeyboard` | `hooks/use-keyboard.ts` | Keyboard dispatch (replaces inline useInput) |
| `useConnection` | `hooks/use-connection.ts` | WebSocket connection lifecycle |
| `useHistory` | `hooks/use-history.ts` | Command history navigation |

### 3.4 Resulting `app.tsx`
After extraction, `app.tsx` becomes ~100 lines:
```typescript
import { Header } from './components/header';
import { Navigation } from './components/navigation';
import { MainView } from './components/main-view';
import { AgentPanel } from './components/agent-panel';
import { Editor } from './components/editor';
import { StatusBar } from './components/status-bar';
import { Overlay } from './components/overlay';
import { Toasts } from './components/toasts';
import { Confirmation } from './components/confirmation';
import { useKeyboard } from './hooks/use-keyboard';

export function App({ endpoint }) {
  // 30 useState hooks (unchanged, but could use useReducer for related state)
  // ...
  useKeyboard({ input, cursor, view, overlay, busy, /* handlers */ });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header workspace={workspace} connection={connection} />
      <Box flexDirection="row" flex={1}>
        <Navigation view={view} onSelect={setView} />
        <MainView view={view} /* ... */ />
        {agentPanel && <AgentPanel agents={agents} />}
      </Box>
      <Editor input={input} busy={busy} /* ... */ />
      <StatusBar workspace={workspace} /* ... */ />
      <Overlay /* ... */ />
      <Toasts toasts={toasts} />
      <Confirmation /* ... */ />
    </Box>
  );
}
```

---

## Phase 4: Shared Utilities (CLI ↔ TUI Alignment)

**Goal:** Eliminate duplicated logic between CLI and TUI by extracting shared utilities.

### 4.1 Create `packages/cli-shared/` package
A new workspace package for CLI/TUI shared code:

```
packages/cli-shared/
  package.json
  tsconfig.json
  src/
    index.ts          # barrel export
    help-data.ts      # structured help text (commands, descriptions, subcommands)
    flag-parser.ts    # --json, --force, --endpoint flag parsing
    format.ts         # ANSI colors, renderStatus, renderStep, formatTable
    status.ts         # formatHealth, formatWorkspace, formatRouting
    types.ts          # shared CLI/TUI types (CommandDef, FlagMap, etc.)
  __tests__/
    index.test.ts
```

### 4.2 Help data structure
```typescript
// packages/cli-shared/src/help-data.ts
export interface CommandHelp {
  name: string;
  description: string;
  subcommands?: { name: string; description: string }[];
  examples?: string[];
}

export const commands: CommandHelp[] = [
  { name: 'doctor', description: 'System diagnostics', subcommands: [
    { name: 'audio', description: 'Check audio providers' },
    { name: 'conversation', description: 'Check conversation engine' },
    // ...
  ]},
  // ...
];
```

Both CLI (`printHelp()`) and TUI (`Overlay` help screen) consume this data.

### 4.3 Shared status formatting
```typescript
// packages/cli-shared/src/status.ts
export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: { name: string; status: string; detail?: string }[];
}

export function formatHealth(report: HealthReport, options?: { json?: boolean }): string;
export function formatWorkspace(workspace: WorkspaceSummary): string;
export function formatRouting(routing: RoutingSelection): string;
```

CLI renders to ANSI strings; TUI renders to Ink components (or both use the same data with different formatters).

---

## Phase 5: Package Structure Alignment

**Goal:** Make `apps/cli/` and `packages/tui/` follow the same structural conventions as other Vestara packages.

### 5.1 CLI package structure (after all phases)
```
apps/cli/
  package.json                    # CJS, bin: { vestara: ./dist/index.js }
  tsconfig.json
  CLI.md                          # CLI reference docs
  README.md
  src/
    index.ts                      # ~30 lines: main() + parseFlags()
    commands/
      index.ts                    # barrel: exports all command defs
      agents.ts
      architecture.ts
      benchmark.ts
      completions.ts
      config.ts
      context.ts
      demo.ts
      docs.ts
      doctor.ts                   # absorbs sub-dispatch from main()
      help.ts                     # merged help-cmd.ts + printHelp()
      host.ts
      marketplace.ts
      metrics.ts
      models.ts
      ops.ts
      open.ts
      plans.ts                    # absorbs plan sub-dispatch
      provider.ts                 # absorbs provider sub-dispatch
      projects.ts
      routing.ts
      runtime.ts
      screenshots.ts
      session.ts                  # absorbs session sub-dispatch
      status.ts
      tui.ts                      # launchTui + runtimeAvailable
      validate.ts
      version.ts
    lib/
      db.ts                       # shared SQLite helper
      flags.ts                    # NEW: standardized flag parsing
    output/
      format.ts                   # ANSI colors, renderStatus
    runtime/
      cli-runtime.ts              # CliRuntime lifecycle
  __tests__/
    index.test.ts
    commands/
      doctor.test.ts
      provider.test.ts
      marketplace.test.ts
    screenshots.test.ts
```

### 5.2 TUI package structure (after all phases)
```
packages/tui/
  package.json                    # ESM, type: module
  tsconfig.json
  README.md
  src/
    index.tsx                     # barrel: runTui(), App, types
    app.tsx                       # ~100 lines: root component
    controller.ts                 # API bridge (unchanged)
    types.ts                      # TuiEvent union, data types
    normalize.ts                  # protocol→presentation boundary
    theme.ts                      # VDS status mapping
    extensions.ts                 # marketplace extension registry
    components/
      index.ts                    # barrel: exports all components
      header.tsx
      navigation.tsx
      main-view.tsx
      chat.tsx                    # Conversation + MarkdownText + ToolExecution
      agent-panel.tsx
      editor.tsx
      status-bar.tsx
      list-view.tsx
      overlay.tsx                 # command palette + help
      routing-picker.tsx
      confirmation.tsx
      toasts.tsx
      progress.ts
    hooks/
      index.ts                    # barrel: exports all hooks
      use-keyboard.ts
      use-connection.ts
      use-history.ts
  __tests__/
    app.test.ts                   # existing integration tests
    controller.test.ts
    normalize.test.ts
    extensions.test.ts
    components/
      chat.test.ts
      overlay.test.ts
      routing-picker.test.ts
```

### 5.3 Update build references
- Add `packages/cli-shared` to `tsconfig.references.json`
- Add `apps/cli/src/commands/index.ts` as barrel export
- Add `packages/tui/src/components/index.ts` as barrel export
- Update `pnpm-workspace.yaml` if adding `packages/cli-shared`

---

## Phase 6: Testing

**Goal:** Increase test coverage from the current ~20% to >80% for both CLI and TUI.

### 6.1 CLI tests
| Test File | Coverage Target | Approach |
|-----------|----------------|----------|
| `__tests__/index.test.ts` | main(), parseFlags() | Mock process.argv, verify dispatch |
| `__tests__/commands/doctor.test.ts` | runDoctor* | Mock dynamic imports, verify output |
| `__tests__/commands/provider.test.ts` | runProvider* | Mock provider CRUD operations |
| `__tests__/commands/marketplace.test.ts` | runMarketplace | Mock marketplace service |
| `__tests__/commands/status.test.ts` | runSystemStatus | Mock health checks |
| `__tests__/lib/flags.test.ts` | parseFlags() | Pure function tests |

### 6.2 TUI tests (extend existing)
| Test File | Coverage Target | Approach |
|-----------|----------------|----------|
| `__tests__/app.test.ts` | Already has 5 cases | Add edge cases for each view |
| `__tests__/components/chat.test.ts` | Message rendering | Render with stub data |
| `__tests__/components/overlay.test.ts` | Palette + help | Keyboard simulation |
| `__tests__/components/routing-picker.test.ts` | Routing selection | Multi-step selection flow |
| `__tests__/hooks/use-keyboard.test.ts` | Keyboard dispatch | Input simulation |

---

## Phase 7: Documentation

### 7.1 Update CLI.md
- Reflect new command structure
- Document all flags and subcommands
- Add examples for each command

### 7.2 Update TUI README.md
- Document component architecture
- Document extension points (TuiExtensionRegistry)
- Document keyboard shortcuts

### 7.3 Update AGENTS.md
- Reflect CLI/TUI restructuring
- Update command examples if any changed

---

## Implementation Order

| Phase | Depends On | Estimated Effort | Risk |
|-------|-----------|-----------------|------|
| 0: Cleanup | None | ~1 hour | Low — removing dead code |
| 1: Command Registry | Phase 0 | ~3 hours | Medium — refactoring dispatch |
| 2: Output & Formatting | Phase 1 | ~1 hour | Low — utility extraction |
| 3: TUI Decomposition | Phase 0 | ~2 hours | Medium — component extraction |
| 4: Shared Utilities | Phases 1-3 | ~1 hour | Low — new package |
| 5: Package Structure | Phases 1-4 | ~1 hour | Low — directory reorganization |
| 6: Testing | Phases 1-5 | ~3 hours | Low — additive |
| 7: Documentation | Phase 6 | ~1 hour | Low — updates only |

**Total estimated effort:** ~13 hours

---

## Verification Checklist

After each phase, verify:
- [ ] `pnpm build` succeeds (all packages compile)
- [ ] `pnpm test` passes (all tests green, excluding pre-existing Blueprint hash drift)
- [ ] `pnpm lint` passes (Biome check)
- [ ] `vestara --help` works (CLI help output correct)
- [ ] `vestara doctor` works (diagnostics pass)
- [ ] `vestara console` works (TUI launches)
- [ ] `vestara marketplace list` works (marketplace commands functional)
- [ ] No regressions in existing functionality

---

## Open Questions

1. **Should `packages/cli-shared/` be a separate package or just `apps/cli/src/lib/`?**
   - Pro: Separate package allows TUI to import shared code
   - Con: Adds a new package to the workspace (79 → 80 projects)
   - Recommendation: Start with `apps/cli/src/lib/`, extract to package only if TUI needs it

2. **Should the TUI use `useReducer` instead of 30 `useState` hooks?**
   - Pro: Reduces state complexity, makes state transitions explicit
   - Con: Larger refactor, changes existing patterns
   - Recommendation: Defer to a future phase; current `useState` pattern works

3. **Should we adopt a CLI framework (yargs/commander)?**
   - Pro: Eliminates hand-rolled dispatch, adds auto-generated help
   - Con: Adds dependency, changes existing patterns, may not fit all use cases
   - Recommendation: No — the current registry pattern is sufficient and avoids external dependencies

4. **Should `vestara console` and `vestara tui` be unified?**
   - They already are — both call `launchTui()`. The alias is fine.

---

## Risk Mitigation

- **Phase 0 is safe** — removing dead code can't break anything
- **Phase 1 is the riskiest** — refactoring command dispatch. Mitigate by running full test suite after
- **Phase 3 is mechanical** — extracting components is straightforward but tedious
- **All phases preserve behavior** — no functional changes, only structural
- **Build verification after every phase** — catch compilation errors immediately
