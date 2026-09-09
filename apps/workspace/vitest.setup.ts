/**
 * Global vitest setup: Testing Library DOM auto-cleanup.
 *
 * Vitest globals are off in this repo (tests import from 'vitest'
 * explicitly), so @testing-library/react's built-in auto-cleanup never
 * engages. Without this, every rendered component accumulates in
 * document.body across tests in the same file and document-wide queries
 * (getByRole, getByText) start matching stale renders.
 *
 * The guard keeps node-environment test files untouched: @testing-library
 * is only loaded when a DOM exists.
 *
 * NOTE: this file must live in apps/workspace (not the repo root).
 * @testing-library/react is a @vestara/workspace-ui dependency and is
 * unresolvable from the root under pnpm strict mode; imports resolve
 * relative to this file.
 */
import { afterEach } from 'vitest';

afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
