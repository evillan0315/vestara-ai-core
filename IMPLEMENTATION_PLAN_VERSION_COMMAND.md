# Implementation Plan: `vestara version` Command

## Overview

Add a dedicated `vestara version` command that reads the version from `package.json` (not hardcoded), maintains backward compatibility with `--version` / `-v` flags, and follows existing CLI command patterns.

---

## Files to Modify

### 1. `/home/user/projects/vestara/vestara-ai-core/apps/cli/src/index.ts`
**Primary modification target** - Main CLI entry point

### 2. `/home/user/projects/vestara/vestara-ai-core/apps/cli/package.json`
**Reference only** - Version source (already exists, will be read programmatically)

### 3. `/home/user/projects/vestara/vestara-ai-core/apps/cli/__tests__/index.test.ts`
**Test additions** - Add tests for the new `version` command

---

## Specific Changes

### 1. Read Version from `package.json` (Replace Hardcoded Constant)

**Current (line 50):**
```typescript
const VERSION = '0.3.0';
```

**New approach:** Read version dynamically from `package.json` at runtime.

**Implementation:**
```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

function getVersion(): string {
  const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.version;
}

const VERSION = getVersion();
```

**Alternative (ESM-friendly, using import):**
```typescript
import packageJson from '../package.json' with { type: 'json' };
const VERSION = packageJson.version;
```
*Note: Requires TypeScript 5.3+ and `resolveJsonModule: true` in tsconfig. Check tsconfig first.*

### 2. Add `version` Command Handler

**Location:** After `printVersion()` function (around line 153)

**New function:**
```typescript
function runVersion(): void {
  console.log(`vestara v${VERSION}`);
}
```

### 3. Register `version` Command in CommandRegistry

**Location:** In `registerCommands()` function (around line 228-333)

**Add registration:**
```typescript
registry.register('version', () => runVersion());
```

### 4. Handle `version` Command in Main Argument Parser

**Location:** In `main()` function, after help/version flag checks (around line 352-355)

**Add handler:**
```typescript
if (args[0] === 'version') {
  runVersion();
  return;
}
```

### 5. Update Help Text

**Location:** In `printHelp()` function (around line 217)

**Add to commands list:**
```typescript
console.log(`    ${GREEN}version${RESET}            ${GRAY}Show version number${RESET}`);
```

**Note:** The help already shows `-v, --version` as an option (line 221), so the new command is an addition, not a replacement.

---

## Backward Compatibility

The existing flags are already handled at lines 352-355:
```typescript
if (args[0] === '--version' || args[0] === '-v') {
  printVersion();
  return;
}
```
**No changes needed** - these continue to work exactly as before.

---

## Testing Approach

### Unit Tests (Add to `apps/cli/__tests__/index.test.ts`)

```typescript
describe('index entry point', () => {
  // ... existing tests ...

  it('prints version with version command', async () => {
    const origArgv = process.argv;
    const origExit = process.exit;
    process.argv = ['node', 'vestara', 'version'];
    (process.exit as any) = vi.fn() as any;
    const { main } = await import('../src/index.js');
    const logCalls: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logCalls.push(String(msg));
    });
    await main();
    expect(logCalls.some((c) => c.includes('vestara v'))).toBe(true);
    logSpy.mockRestore();
    (process.exit as any) = origExit;
    process.argv = origArgv;
  });

  it('prints version with -v flag (backward compatibility)', async () => {
    // Existing test at line 171-186 already covers this
  });

  it('prints version with --version flag (backward compatibility)', async () => {
    // Existing test at line 171-186 already covers this
  });
});
```

### Manual Verification

```bash
# Build first
cd /home/user/projects/vestara/vestara-ai-core
pnpm build

# Test new command
node apps/cli/dist/index.js version

# Test backward compatibility
node apps/cli/dist/index.js -v
node apps/cli/dist/index.js --version

# Verify help includes version command
node apps/cli/dist/index.js --help
```

---

## Dependencies & Considerations

### 1. TypeScript Configuration
- Check if `resolveJsonModule` is enabled in `tsconfig.json`
- If using `import ... with { type: 'json' }`, requires TypeScript 5.3+
- Alternative: Use `fs.readFileSync` for broader compatibility

### 2. Build Process
- `pnpm build` must be run before testing (tests resolve from `dist/`)
- The version in `dist/` will reflect the version at build time

### 3. Package.json Version
- The CLI package (`@vestara/cli`) has its own version in `apps/cli/package.json`
- This is correct - the CLI version is what users see when running `vestara version`

### 4. No New Dependencies
- Uses only Node.js built-in modules (`fs`, `path`)
- No additional npm packages needed

### 5. Command Registry Pattern
- Follows existing pattern: `registry.register('commandName', handler)`
- Handler signature: `(args: string[]) => void | Promise<void>`
- Simple commands without subcommands don't need args

---

## Implementation Order

1. **Modify `index.ts`**: Add version reading, `runVersion()`, registration, and argument handling
2. **Run `pnpm build`**: Compile TypeScript
3. **Add test**: Extend `index.test.ts` with new test case
4. **Run tests**: `pnpm --filter @vestara/cli test`
5. **Verify manually**: Test all three invocation methods
6. **Run full quality check**: `pnpm lint:check && pnpm build && pnpm test`

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TypeScript JSON import issues | Low | Medium | Use `fs.readFileSync` fallback |
| Version mismatch (build vs runtime) | None | N/A | Version baked at build time |
| Breaking existing `-v`/`--version` | None | High | No changes to existing flag handling |
| Test failures due to stale build | Medium | Low | Always `pnpm build` before test |

---

## Acceptance Criteria

- [ ] `vestara version` prints `vestara v<version>` (e.g., `vestara v0.3.0`)
- [ ] `vestara -v` still works (backward compatible)
- [ ] `vestara --version` still works (backward compatible)
- [ ] Help text (`vestara --help`) includes `version` command
- [ ] Unit test passes for new command
- [ ] All existing tests pass
- [ ] `pnpm lint:check` passes
- [ ] `pnpm build` succeeds