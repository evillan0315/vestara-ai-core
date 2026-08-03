// React hooks for the Vestara TUI, backed by OpenTUI. Feature code imports
// these from `@vestara/tui-renderer` and never touches OpenTUI directly.

export type { UseKeyboardOptions } from '@opentui/react';
export {
  useBlur,
  useFocus,
  useKeyboard,
  useOnResize,
  usePaste,
  useRenderer,
  useSelectionHandler,
  useTerminalDimensions,
  useTimeline,
} from '@opentui/react';
