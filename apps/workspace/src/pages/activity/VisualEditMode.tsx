import { useCallback, useEffect, useRef, useState } from 'react';
import { implementationProposal } from './edit-manifest';
import type { Alignment, Density, Presentation } from './edit-manifest';
import { applyOverride, getOverrides, hasOverride, undoLast, useVisualConfig } from './visual-config';
import { verifyAppliedChange, type VerifyReport } from './visual-verify';

interface Highlight {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SelectedElement {
  element: HTMLElement;
  name: string;
  instance?: string;
}

interface Operations {
  alignment?: Alignment;
  density?: Density;
  presentation?: Presentation;
}

interface Snapshot {
  alignSelf: string;
  padding: string;
  backgroundColor: string;
  border: string;
}

/**
 * VE-1 + VE-2 — visual grounding and preview-only manipulation.
 *
 * VE-1: hovering a `[data-ve-target]` element highlights its actual rendered
 * boundary; clicking identifies the semantic component.
 *
 * VE-2: the selected element can be manipulated with three human-level controls
 * (Alignment, Density, Presentation). All changes are **preview only**: they
 * mutate runtime DOM styles on the selected instance, never source, never
 * persisted. Reset restores the original rendered state. No Developer handoff,
 * no persistence — the experiment stops here.
 */
export default function VisualEditMode() {
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [selection, setSelection] = useState<SelectedElement | null>(null);
  const [alignment, setAlignment] = useState<Alignment | null>(null);
  const [density, setDensity] = useState<Density | null>(null);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const rafRef = useRef<number | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const [intentOpen, setIntentOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [refused, setRefused] = useState(false);
  const [refusalReason, setRefusalReason] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<VerifyReport | null>(null);
  const [appliedOpen, setAppliedOpen] = useState(false);
  const { overrides, lastChange } = useVisualConfig();

  const hoveredTarget = useCallback((event: MouseEvent): { element: HTMLElement; name: string; instance?: string } | null => {
    const target = event.target as Element | null;
    const node = target?.closest?.('[data-ve-target]');
    if (!(node instanceof HTMLElement)) return null;
    const name = node.getAttribute('data-ve-name') ?? node.getAttribute('data-ve-target') ?? 'Unknown';
    const instance = node.getAttribute('data-ve-instance') ?? undefined;
    return { element: node, name, instance };
  }, []);

  const applyPreview = useCallback((element: HTMLElement, values: { alignment?: Alignment; density?: Density; presentation?: Presentation }): void => {
    if (values.alignment !== undefined) element.style.alignSelf = values.alignment === 'left' ? 'flex-start' : values.alignment === 'right' ? 'flex-end' : 'center';
    if (values.density !== undefined) element.style.padding = values.density === 'compact' ? '2px' : values.density === 'spacious' ? '14px' : '';
    if (values.presentation !== undefined) {
      if (values.presentation === 'minimal') {
        element.style.backgroundColor = 'rgba(0, 0, 0, 0)';
        element.style.border = '0';
      } else {
        element.style.backgroundColor = '';
        element.style.border = '';
      }
    }
  }, []);

  const captureSnapshot = useCallback((element: HTMLElement): void => {
    snapshotRef.current = {
      alignSelf: element.style.alignSelf,
      padding: element.style.padding,
      backgroundColor: element.style.backgroundColor,
      border: element.style.border,
    };
  }, []);

  const resetPreview = useCallback(() => {
    if (selection === null) return;
    const snapshot = snapshotRef.current;
    if (snapshot) {
      const { element } = selection;
      element.style.alignSelf = snapshot.alignSelf;
      element.style.padding = snapshot.padding;
      element.style.backgroundColor = snapshot.backgroundColor;
      element.style.border = snapshot.border;
    }
    setAlignment(null);
    setDensity(null);
    setPresentation(null);
    setIntentOpen(false);
    setProposalOpen(false);
  }, [selection]);

  const operations = [
    alignment !== null && { operation: 'alignment', value: alignment },
    density !== null && { operation: 'density', value: density },
    presentation !== null && { operation: 'presentation', value: presentation },
  ].filter((entry): entry is { operation: string; value: string } => Boolean(entry));

  const proposal =
    selection !== null
      ? implementationProposal({
          target: selection.name,
          instance: selection.instance,
          alignment: alignment ?? undefined,
          density: density ?? undefined,
          presentation: presentation ?? undefined,
        })
      : null;

  // VE-5/6 productized: routing + automatic verification after one Apply.
  // Declaratively representable intent → persist configuration. Anything else
  // → safe refusal (never silently broaden scope).
  const canApply = operations.length > 0;
  const applyChange = (): void => {
    if (selection === null) return;
    if (operations.length === 0) return;
    if (selection.instance === undefined) {
      setRefused(true);
      setRefusalReason('The visual configuration can only represent instance scope. This target has no instance to apply to.');
      return;
    }
    const override = {
      ...(alignment !== null ? { alignment } : {}),
      ...(density !== null ? { density } : {}),
      ...(presentation !== null ? { presentation } : {}),
    };
    applyOverride(selection.instance, override);
    // Automatic verification after the commit settles: prove the running UI
    // (not the transient preview) matches the confirmed intent.
    const instanceId = selection.instance;
    const name = selection.name;
    setTimeout(() => setVerdict(verifyAppliedChange(instanceId, name, getOverrides())), 350);
    setRefused(false);
    setRefusalReason(null);
    setAppliedOpen(false);
    setSelection(null);
    setAlignment(null);
    setDensity(null);
    setPresentation(null);
    setIntentOpen(false);
    setProposalOpen(false);
  };

  useEffect(() => {
    if (selection === null) return;
    const { element, instance } = selection;
    captureSnapshot(element);
    return () => {
      // Leaving the selection restores preview-only inline styles — but only
      // when a config override does not now own this instance (VE-5 apply).
      if (instance !== undefined && hasOverride(instance)) return;
      if (snapshotRef.current) {
        element.style.alignSelf = snapshotRef.current.alignSelf;
        element.style.padding = snapshotRef.current.padding;
        element.style.backgroundColor = snapshotRef.current.backgroundColor;
        element.style.border = snapshotRef.current.border;
      }
    };
  }, [selection, captureSnapshot]);

  useEffect(() => {
    const onMove = (event: MouseEvent): void => {
      if (selection !== null) return; // a target is selected; hover highlight pauses
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = window.requestAnimationFrame(() => {
        const hit = hoveredTarget(event);
        if (hit === null) {
          setHighlight(null);
          return;
        }
        const rect = hit.element.getBoundingClientRect();
        setHighlight({ name: hit.name, left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      });
    };

    const onClick = (event: MouseEvent): void => {
      if (selection !== null) return; // already selected; ignore further clicks
      const hit = hoveredTarget(event);
      if (hit === null) return;
      event.preventDefault();
      event.stopPropagation();
      setSelection(hit);
      setHighlight(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('click', onClick, true);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('click', onClick, true);
    };
  }, [hoveredTarget, selection]);

  return (
    <>
      {highlight && (
        <div
          data-testid="ve-highlight"
          className="pointer-events-none fixed z-40 border-2 border-(--vestara-accent-text)"
          style={{
            left: highlight.left,
            top: highlight.top,
            width: highlight.width,
            height: highlight.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.06)',
          }}
        >
          <span className="absolute -top-5 left-0 rounded bg-(--vestara-accent-text) px-1.5 py-0.5 text-[9px] font-semibold text-zinc-950">
            {highlight.name}
          </span>
        </div>
      )}

      {selection && (
        <div
          data-testid="ve-panel"
          className="fixed bottom-4 left-1/2 z-40 w-[360px] -translate-x-1/2 space-y-2 rounded-xl border border-(--vestara-accent-border) bg-zinc-950/95 p-3 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-(--vestara-text)">{selection.name}</span>
            <span className="rounded bg-(--vestara-accent-text)/10 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-(--vestara-accent-text)">
              Preview only
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="w-20 text-[9px] text-(--vestara-text-dim)">Alignment</span>
              <div className="flex gap-1">
                {(['left', 'center', 'right'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setAlignment(value);
                      if (selection) applyPreview(selection.element, { alignment: value });
                    }}
                    aria-pressed={alignment === value}
                    className={`rounded-md border px-2.5 py-1 text-[10px] capitalize transition-colors cursor-pointer ${
                      alignment === value
                        ? 'border-(--vestara-accent-text) bg-(--vestara-accent-text)/15 text-(--vestara-accent-text)'
                        : 'border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text)'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="w-20 text-[9px] text-(--vestara-text-dim)">Density</span>
              <div className="flex gap-1">
                {(['compact', 'comfortable', 'spacious'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setDensity(value);
                      if (selection) applyPreview(selection.element, { density: value });
                    }}
                    aria-pressed={density === value}
                    className={`rounded-md border px-2.5 py-1 text-[10px] capitalize transition-colors cursor-pointer ${
                      density === value
                        ? 'border-(--vestara-accent-text) bg-(--vestara-accent-text)/15 text-(--vestara-accent-text)'
                        : 'border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text)'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="w-20 text-[9px] text-(--vestara-text-dim)">Presentation</span>
              <div className="flex gap-1">
                {(['bubble', 'minimal'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setPresentation(value);
                      if (selection) applyPreview(selection.element, { presentation: value });
                    }}
                    aria-pressed={presentation === value}
                    className={`rounded-md border px-2.5 py-1 text-[10px] capitalize transition-colors cursor-pointer ${
                      presentation === value
                        ? 'border-(--vestara-accent-text) bg-(--vestara-accent-text)/15 text-(--vestara-accent-text)'
                        : 'border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text)'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIntentOpen((value) => !value)}
              disabled={operations.length === 0}
              className="rounded-md border border-(--vestara-accent-border) px-2.5 py-1 text-[10px] text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              {intentOpen ? 'Hide intent' : 'View intent'}
            </button>
            <button
              type="button"
              onClick={() => setProposalOpen((value) => !value)}
              disabled={operations.length === 0}
              className="rounded-md border border-(--vestara-accent-border) px-2.5 py-1 text-[10px] text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              {proposalOpen ? 'Hide proposal' : 'View proposal'}
            </button>
            <button
              type="button"
              onClick={applyChange}
              disabled={!canApply}
              className="rounded-md border border-(--vestara-accent-text) bg-(--vestara-accent-text)/15 px-2.5 py-1 text-[10px] font-medium text-(--vestara-accent-text) transition-colors hover:bg-(--vestara-accent-text)/25 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={resetPreview}
              className="rounded-md border border-(--vestara-accent-border) px-2.5 py-1 text-[10px] text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => {
                resetPreview();
                setSelection(null);
              }}
              className="rounded-md border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-2.5 py-1 text-[10px] font-medium text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer"
            >
              Done
            </button>
          </div>

          {refused && (
            <div data-testid="ve-refusal" className="rounded-lg border border-(--vestara-red)/40 bg-(--vestara-red)/10 px-3 py-2 text-[10px] text-(--vestara-red)">
              <div>Could not safely apply this change. No changes were saved.</div>
              {refusalReason !== null && (
                <div className="mt-1 text-[9px] opacity-80">Reason: {refusalReason}</div>
              )}
            </div>
          )}

          {intentOpen && operations.length > 0 && (
            <div data-testid="ve-intent" className="rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-2">
              <div className="text-[8px] uppercase tracking-widest text-(--vestara-text-dim)">Design Intent</div>
              <div className="mt-1 space-y-0.5 font-mono text-[10px] leading-relaxed text-(--vestara-text-2)">
                <div>Target: {selection.name}</div>
                <div>Instance: {selection.instance ?? 'component'}</div>
                {operations.map((entry) => (
                  <div key={entry.operation}>
                    {entry.operation} = {entry.value}
                  </div>
                ))}
                <div>Scope: instance</div>
                <div>Provenance: Director visual manipulation · VE-2 preview</div>
              </div>
            </div>
          )}

          {proposalOpen && proposal !== null && operations.length > 0 && (
            <div data-testid="ve-proposal" className="space-y-1 rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-2">
              <div className="text-[8px] uppercase tracking-widest text-(--vestara-text-dim)">Implementation Proposal</div>
              <div className="mt-1 space-y-0.5 font-mono text-[10px] leading-relaxed text-(--vestara-text-2)">
                <div>Resolved target: {proposal.resolvedTarget}</div>
                <div>Affected source: {proposal.affectedSource}</div>
                <div>Proposed: {proposal.proposedImplementation}</div>
                <div>Expected: {proposal.expectedVisualOutcome}</div>
                <div>Scope: {proposal.scope}</div>
                <div>Risk: {proposal.risk}</div>
                <div>Unrelated: {proposal.unrelatedBehavior}</div>
                <div>Verification: {proposal.verification}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {lastChange !== null && (
        <div
          data-testid="ve-applied"
          className={`fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg border bg-zinc-950/95 px-3 py-2 text-[11px] shadow-2xl ${
            verdict === null
              ? 'border-(--vestara-text-dim)/40 text-(--vestara-text-dim)'
              : verdict.conclusion === 'VERIFIED'
                ? 'border-(--vestara-green)/40 text-(--vestara-green)'
                : 'border-(--vestara-amber)/50 text-(--vestara-amber)'
          }`}
        >
          <span>
            {verdict === null
              ? 'Applying and verifying…'
              : verdict.conclusion === 'VERIFIED'
                ? '✓ Saved and verified'
                : '⚠ Applied, but verification partial'}
          </span>
          <button
            type="button"
            onClick={() => setAppliedOpen((value) => !value)}
            className="rounded border border-current/40 px-1.5 py-0.5 text-[9px] hover:bg-current/10 cursor-pointer"
          >
            {appliedOpen ? 'Hide details' : 'View details'}
          </button>
          <button
            type="button"
            onClick={() => {
              undoLast();
              setAppliedOpen(false);
            }}
            className="rounded border border-current/40 px-1.5 py-0.5 text-[9px] hover:bg-current/10 cursor-pointer"
          >
            Undo
          </button>
        </div>
      )}

      {appliedOpen && verdict !== null && (
        <div
          data-testid="ve-verdict"
          className={`fixed bottom-16 right-4 z-40 w-[340px] space-y-1 rounded-lg border px-3 py-2 shadow-2xl ${
            verdict.conclusion === 'VERIFIED'
              ? 'border-(--vestara-green)/50 bg-zinc-950/95 text-(--vestara-green)'
              : 'border-(--vestara-amber)/50 bg-zinc-950/95 text-(--vestara-amber)'
          }`}
        >
          <div className="text-[8px] uppercase tracking-widest opacity-80">Visual Verification</div>
          <div className="font-mono text-[10px] leading-relaxed">
            <div>Target: {verdict.target}</div>
            {verdict.dimensions.map((dimension) => (
              <div key={dimension.dimension}>
                {dimension.dimension}: expected {dimension.expected ?? '—'} / observed {dimension.observed ?? '—'} ·{' '}
                {dimension.result}
              </div>
            ))}
            <div>Changed matching instances: {verdict.changedMatchingInstances}</div>
            <div>Unexpected changed instances: {verdict.unexpectedChangedInstances}</div>
            {verdict.behavioralChecks.map((check) => (
              <div key={check.check}>
                {check.check}: {check.status}
              </div>
            ))}
            <div className="mt-1 font-bold">Conclusion: {verdict.conclusion}</div>
          </div>
          <button
            type="button"
            onClick={() => lastChange !== null && setVerdict(verifyAppliedChange(lastChange.instanceId, lastChange.target, overrides))}
            className="rounded border border-current/40 px-1.5 py-0.5 text-[9px] hover:bg-current/10 cursor-pointer"
          >
            Re-verify (diagnostics)
          </button>
        </div>
      )}
    </>
  );
}
