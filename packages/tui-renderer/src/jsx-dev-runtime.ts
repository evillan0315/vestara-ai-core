// JSX dev-runtime shim so Bun's source transpiler (dev mode) can resolve
// `jsxImportSource: @vestara/tui-renderer` without importing OpenTUI directly.

export { Fragment, jsxDEV } from '@opentui/react/jsx-dev-runtime';
export type * from '@opentui/react/jsx-runtime';
