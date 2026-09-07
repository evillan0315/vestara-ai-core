/**
 * GA-UI-003: AssistantResponseActions
 *
 * Reusable completed-response action row for the Global Assistant.
 * Lowest Assistant-message presentation boundary that owns a completed response.
 *
 * Ownership:
 *   ConversationPanel (MessageBubble) → AssistantResponseActions
 *   GlobalAssistant / FloatingPanel never own clipboard/share behavior.
 *
 * Visibility lifecycle enforced by callers:
 *   streaming / thinking / tool status → actions absent (StreamingBubble renders none)
 *   completed assistant message      → Copy + Share
 *   failed assistant message         → Copy only (Share absent)
 *
 * Copy semantics: exact user-visible response content only — never statuses,
 * tool arguments, hidden reasoning, or provider metadata. No Conversation
 * message or Activity Room record is created by copying.
 */

import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import IosShareOutlinedIcon from '@mui/icons-material/IosShareOutlined';
import { useCallback, useEffect, useRef, useState } from 'react';

const FEEDBACK_RESET_MS = 1600;

type Feedback = 'copied' | 'copied-share' | 'copy-failed' | 'share-failed' | null;

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for contexts without async clipboard (older browsers / tests).
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand?.('copy') ?? false;
      document.body.removeChild(textarea);
      return ok;
    }
    return false;
  } catch {
    return false;
  }
}

function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: unknown }).share === 'function';
}

export interface AssistantResponseActionsProps {
  /** Exact user-visible completed response text. */
  readonly content: string;
  /** When true (failed response), Share is hidden. Copy remains. */
  readonly failed?: boolean;
}

export function AssistantResponseActions({ content, failed = false }: AssistantResponseActionsProps) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const flash = useCallback((next: Exclude<Feedback, null>) => {
    setFeedback(next);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setFeedback(null);
      timerRef.current = null;
    }, FEEDBACK_RESET_MS);
  }, []);

  const handleCopy = useCallback(
    async (e: React.MouseEvent | React.PointerEvent) => {
      e.stopPropagation();
      const ok = await copyTextToClipboard(content);
      flash(ok ? 'copied' : 'copy-failed');
    },
    [content, flash],
  );

  const handleShare = useCallback(
    async (e: React.MouseEvent | React.PointerEvent) => {
      e.stopPropagation();
      if (canNativeShare()) {
        try {
          await (navigator as Navigator & { share: (data: { title: string; text: string }) => Promise<void> }).share({
            title: 'Vestara Assistant',
            text: content,
          });
          return;
        } catch (error) {
          // User dismissal is not a failure — stay silent.
          if (error instanceof DOMException && error.name === 'AbortError') return;
          // Share failed → fall through to clipboard fallback.
        }
      }
      // Fallback: native sharing unavailable → copy for sharing.
      const ok = await copyTextToClipboard(content);
      flash(ok ? 'copied-share' : 'share-failed');
    },
    [content, flash],
  );

  // Never let action interaction bubble into the FloatingPanel drag handler.
  const stopDrag = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div className="mt-1.5 flex max-w-full flex-wrap items-center gap-1.5" data-testid="assistant-response-actions">
      <button
        type="button"
        onClick={handleCopy}
        onPointerDown={stopDrag}
        onMouseDown={stopDrag}
        aria-label="Copy response"
        title="Copy"
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-zinc-800 hover:text-zinc-200 hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-amber-500/60"
      >
        <ContentCopyOutlinedIcon sx={{ fontSize: 14 }} />
      </button>
      {!failed && (
        <button
          type="button"
          onClick={handleShare}
          onPointerDown={stopDrag}
          onMouseDown={stopDrag}
          aria-label="Share response"
          title="Share"
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-zinc-800 hover:text-zinc-200 hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-amber-500/60"
        >
          <IosShareOutlinedIcon sx={{ fontSize: 14 }} />
        </button>
      )}
      {feedback === 'copied' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300/90" role="status">
          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Copied
        </span>
      )}
      {feedback === 'copied-share' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300/90" role="status">
          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Copied for sharing
        </span>
      )}
      {feedback === 'copy-failed' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-300/90" role="status">
          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Copy failed
        </span>
      )}
      {feedback === 'share-failed' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300/90" role="status">
          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3l9.5 16.5H2.5z" />
          </svg>
          Sharing unavailable
        </span>
      )}
    </div>
  );
}

export default AssistantResponseActions;
