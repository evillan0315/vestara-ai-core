/**
 * Runtime reachability probe.
 *
 * `open` and the TUI launcher need to know whether an HTTP server is already
 * serving the API port (typically a running dev API). The authoritative API
 * enforces auth, so a health request legitimately answers 401/403 — that still
 * proves the port is being served. Only a transport failure (connection
 * refused / timeout) means the runtime is not running.
 *
 * The previous probe required `response.ok` (2xx), so an auth-protected API was
 * misread as "not running"; the CLI then tried to start a second API and events
 * server on the same port and both fought over it (EADDRINUSE).
 */

export interface RuntimeProbeOptions {
  /** Request timeout in milliseconds. Defaults to 300. */
  readonly timeoutMs?: number;
}

/**
 * Return true when an HTTP server answers on the API endpoint. Any HTTP
 * response — including 401/403/404 — counts as reachable; only connection
 * errors/timeouts count as unavailable. Performs no spawn of its own.
 */
export async function isRuntimeReachable(endpoint: string, options: RuntimeProbeOptions = {}): Promise<boolean> {
  try {
    await fetch(new URL('/api/health', endpoint), {
      signal: AbortSignal.timeout(options.timeoutMs ?? 300),
    });
    return true;
  } catch {
    return false;
  }
}
