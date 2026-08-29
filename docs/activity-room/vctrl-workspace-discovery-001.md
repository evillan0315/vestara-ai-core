# VCTRL-WORKSPACE-DISCOVERY-001 — Workspace UI Tests Absent from Root/CI Verification Boundary

**Status**: OPEN — Not fixed under M11C
**Discovered**: 2026-08-28 during M11C Vitest audit
**Severity**: Significant — 56/69 workspace test files invisible through root discovery

## Problem

Root `vitest.config.ts` include patterns:
```
apps/*/__tests__/**/*.test.ts
```

This excludes `.test.tsx` files. The workspace has its own `vite.config.ts` with vitest configuration that uses default discovery (`**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}`), which matches both extensions.

## Impact

| Category | Count |
|---|---|
| Total workspace test files | 69 |
| Visible through root config | 13 |
| Invisible through root config | 56 |
| `.test.tsx` files invisible | 53 |
| `src/**` tests invisible | 11 |

~81% of workspace test files not covered by root/CI verification.

## Decision Required

Before fixing, determine correct architecture:

**Option A**: Broaden root Vitest patterns to include `apps/*/__tests__/**/*.test.{ts,tsx}`
- Risk: May force React tests through root's non-jsdom test environment

**Option B**: Make CI explicitly invoke workspace-owned `pnpm test` / Vitest configuration
- Preserves workspace's `jsdom`, CSS, and Vite-specific test environment
- Cleaner separation of verification boundaries

**Recommended**: Option B — Verification Control Plane should aggregate evidence from per-boundary invocations rather than one monolithic root Vitest config.

## Pre-requisite

Before enforcing full workspace suite as CI gate:
1. Baseline existing Theme Builder test failures
2. Classify pre-existing vs infrastructure failures
3. Establish workspace-specific CI invocation

## Related

- `apps/workspace/vite.config.ts` — workspace vitest config (jsdom, globals, css)
- `vitest.config.ts` — root vitest config (narrow patterns)
- Root CI (`/.github/workflows/ci.yml`) — currently runs `pnpm test` from root
