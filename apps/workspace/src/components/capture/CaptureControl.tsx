/**
 * CAPTURE-001-UI1 — Shared CaptureControl presentation component.
 *
 * One compact Capture control opening a menu/popover. Presentation + state
 * modeling only: it NEVER captures, never invokes X11, never calls APIs.
 * Hosts (Activity Room, Global Assistant) supply capability data and handle
 * `onAction` — wiring those surfaces is explicitly out of scope (later
 * milestone), as is the reserved `recording` active state (M4).
 *
 * Capability/state shapes mirror @vestara/screen-capture contracts
 * field-for-field (CaptureCapabilityStatus, CaptureState) WITHOUT importing
 * the package: apps/workspace has no lockfile entry for it yet (HOLD), so
 * structural conformance keeps the dependency direction
 * screen-capture contracts → CaptureControl → surfaces with zero build
 * coupling. Mapping:
 *   CaptureCapabilityStatus { operation, scope, supported, reason }
 *     → CaptureCapabilityEntry (identical fields)
 *   CaptureState minus recording-active → CaptureControlState
 *     (+ reserved `recording` for M4)
 *
 * Domain boundaries: this module imports NO Activity Room and NO Global
 * Assistant contracts. Styling uses @vestara/ui primitives + ui-tokens CSS
 * variables only — no inline CSS, no palette utilities, no hardcode.
 */

import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CropFreeOutlinedIcon from '@mui/icons-material/CropFreeOutlined';
import DesktopWindowsOutlinedIcon from '@mui/icons-material/DesktopWindowsOutlined';
import FiberManualRecordOutlinedIcon from '@mui/icons-material/FiberManualRecordOutlined';
import ScreenshotMonitorOutlinedIcon from '@mui/icons-material/ScreenshotMonitorOutlined';
import WebAssetOutlinedIcon from '@mui/icons-material/WebAssetOutlined';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import { Button, Pill } from '@vestara/ui';
import { useState, type ReactNode } from 'react';

// ─── Contract-mirror types (see header) ─────────────────────────

export type CaptureControlOperation = 'screenshot' | 'recording';
export type CaptureControlScope = 'display' | 'window' | 'region';

export interface CaptureCapabilityEntry {
  readonly operation: CaptureControlOperation;
  readonly scope: CaptureControlScope;
  readonly supported: boolean;
  readonly reason: string;
}

export type CaptureControlState =
  | 'idle'
  | 'requesting-permission'
  | 'selecting'
  | 'capturing'
  | 'finalizing'
  | 'completed'
  | 'cancelled'
  | 'failed'
  /** Reserved for M4 recording integration. Rendered, never entered in UI1. */
  | 'recording';

export interface CaptureActionRequest {
  readonly operation: CaptureControlOperation;
  readonly scope: CaptureControlScope;
}

export interface CaptureControlProps {
  /** Capability data consumed verbatim — never hardcoded in this component. */
  readonly capabilities: readonly CaptureCapabilityEntry[];
  /** Controlled capture state. Defaults to `idle`. */
  readonly state?: CaptureControlState;
  /** Failure detail rendered when state is `failed`. */
  readonly lastError?: string;
  /** Host handles the authorized capture flow. UI1 never captures itself. */
  readonly onAction?: (request: CaptureActionRequest) => void;
  readonly onCancel?: () => void;
}

// ─── Capability mapping ─────────────────────────────────────────

export function capabilityFor(
  capabilities: readonly CaptureCapabilityEntry[],
  operation: CaptureControlOperation,
  scope: CaptureControlScope,
): CaptureCapabilityEntry {
  return (
    capabilities.find((entry) => entry.operation === operation && entry.scope === scope) ?? {
      operation,
      scope,
      supported: false,
      reason: 'capability unknown — treated as unsupported',
    }
  );
}

// ─── Presentation ───────────────────────────────────────────────

interface ActionRow {
  readonly operation: CaptureControlOperation;
  readonly scope: CaptureControlScope;
  readonly label: string;
  readonly hint: string;
  readonly icon: ReactNode;
}

const SCREENSHOT_ACTIONS: readonly ActionRow[] = [
  {
    operation: 'screenshot',
    scope: 'display',
    label: 'Entire Screen',
    hint: 'Capture the full display',
    icon: <DesktopWindowsOutlinedIcon fontSize="inherit" />,
  },
  {
    operation: 'screenshot',
    scope: 'window',
    label: 'Window',
    hint: 'You pick the window in the OS picker',
    icon: <WebAssetOutlinedIcon fontSize="inherit" />,
  },
  {
    operation: 'screenshot',
    scope: 'region',
    label: 'Region',
    hint: 'Explicit geometry only — drag-select unavailable',
    icon: <CropFreeOutlinedIcon fontSize="inherit" />,
  },
];

const RECORDING_ACTIONS: readonly ActionRow[] = [
  {
    operation: 'recording',
    scope: 'display',
    label: 'Entire Screen',
    hint: 'Record the full display',
    icon: <DesktopWindowsOutlinedIcon fontSize="inherit" />,
  },
  {
    operation: 'recording',
    scope: 'window',
    label: 'Window',
    hint: 'Record one window',
    icon: <WebAssetOutlinedIcon fontSize="inherit" />,
  },
  {
    operation: 'recording',
    scope: 'region',
    label: 'Region',
    hint: 'Record a screen region',
    icon: <CropFreeOutlinedIcon fontSize="inherit" />,
  },
];

const ACTIVE_LABEL: Record<CaptureControlState, string | null> = {
  idle: null,
  'requesting-permission': 'Requesting permission…',
  selecting: 'Waiting for OS selection…',
  capturing: 'Capturing…',
  finalizing: 'Finalizing evidence…',
  completed: 'Capture attached',
  cancelled: 'Capture cancelled',
  failed: 'Capture failed',
  recording: 'Recording…',
};

const BUSY_STATES: readonly CaptureControlState[] = [
  'requesting-permission',
  'selecting',
  'capturing',
  'finalizing',
  'recording',
];

function ActionButton({
  action,
  entry,
  onAction,
}: {
  action: ActionRow;
  entry: CaptureCapabilityEntry;
  onAction?: (request: CaptureActionRequest) => void;
}) {
  return (
    <button
      type="button"
      disabled={!entry.supported}
      title={entry.supported ? action.hint : entry.reason}
      aria-label={`${action.operation} ${action.label}`}
      aria-disabled={!entry.supported}
      onClick={() => onAction?.({ operation: action.operation, scope: action.scope })}
      className="flex w-full items-center gap-2 rounded-[var(--vestara-radius-md)] px-2 py-1.5 text-left text-xs text-[var(--vestara-text-secondary)] transition-colors hover:bg-[var(--vestara-surface-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
    >
      <span aria-hidden="true" className="text-sm text-[var(--vestara-text-muted)]">
        {action.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{action.label}</span>
        <span className="block truncate text-[10px] text-[var(--vestara-text-muted)]">
          {entry.supported ? action.hint : entry.reason}
        </span>
      </span>
    </button>
  );
}

export function CaptureControl({
  capabilities,
  state = 'idle',
  lastError,
  onAction,
  onCancel,
}: CaptureControlProps) {
  const [open, setOpen] = useState(false);
  const busy = BUSY_STATES.includes(state);
  const activeLabel = ACTIVE_LABEL[state];
  const recording = state === 'recording';

  return (
    <div className="relative inline-flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Capture screen"
        title="Screenshot or record the screen"
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true" className="mr-1 inline-flex items-center text-sm">
          <ScreenshotMonitorOutlinedIcon fontSize="inherit" />
        </span>
        Capture
      </Button>

      {recording ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--vestara-status-danger)] bg-[var(--vestara-surface-panel)] px-2.5 py-1 text-[10px] font-semibold text-[var(--vestara-status-danger)]">
          <span aria-hidden="true" className="inline-flex animate-pulse items-center">
            <FiberManualRecordOutlinedIcon fontSize="inherit" />
          </span>
          REC
          <button
            type="button"
            aria-label="Stop recording"
            title="Stop recording"
            onClick={() => onCancel?.()}
            className="inline-flex items-center rounded-full px-1 hover:bg-[var(--vestara-surface-hover)]"
          >
            <StopRoundedIcon fontSize="inherit" />
          </button>
        </span>
      ) : null}

      {activeLabel && !recording ? <Pill variant={state === 'failed' ? 'danger' : 'default'}>{activeLabel}</Pill> : null}
      {state === 'failed' && lastError ? (
        <span role="alert" className="max-w-56 truncate text-[10px] text-[var(--vestara-status-danger)]" title={lastError}>
          {lastError}
        </span>
      ) : null}
      {(busy || state === 'cancelled' || state === 'failed') && onCancel ? (
        <button
          type="button"
          aria-label={state === 'failed' ? 'Dismiss capture error' : 'Cancel capture'}
          title={state === 'failed' ? 'Dismiss capture error' : 'Cancel capture'}
          onClick={() => onCancel()}
          className="inline-flex items-center rounded-full border border-[var(--vestara-border-subtle)] p-1 text-[var(--vestara-text-muted)] hover:bg-[var(--vestara-surface-hover)]"
        >
          <CloseRoundedIcon fontSize="inherit" />
        </button>
      ) : null}

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close capture menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
          <div
            role="menu"
            aria-label="Capture actions"
            className="absolute left-0 top-full z-50 mt-1 w-72 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-2 shadow-[var(--vestara-elevation-lg)]"
          >
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--vestara-text-muted)]">
              Screenshot
            </p>
            {SCREENSHOT_ACTIONS.map((action) => (
              <ActionButton
                key={`screenshot-${action.scope}`}
                action={action}
                entry={capabilityFor(capabilities, action.operation, action.scope)}
                onAction={(request) => {
                  setOpen(false);
                  onAction?.(request);
                }}
              />
            ))}
            <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--vestara-text-muted)]">
              Record Screen
            </p>
            {RECORDING_ACTIONS.map((action) => (
              <ActionButton
                key={`recording-${action.scope}`}
                action={action}
                entry={capabilityFor(capabilities, action.operation, action.scope)}
                onAction={(request) => {
                  setOpen(false);
                  onAction?.(request);
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
