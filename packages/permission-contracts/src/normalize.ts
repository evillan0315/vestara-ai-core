/**
 * Runtime permission normalization.
 *
 * Pure functions that normalize runtime-specific permission strings
 * to the canonical Vestara PermissionAction vocabulary.
 *
 * INVARIANT: Normalization is pure and deterministic.
 * INVARIANT: Unknown input maps to 'other' — never throws.
 */

import { isPermissionAction, type PermissionAction } from './permission-action.js';
import type { PermissionRisk } from './permission-status.js';

/**
 * Normalize a raw permission action string to the canonical vocabulary.
 *
 * Handles OpenCode-style action names and maps them to PermissionAction.
 * Unknown actions map to 'other'.
 */
export function normalizePermissionAction(action: string | undefined): PermissionAction {
  const normalized = (action ?? '').toLowerCase();
  if (isPermissionAction(normalized)) return normalized;
  // Known aliases
  if (normalized === 'shell') return 'bash';
  if (normalized === 'fetch') return 'webfetch';
  if (normalized === 'command' || normalized === 'execute') return 'bash';
  if (normalized === 'external_directory' || normalized === 'external') return 'external-directory';
  return 'other';
}

/**
 * Classify a permission action into a risk bucket.
 *
 * This is a pure heuristic used by policy engines as input to decision-making.
 * It does NOT determine the policy decision — that is the policy engine's role.
 */
export function classifyPermissionRisk(action: string): PermissionRisk {
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
