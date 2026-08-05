// OpenCode permission governance types and pure normalization.
//
// Permission requests arrive from OpenCode as `permission.asked` /
// `permission.v2.asked` events on the event stream. This module normalizes them
// into a Vestara-domain OpenCodePermissionRequest and classifies the action
// into a governance bucket. Renderer-free and unit-testable.

export type OpenCodePermissionRisk = 'safe' | 'sensitive' | 'dangerous';

export type OpenCodePermissionStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type OpenCodePermissionAction =
  | 'read'
  | 'edit'
  | 'write'
  | 'glob'
  | 'grep'
  | 'list'
  | 'bash'
  | 'webfetch'
  | 'other';

export interface OpenCodePermissionRequest {
  readonly id: string;
  readonly sessionId?: string;
  readonly permission?: string;
  readonly action: OpenCodePermissionAction;
  readonly resources: readonly string[];
  readonly save?: readonly string[];
  readonly metadata?: Record<string, unknown>;
  readonly source?: { readonly type?: string; readonly messageId?: string; readonly callId?: string };
  readonly risk: OpenCodePermissionRisk;
  readonly askedAt: string;
}

/** Classify a permission action into a governance risk bucket. */
export function classifyPermissionRisk(action: string): OpenCodePermissionRisk {
  const normalized = action.toLowerCase();
  if (normalized === 'bash' || normalized === 'shell' || normalized === 'write') return 'dangerous';
  if (
    normalized === 'edit' ||
    normalized === 'webfetch' ||
    normalized === 'fetch' ||
    normalized === 'command' ||
    normalized === 'execute'
  ) {
    return 'sensitive';
  }
  return 'safe';
}

/** Normalize a raw permission action string to the governance enum. */
export function normalizePermissionAction(action: string | undefined): OpenCodePermissionAction {
  const normalized = (action ?? '').toLowerCase();
  switch (normalized) {
    case 'read':
    case 'edit':
    case 'write':
    case 'glob':
    case 'grep':
    case 'list':
    case 'bash':
    case 'webfetch':
      return normalized;
    default:
      return 'other';
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

/** Normalize a raw OpenCode event payload into a permission request. */
export function normalizePermissionRequest(
  payload: Record<string, unknown> | undefined,
): OpenCodePermissionRequest | undefined {
  if (!payload) return undefined;
  const id = asString(payload.id);
  if (!id) return undefined;
  const sessionId = asString(payload.sessionID) ?? asString(payload.sessionId);
  const action = asString(payload.action) ?? asString(payload.permission) ?? 'other';
  const resources = asStringArray(payload.resources ?? payload.patterns);
  const metadata =
    payload.metadata && typeof payload.metadata === 'object'
      ? (payload.metadata as Record<string, unknown>)
      : undefined;
  const sourceValue = payload.source;
  const source =
    sourceValue && typeof sourceValue === 'object'
      ? {
          type: asString((sourceValue as Record<string, unknown>).type),
          messageId: asString((sourceValue as Record<string, unknown>).messageID),
          callId: asString((sourceValue as Record<string, unknown>).callID),
        }
      : undefined;
  return {
    id,
    sessionId,
    permission: asString(payload.permission),
    action: normalizePermissionAction(action),
    resources: resources.length > 0 ? resources : asStringArray([asString(payload.pattern)]),
    save: asStringArray(payload.save),
    metadata,
    source,
    risk: classifyPermissionRisk(action),
    askedAt: asString(payload.time) ?? new Date().toISOString(),
  };
}
