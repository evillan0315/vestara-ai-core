/**
 * Whole-file persist diagnostics.
 *
 * Several stores keep SQLite in memory (sql.js) and rewrite the ENTIRE file on
 * every write statement via `db.export()` + `writeFileSync`. One small SQL
 * write therefore costs O(database size) in block I/O — invisible in ordinary
 * logs, but it appears as sustained multi-MB/s write churn and, on a slow
 * backing device, as the event loop parking in uninterruptible I/O wait
 * (`rq_qos_wait`), where every request hangs until the write drains.
 *
 * This records each persist and emits a BOUNDED summary instead of one line per
 * write: an aggregate flushes every `FLUSH_EVERY` persists, or once `FLUSH_MS`
 * has elapsed since the window opened, and a single oversized or slow persist
 * warns immediately. A process that is not persisting emits nothing, and a
 * runaway emitter is capped at one line per `FLUSH_EVERY` writes — the
 * diagnostics cannot become a second log flood.
 *
 * Read cost is deliberately not timed: `openSqlDb` also re-reads the file and
 * hashes it twice per persist, so the measured write time understates total I/O.
 */

export interface PersistObservation {
  /** Store label, e.g. `conversations.db`. */
  readonly store: string;
  /** Bytes written to disk for this persist. */
  readonly bytes: number;
  /** Wall time inside the persist (export + write), in milliseconds. */
  readonly durationMs: number;
}

const FLUSH_EVERY = 50;
const FLUSH_MS = 30_000;
const SLOW_PERSIST_MS = 500;
const LARGE_PERSIST_BYTES = 4 * 1024 * 1024;

interface Accumulator {
  count: number;
  bytes: number;
  maxBytes: number;
  totalMs: number;
  maxMs: number;
  windowStartedAt: number;
  /** Caller of the first write in the window — names the driving loop. */
  sampleStack?: string;
}

const accumulators = new Map<string, Accumulator>();

/**
 * Capture the call site of a persist, without the recorder's own frames.
 * Called at most once per window, so the cost is negligible.
 */
function captureCallSite(): string {
  const frames = new Error('persist-call-site').stack?.split('\n') ?? [];
  return frames
    .slice(2, 6)
    .map((frame) => frame.trim().replace(/^at\s+/, ''))
    .join(' <- ');
}

/** Emit and reset one store's window. */
function flushWindow(store: string, acc: Accumulator): void {
  const windowMs = Math.max(1, Date.now() - acc.windowStartedAt);
  const mb = acc.bytes / 1_048_576;
  console.log(
    `[persist] store=${store} writes=${acc.count} mb=${mb.toFixed(1)} windowMs=${windowMs} ` +
      `rateMbPerSec=${((mb / windowMs) * 1000).toFixed(2)} maxBytes=${acc.maxBytes} ` +
      `meanMs=${(acc.totalMs / acc.count).toFixed(1)} maxMs=${Math.round(acc.maxMs)} ` +
      `callSite=${acc.sampleStack || 'unknown'}`,
  );
  acc.count = 0;
  acc.bytes = 0;
  acc.maxBytes = 0;
  acc.totalMs = 0;
  acc.maxMs = 0;
  acc.windowStartedAt = Date.now();
  acc.sampleStack = undefined;
}

let flushTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Report windows on a timer as well as on write boundaries, so a store whose
 * writes stop mid-window is still attributed. Unref'd: this must never hold the
 * process open.
 */
function ensureFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    for (const [store, acc] of accumulators) {
      if (acc.count > 0) {
        try {
          flushWindow(store, acc);
        } catch {
          // Diagnostics must never affect persistence.
        }
      }
    }
  }, FLUSH_MS);
  flushTimer.unref?.();
}

/**
 * Record one whole-file persist. Allocation-light and fail-safe: it runs inside
 * hot paths and must never change their behaviour.
 */
export function recordPersist(observation: PersistObservation): void {
  try {
    const { store, bytes, durationMs } = observation;
    const now = Date.now();
    let acc = accumulators.get(store);
    if (!acc) {
      acc = { count: 0, bytes: 0, maxBytes: 0, totalMs: 0, maxMs: 0, windowStartedAt: now };
      accumulators.set(store, acc);
    }
    if (acc.count === 0) acc.sampleStack = captureCallSite();
    acc.count += 1;
    acc.bytes += bytes;
    acc.totalMs += durationMs;
    if (bytes > acc.maxBytes) acc.maxBytes = bytes;
    if (durationMs > acc.maxMs) acc.maxMs = durationMs;

    if (durationMs >= SLOW_PERSIST_MS || bytes >= LARGE_PERSIST_BYTES) {
      console.warn(
        `[persist] slow whole-file write store=${store} bytes=${bytes} durationMs=${Math.round(durationMs)}`,
      );
    }

    if (acc.count >= FLUSH_EVERY) flushWindow(store, acc);
    ensureFlushTimer();
  } catch {
    // Diagnostics must never affect persistence.
  }
}
