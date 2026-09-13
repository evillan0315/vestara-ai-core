/**
 * GA-TERM-001 Phase 1: shell-mode intent detection for the assistant composer.
 *
 * Pure presentation helper — detects whether the composer text is an explicit
 * shell turn (`$ <command>` or `/terminal <command>`). It confers NO execution
 * authority: the text still travels the normal conversation turn
 * (`POST /api/conversations/:id/stream`) and the agent's existing bash tool
 * path (with its permission flow) decides execution. Audit lands in the
 * Activity Room as the usual `tool.called` / `tool.succeeded` events.
 *
 * Mode is derived per keystroke from the raw input — never stored — so it is
 * inherently reversible: deleting the prefix exits shell mode. No stuck state.
 */

export interface ShellIntent {
  /** The shell command with the prefix stripped. Never empty. */
  command: string;
  /** Which prefix form the user typed. */
  prefix: '$' | '/terminal';
}

const TERMINAL_PREFIX = '/terminal';

/**
 * Parse shell intent from composer text. Returns null for chat input.
 *
 * Accepted forms (leading whitespace tolerated):
 * - `$ <command>` / `$<command>`
 * - `/terminal <command>`
 *
 * A bare `$` or `/terminal` with no command is NOT shell intent — the user
 * is still typing. The human message is always sent verbatim; this helper
 * only drives composer presentation (badge, placeholder, cwd pill).
 */
export function parseShellIntent(text: string): ShellIntent | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('$')) {
    const command = trimmed.slice(1).trim();
    if (!command) return null;
    return { command, prefix: '$' };
  }
  if (trimmed === TERMINAL_PREFIX) return null;
  if (trimmed.startsWith(`${TERMINAL_PREFIX} `)) {
    const command = trimmed.slice(TERMINAL_PREFIX.length).trim();
    if (!command) return null;
    return { command, prefix: '/terminal' };
  }
  return null;
}

/**
 * Strip the shell prefix from composer text (explicit "exit shell mode").
 * Returns the command portion; chat text passes through unchanged.
 */
export function stripShellPrefix(text: string): string {
  const intent = parseShellIntent(text);
  return intent ? intent.command : text;
}
