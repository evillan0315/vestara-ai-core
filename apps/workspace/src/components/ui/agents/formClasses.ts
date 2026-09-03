/**
 * Shared form CSS classes for agent editor and related forms.
 *
 * These classes are duplicated in 4+ files across the codebase.
 * Centralizing them here eliminates drift and ensures consistency.
 */

export const inputClass =
  'w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-(--vestara-text-2) placeholder:text-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active) transition-colors';

export const labelClass = 'text-[10px] text-(--vestara-text-muted) uppercase tracking-wider block mb-1';

export const errorClass = 'text-[10px] text-red-400 mt-1';

export const selectClass =
  'w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-(--vestara-text-2) outline-none focus:border-(--vestara-accent-border-active) transition-colors cursor-pointer';

export const buttonPrimaryClass =
  'px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border-active) text-(--vestara-accent-text) rounded-md text-xs font-medium hover:bg-(--vestara-accent-border)/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

export const buttonSecondaryClass =
  'px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-md text-xs font-medium hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer';
