/**
 * Canonical renderer-independent agent workflow projection with incremental
 * event envelopes. Both the TUI and the Workspace UI consume this model so
 * they always agree on workflow state.
 */

export * from './derive';
export * from './events';
export * from './multithread';
export * from './project';
export * from './swimlanes';
export * from './types';
