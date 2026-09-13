/**
 * @vestara/terminal-runtime — output stream processor.
 *
 * Pure, chunk-oriented parsing of session output:
 * 1. Interactive-bash startup noise is stripped (early lines only, tolerant
 *    of the PID variant: `... process group (235489): Inappropriate ioctl
 *    for device`). Exact-match filters miss real variants — hence prefixes.
 * 2. `PROMPT_COMMAND` cwd markers (US + `CWD:<pwd>` + RS framing) are
 *    projected as cwd and never forwarded. Markers may fragment across
 *    chunks or share a line with prompt text, so matching is global with a
 *    bounded carry for prefix-in-progress tails — never line-anchored.
 *
 * Framing bytes are built with `fromCharCode`: no raw control bytes ever
 * appear in source (and the lint rule stays satisfied without ignores).
 */

const US = String.fromCharCode(0x1f);
const RS = String.fromCharCode(0x1e);
const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const MARKER_TOKEN = `${US}CWD:`;
const MARKER_CAP = 4096;
const NOISE_LINE_BUDGET = 8;

export interface TerminalStreamState {
  /** Held tail: a prefix-in-progress of a cwd marker. */
  carry: string;
  /** Newlines forwarded so far (bounds noise stripping to startup). */
  linesSeen: number;
  /** Latest projected cwd, when a marker completed. */
  cwd: string | undefined;
}

export function createTerminalStreamState(): TerminalStreamState {
  return { carry: '', linesSeen: 0, cwd: undefined };
}

function isStartupNoise(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('bash: cannot set terminal process group') || trimmed === 'bash: no job control in this shell'
  );
}

function stripOscSequences(text: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const start = text.indexOf(`${ESC}]`, i);
    if (start < 0) return out + text.slice(i);
    const bel = text.indexOf(BEL, start + 2);
    const st = text.indexOf(`${ESC}\\`, start + 2);
    const end = bel < 0 ? st : st < 0 ? bel : Math.min(bel, st);
    if (end < 0) return out + text.slice(i, start) + text.slice(start);
    out += text.slice(i, start);
    i = end + (text.startsWith(BEL, end) ? BEL.length : `${ESC}\\`.length);
  }
}

function stripCompleteMarkers(state: TerminalStreamState, text: string): string {
  let out = '';
  let rest = text;
  for (;;) {
    const start = rest.indexOf(MARKER_TOKEN);
    if (start < 0) return out + rest;
    const end = rest.indexOf(RS, start + MARKER_TOKEN.length);
    if (end < 0) return out + rest;
    const pwd = rest.slice(start + MARKER_TOKEN.length, end);
    if (pwd && !pwd.includes('\n')) state.cwd = pwd;
    out += rest.slice(0, start);
    rest = rest.slice(end + RS.length);
  }
}

export function processTerminalChunk(
  state: TerminalStreamState,
  chunk: string,
): { forward: string; cwd: string | undefined } {
  let text = state.carry + chunk;
  state.carry = '';
  state.cwd = undefined;

  // 1. Strip every complete marker anywhere (mid-line or reassembled).
  text = stripCompleteMarkers(state, text);

  // 1b. Strip OSC title sequences (ESC ] … BEL or ESC \) — xterm would
  // swallow them as tab titles; userland (`echo -e`) can emit them anytime.
  // CSI color sequences (ESC [) pass through untouched.
  text = stripOscSequences(text);

  // 2. Hold a prefix-in-progress tail so a split marker reassembles.
  const newlineIdx = text.lastIndexOf('\n');
  const tail = newlineIdx >= 0 ? text.slice(newlineIdx + 1) : text;
  const fragIdx = tail.indexOf(US);
  if (fragIdx >= 0) {
    const frag = tail.slice(fragIdx);
    const looksLikeMarker = MARKER_TOKEN.startsWith(frag) || frag.startsWith(MARKER_TOKEN);
    if (looksLikeMarker && frag.length <= MARKER_CAP) {
      const holdFrom = (newlineIdx >= 0 ? newlineIdx + 1 : 0) + fragIdx;
      state.carry = text.slice(holdFrom);
      text = text.slice(0, holdFrom);
    }
  }

  // 3. Strip startup noise within the early-line budget (never user output).
  const lines = text.split('\n');
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const last = i === lines.length - 1;
    const line = lines[i] as string;
    if (!last) {
      if (state.linesSeen < NOISE_LINE_BUDGET && isStartupNoise(line)) {
        state.linesSeen += 1;
        continue;
      }
      state.linesSeen += 1;
    }
    kept.push(line);
  }

  return { forward: kept.join('\n'), cwd: state.cwd };
}

/** Flush a held tail (session exit): emit verbatim, never silently dropped. */
export function flushTerminalStream(state: TerminalStreamState): string {
  const tail = state.carry;
  state.carry = '';
  return tail;
}
