/** Compatibility launcher. The canonical implementation is @vestara/tui. */

export type { RunTuiOptions as RunConsoleOptions, TuiEvent as ConsoleEvent } from '@vestara/tui';
export { App, runTui as runConsole, TuiController as ConsoleController } from '@vestara/tui';
