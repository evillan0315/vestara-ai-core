/**
 * @vestara/browser-runtime — Browser Evidence Collector (LB-009)
 *
 * Implements the EvidenceCollector interface from @vestara/evidence for
 * browser-navigation evidence. Collects navigation traces, screenshots,
 * and extracted data from browser sessions for the verification pipeline.
 */

import type {
  EvidenceCollectionRequest,
  EvidenceCollectionResult,
  EvidenceCollector,
  EvidenceItem,
  EvidenceKind,
} from '@vestara/evidence';
import type { ManagedBrowserSession } from './browser-runtime';

// ─── Browser evidence request ───────────────────────────────

/**
 * Extended evidence collection request for browser sessions.
 * Carries the managed session reference so the collector can
 * extract traces and artifacts.
 */
export interface BrowserEvidenceCollectionRequest extends EvidenceCollectionRequest {
  /** The managed browser session to collect evidence from. */
  readonly session: ManagedBrowserSession;

  /** Whether to include a screenshot in the evidence. */
  readonly includeScreenshot?: boolean;

  /** Maximum characters for extracted text. */
  readonly maxTextChars?: number;
}

// ─── Browser evidence item ──────────────────────────────────

/**
 * An evidence item produced by browser navigation or interaction.
 */
export interface BrowserEvidenceItem extends EvidenceItem {
  readonly kind: EvidenceKind;
  /** The browser operation that produced this evidence. */
  readonly operation: string;
  /** The URL where the evidence was collected. */
  readonly url: string;
  /** Governance metadata from the browser session. */
  readonly governance?: {
    readonly origin: string;
    readonly route: string;
    readonly classification: string;
    readonly informationRisk: string;
  };
}

// ─── Collector implementation ───────────────────────────────

/**
 * EvidenceCollector for browser-navigation evidence.
 *
 * Collects:
 * - Navigation trace (ordered list of actions taken)
 * - Current page state (URL, title)
 * - Screenshot (optional)
 * - Extracted text (optional, redacted per policy)
 *
 * All evidence items carry governance metadata from the browser session.
 */
export class BrowserEvidenceCollector implements EvidenceCollector<BrowserEvidenceCollectionRequest> {
  readonly kind: EvidenceKind = 'browser-navigation';

  async collect(request: BrowserEvidenceCollectionRequest): Promise<EvidenceCollectionResult> {
    const { session, executionId, taskId, includeScreenshot, maxTextChars } = request;
    const items: EvidenceItem[] = [];

    // Collect navigation trace
    const key = `${session.ownerId}:${taskId ?? 'default'}`;
    const trace = session.session.traceFor(key);
    if (trace.length > 0) {
      items.push({
        kind: 'browser-navigation',
        mediaType: 'application/json',
        content: JSON.stringify(
          {
            sessionId: session.id,
            executionId,
            taskId,
            trace: trace.map((step) => ({
              type: step.type,
              target: step.target,
              command: step.command,
            })),
          },
          null,
          2,
        ),
        summary: `Browser navigation trace: ${trace.length} steps`,
        operation: 'browser.trace',
        metadata: {
          sessionId: session.id,
          stepCount: trace.length,
          lastUrl: trace[trace.length - 1]?.target,
        },
      });
    }

    // Collect page snapshot (current state)
    try {
      const key = `${session.ownerId}:${taskId ?? 'default'}`;
      const snapshot = await session.session.snapshot(key);
      const redacted = session.session.redactSnapshot(snapshot.text, snapshot.url);
      const text =
        maxTextChars && redacted.text.length > maxTextChars
          ? `${redacted.text.slice(0, maxTextChars)}…`
          : redacted.text;

      if (text.length > 0) {
        items.push({
          kind: 'browser-navigation',
          mediaType: 'text/plain',
          content: text,
          summary: `Page snapshot: ${snapshot.title} (${snapshot.url})`,
          operation: 'browser.snapshot',
          metadata: {
            sessionId: session.id,
            url: snapshot.url,
            title: snapshot.title,
            redactionStatus: redacted.redactionStatus,
          },
        });
      }
    } catch {
      // Snapshot may fail if session is closed — skip gracefully
    }

    // Collect screenshot (optional)
    if (includeScreenshot) {
      try {
        const key = `${session.ownerId}:${taskId ?? 'default'}`;
        const screenshot = await session.session.screenshot(key);
        items.push({
          kind: 'screenshot',
          mediaType: 'image/png',
          content: screenshot.bytes,
          summary: `Screenshot: ${screenshot.url} (${screenshot.width}x${screenshot.height})`,
          operation: 'browser.screenshot',
          metadata: {
            sessionId: session.id,
            url: screenshot.url,
            width: screenshot.width,
            height: screenshot.height,
          },
        });
      } catch {
        // Screenshot may fail if redaction policy applies — skip gracefully
      }
    }

    // Collect replay descriptor
    const replayKey = `${session.ownerId}:${taskId ?? 'default'}`;
    const replay = session.session.replayDescriptor(replayKey);
    if (replay.steps.length > 0) {
      items.push({
        kind: 'browser-navigation',
        mediaType: 'application/json',
        content: JSON.stringify(replay, null, 2),
        summary: `Replay descriptor: ${replay.steps.length} steps (execution mode)`,
        operation: 'browser.replay',
        metadata: {
          sessionId: session.id,
          mode: replay.mode,
          stepCount: replay.steps.length,
          runtime: replay.requires.runtime,
        },
      });
    }

    return { items };
  }
}
