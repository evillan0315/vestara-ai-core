/**
 * Assistant Capability Policy — Vestara-owned boundary for Global Assistant authority.
 *
 * GA-CAP-003. Intercepts OpenCode permission requests and enforces an explicit
 * tool-level policy BEFORE execution reaches the OpenCode server. This is the
 * single source of truth for what the Global Assistant can do.
 *
 * Invariant:
 *   Runtime capability ≠ Assistant authority.
 *   Assistant authority = AssistantCapabilityPolicy ∩ OpenCodeRuntimeCapability ∩ RepositoryBinding
 *
 * Policy categories:
 *   ALLOW  — auto-approve (all known tools)
 *   ASK    — surface to user (currently unused; reserved for future gating)
 *   DENY   — auto-reject (unknown actions fall through)
 *
 * The policy is evaluated per permission request. Tool names are normalized
 * to OpenCodePermissionAction before matching.
 *
 * Skills remain instructional: skill authority ⊆ current Assistant authority.
 * A skill must never transform DENY → ALLOW or ASK → ALLOW.
 */

import type { OpenCodePermissionAction } from '@vestara/opencode-runtime';
import { normalizePermissionAction } from '@vestara/opencode-runtime';

// ── Policy Decision ────────────────────────────────────────────────────────

export type PolicyDecision = 'allow' | 'ask' | 'deny';

// ── Policy Rule ────────────────────────────────────────────────────────────

export interface PolicyRule {
  /** The permission action this rule applies to. */
  readonly action: OpenCodePermissionAction;
  /** The decision when this action is requested. */
  readonly decision: PolicyDecision;
  /** Optional resource pattern filter. If provided, the rule only matches
   *  when at least one resource matches the pattern. */
  readonly resourcePattern?: RegExp;
  /** Human-readable reason for audit trail. */
  readonly reason: string;
}

// ── Capability Policy ──────────────────────────────────────────────────────

export interface AssistantCapabilityPolicy {
  /** Ordered list of rules. First match wins. */
  readonly rules: readonly PolicyRule[];
  /** Default decision when no rule matches. */
  readonly defaultDecision: PolicyDecision;
  /** Repository root (absolute path). Used for confinement checks. */
  readonly repositoryDir: string;
}

// ── Default Policy (GA-RUNTIME-001 Addendum B) ─────────────────────────────

/**
 * The canonical Assistant capability policy — risk-sensitive authorization.
 *
 * capability available ≠ capability authorized ≠ capability executed.
 *
 * ALL tools (ALLOW — full assistant authority per GA-CAP-001):
 *   read, glob, grep, list, edit, write, bash, lsp, skill, todowrite,
 *   task, webfetch, websearch, external_directory  ALLOW
 *
 * UNKNOWN (DENY):
 *   a newly appearing OpenCode tool must not automatically acquire mutation
 *   authority. Unknown actions and unmatched patterns fall through to DENY.
 */
export function createDefaultAssistantPolicy(repositoryDir: string): AssistantCapabilityPolicy {
  return {
    repositoryDir,
    defaultDecision: 'deny', // conservative: unknown actions are denied
    rules: [
      // ── READ / OBSERVATION (ALLOW) ──
      { action: 'read', decision: 'allow', reason: 'read: safe read-only access' },
      { action: 'glob', decision: 'allow', reason: 'glob: safe file discovery' },
      { action: 'grep', decision: 'allow', reason: 'grep: safe content search' },
      { action: 'list', decision: 'allow', reason: 'list: safe directory listing' },

      // ── MUTATION / SHELL (ALLOW — full assistant authority) ──
      { action: 'edit', decision: 'allow', reason: 'edit: full assistant authority (GA-CAP-001)' },
      { action: 'write', decision: 'allow', reason: 'write: full assistant authority (GA-CAP-001)' },
      { action: 'bash', decision: 'allow', reason: 'bash: full assistant authority (GA-CAP-001)' },

      // ── NETWORK (ALLOW — full assistant authority) ──
      { action: 'webfetch', decision: 'allow', reason: 'webfetch: full assistant authority (GA-CAP-001)' },

      // ── 'other' catch-all with resource pattern checks ──
      // skill/todowrite/task/lsp: ALLOW (maps to 'other')
      {
        action: 'other',
        decision: 'allow',
        reason: 'assistant support tools: skill/todowrite/task/lsp',
        resourcePattern: /^(skill|todowrite|task|lsp)/i,
      },
      // websearch: ALLOW (maps to 'other')
      {
        action: 'other',
        decision: 'allow',
        reason: 'websearch: full assistant authority (GA-CAP-001)',
        resourcePattern: /^websearch/i,
      },
      // external directory access: ALLOW (maps to 'other')
      {
        action: 'other',
        decision: 'allow',
        reason: 'external_directory: full assistant authority (GA-CAP-001)',
        resourcePattern: /external/i,
      },
    ],
  };
}

// ── Policy Evaluation ──────────────────────────────────────────────────────

export interface PermissionEvaluation {
  readonly decision: PolicyDecision;
  readonly reason: string;
  readonly ruleIndex: number;
  readonly action: OpenCodePermissionAction;
  readonly resources: readonly string[];
}

/**
 * Evaluate a permission request against the capability policy.
 * First matching rule wins. If no rule matches, the default decision applies.
 */
export function evaluatePermission(
  policy: AssistantCapabilityPolicy,
  action: OpenCodePermissionAction,
  resources: readonly string[],
): PermissionEvaluation {
  for (let i = 0; i < policy.rules.length; i += 1) {
    const rule = policy.rules[i];
    if (rule.action !== action) continue;

    // If the rule has a resource pattern, check if any resource matches
    if (rule.resourcePattern) {
      const hasMatch = resources.some((r) => rule.resourcePattern!.test(r));
      if (!hasMatch) continue;
    }

    return {
      decision: rule.decision,
      reason: rule.reason,
      ruleIndex: i,
      action,
      resources,
    };
  }

  // No rule matched — use default
  return {
    decision: policy.defaultDecision,
    reason: `default: no policy rule matched action '${action}'`,
    ruleIndex: -1,
    action,
    resources,
  };
}

// ── Per-Turn Tools Map (GA-RUNTIME-004 / GA-TOOL-001) ────────────────────────

/**
 * All OpenCode tool names the GA recognizes. Tools not in this list
 * are treated as unknown and disabled.
 */
export const ALL_TOOL_NAMES = [
  'read',
  'glob',
  'grep',
  'list',
  'edit',
  'write',
  'bash',
  'task',
  'todowrite',
  'webfetch',
  'websearch',
  'external_directory',
  'lsp',
  'skill',
  'question',
  'doom_loop',
] as const;

/**
 * Construct a per-turn tools map from the GA-CAP-003 policy.
 *
 * ALLOW tools → true (model can use them)
 * ASK tools  → false (Vestara mediates — model cannot use them directly)
 * DENY tools → false (blocked entirely)
 *
 * Tool names are normalized via normalizePermissionAction before policy
 * evaluation (e.g. 'task' → 'other', matched by resource pattern).
 */
export function buildToolsMap(
  policy: AssistantCapabilityPolicy,
  approvedTools?: ReadonlySet<string>,
): Record<string, boolean> {
  const tools: Record<string, boolean> = {};
  for (const name of ALL_TOOL_NAMES) {
    const action = normalizePermissionAction(name);
    const evaluation = evaluatePermission(policy, action, [name]);
    if (evaluation.decision === 'allow') {
      tools[name] = true;
    } else if (evaluation.decision === 'ask' && approvedTools?.has(name)) {
      tools[name] = true;
    } else {
      tools[name] = false;
    }
  }
  return tools;
}

// ── Repository Confinement ─────────────────────────────────────────────────

export interface ConfinementCheck {
  readonly confined: boolean;
  readonly reason: string;
  readonly requestedPath: string;
  readonly repositoryDir: string;
}

/**
 * Check whether a resource path is confined to the repository directory.
 * Used for DENY-on-external and ASK-on-external decisions.
 */
export function checkRepositoryConfinement(repositoryDir: string, resourcePath: string): ConfinementCheck {
  const normalizedRepo = repositoryDir.replace(/\/+$/, '');
  const normalizedResource = resourcePath.replace(/\/+$/, '');

  if (normalizedResource === normalizedRepo || normalizedResource.startsWith(`${normalizedRepo}/`)) {
    return { confined: true, reason: 'resource is within repository', requestedPath: resourcePath, repositoryDir };
  }

  return {
    confined: false,
    reason: 'resource is outside repository — external scope',
    requestedPath: resourcePath,
    repositoryDir,
  };
}
