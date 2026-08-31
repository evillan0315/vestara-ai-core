/**
 * VESTARA-INTELLIGENCE GA-1: GlobalAssistant
 *
 * Persistent floating assistant shell mounted in ShellLayout.
 * Presentation/composition only — no conversation, context-intelligence,
 * provider/model, execution, governance, or Activity Room authority.
 *
 * Consumes:
 *   - useAssistantConversation (GA-2) — conversation state
 *   - useSurfaceContext (GA-3) — display-only surface metadata
 *
 * @see VESTARA-INTELLIGENCE-GA1-PREFLIGHT.md
 */

import { useCallback, useRef, useState } from 'react';
import { useAssistantConversation } from '../../hooks/useAssistantConversation';
import { useSurfaceContext } from '../../contexts/SurfaceContext';

// ─── Launcher ─────────────────────────────────────────────────

function AssistantLauncher({
  onClick,
  panelOpen,
  launcherRef,
}: {
  onClick: () => void;
  panelOpen: boolean;
  launcherRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={launcherRef}
      type="button"
      onClick={onClick}
      aria-label={panelOpen ? 'Close assistant' : 'Open assistant'}
      aria-expanded={panelOpen}
      className="fixed bottom-6 right-6 z-[90] flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/90 text-zinc-900 shadow-lg transition-all hover:bg-amber-400 hover:shadow-xl hover:scale-105 active:scale-95 cursor-pointer"
    >
      {/* Lightning bolt icon */}
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────

export function GlobalAssistant() {
  const [panelOpen, setPanelOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  // GA-2: conversation state (eager — list fetches on mount)
  const assistant = useAssistantConversation();

  // GA-3: surface context (display-only)
  const surface = useSurfaceContext();

  const togglePanel = useCallback(() => {
    setPanelOpen((prev) => !prev);
  }, []);

  return (
    <>
      <AssistantLauncher
        launcherRef={launcherRef}
        onClick={togglePanel}
        panelOpen={panelOpen}
      />

      {/* Phase 2: Floating panel renders here when panelOpen */}
      {/* Phase 3: Conversation presentation inside panel */}
    </>
  );
}

export default GlobalAssistant;
