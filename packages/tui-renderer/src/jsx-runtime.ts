// JSX runtime shim so the TUI application can set
// `jsxImportSource: @vestara/tui-renderer` and never import OpenTUI directly.
// The compiler resolves this module for the `react-jsx` transform and reads the
// `JSX` namespace types it re-exports.

export type * from '@opentui/react/jsx-runtime';
export { Fragment, jsx, jsxs } from '@opentui/react/jsx-runtime';
