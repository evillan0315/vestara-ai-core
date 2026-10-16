/**
 * Executable availability probe for the CLI.
 *
 * Used to decide whether an optional external runtime (notably `bun`, required
 * by the OpenTUI development launch) can be spawned before attempting it, so a
 * missing binary degrades gracefully instead of surfacing as a raw
 * `spawn … ENOENT` fatal error.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CommandAvailabilityOptions {
  /** PATH value to search. Defaults to `process.env.PATH`. */
  readonly pathEnv?: string;
  /** Path delimiter. Defaults to `path.delimiter`. */
  readonly delimiter?: string;
  /** Platform. Defaults to `process.platform`. */
  readonly platform?: NodeJS.Platform;
  /** PATHEXT value on Windows. Defaults to `process.env.PATHEXT`. */
  readonly pathext?: string;
}

/**
 * Return true when `command` resolves to an executable file on PATH.
 * Performs no spawn, so it is deterministic and side-effect free.
 */
export function isCommandAvailable(command: string, options: CommandAvailabilityOptions = {}): boolean {
  if (!command) return false;

  const pathEnv = options.pathEnv ?? process.env.PATH ?? '';
  const delimiter = options.delimiter ?? path.delimiter;
  const platform = options.platform ?? process.platform;
  const extensions =
    platform === 'win32'
      ? (options.pathext ?? process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
      : [''];

  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = path.join(dir, command + ext);
      try {
        if (!fs.statSync(candidate).isFile()) continue;
        if (platform !== 'win32') fs.accessSync(candidate, fs.constants.X_OK);
        return true;
      } catch {
        // Not this candidate; keep searching the remaining PATH entries.
      }
    }
  }
  return false;
}
