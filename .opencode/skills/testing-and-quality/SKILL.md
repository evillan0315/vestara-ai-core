---
name: testing-and-quality
description: >-
  Use when writing, running, or debugging tests, linting, type-checking, or
  formatting code. Triggers on keywords: test, spec, vitest, lint, biome,
  format, coverage, CI, quality gate, QA, code review, PR checklist. Also use
  when the task involves verifying code correctness before committing or merging.
---

# Testing & Quality

This project follows strict quality practices. Always adhere to these standards
when writing or modifying code, running quality checks, or reviewing pull
requests.

---

## 1. Running Quality Checks

### All at once

```bash
pnpm lint      # Biome check --write across all packages
pnpm test      # Run all tests (requires prior build)
```

### Single package

```bash
pnpm --filter @vestara/conversation test
```

Note: `pnpm test -- --filter <name>` passes `--filter` to vitest (filters test
names, not packages). Use `pnpm --filter` for package filtering.

### Formatting

```bash
pnpm format  # Biome format --write
```

---

## 2. Test Conventions

### Test runner

The project uses **vitest 4**. Tests use global `describe`, `it`, `expect`,
`beforeAll`, `beforeEach`, `afterAll`, `afterEach`.

### File naming

- Place test files in `__tests__/` directory inside each package or app.
- Name test files `*.test.ts`.
- Mirror the source directory structure inside `__tests__/`.

Example:

```
apps/api/
  src/
    routes/
      auth.routes.ts
  __tests__/
    routes/
      auth.test.ts
```

### Database

Uses `sql.js` WASM in-memory — no database setup needed. Tests use real SQLite.

### Test structure pattern

Every test should follow the **Arrange-Act-Assert** pattern.

### What to test

| Layer                  | Focus                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| **API routes**         | HTTP status codes, response shape, success/error payloads, auth guards, input validation |
| **Services**           | Business logic in isolation, edge cases, error conditions                                |
| **Validation schemas** | Zod schemas — valid input passes, invalid input fails with correct error codes           |
| **Middleware**         | Auth guards, role checks, request enrichment                                             |

---

## 3. Quality Gates

Every pull request must pass:

- ✅ **Biome**: zero errors, zero warnings
- ✅ **TypeScript**: strict mode, no errors (use `skipLibCheck: true`)
- ✅ **Tests**: all tests pass (tests require prior `build`)

### Code style (Biome enforced)

- Single quotes, trailing commas, semicolons always
- `noExplicitAny` is disabled — `any` is allowed freely
- `console.log`/`warn`/`error` used in production code

---

## 4. CI Pipeline

```bash
pnpm install --frozen-lockfile
bash build-order.sh
pnpm test
```

No lint or typecheck in CI — those are pre-commit responsibilities.

---

## 5. Edge Cases to Cover in Tests

When writing tests, always consider:

- **Null/undefined inputs**: Zod schemas should catch these
- **Empty collections**: empty arrays, no matching records
- **Boundary values**: pagination limits, string max lengths, numeric bounds
- **Invalid IDs**: UUID format, non-existent references
- **Auth/authorization**: unauthenticated, wrong role, expired token
- **Concurrent requests**: race conditions on create/update
- **Idempotency**: repeated requests should not produce duplicate resources

---

## 6. Verification Loop

```bash
pnpm lint && bash build-order.sh && pnpm test
```

There is **no `pnpm typecheck` script**.
