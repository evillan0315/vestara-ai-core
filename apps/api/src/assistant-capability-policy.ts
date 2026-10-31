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
 *   ALLOW  — auto-approve (read/search + repo-scoped mutation/shell)
 *   ASK    — surface to the user via the interaction broker (network and
 *            external-directory tools: webfetch, websearch, external_directory)
 *   DENY   — auto-reject (unknown actions fall through)
 *
 * The policy is evaluated per permission request. Tool names are normalized
 * to OpenCodePermissionAction before matching.
 *
 * Skills remain instructional: skill authority ⊆ current Assistant authority.
 * A skill must never transform DENY → ALLOW or ASK → ALLOW.
 */

import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { OpenCodePermissionAction } from '@vestara/opencode-runtime';
import { normalizePermissionAction } from '@vestara/opencode-runtime';
import type { AgentDefinition } from '@vestara/workspace';

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
 * Matches GA-CAP-001 (network/external gated, everything else automatic):
 *   read, glob, grep, list, edit, write, bash, lsp, skill, todowrite,
 *   task  ALLOW (automatic — repository confinement still applies)
 *   webfetch, websearch, external_directory  ASK (user decision per request
 *     via the interaction broker; fail-safe deny on timeout)
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

      // ── MUTATION / SHELL (ALLOW — repo-scoped automatic per GA-CAP-001) ──
      { action: 'edit', decision: 'allow', reason: 'edit: automatic within repository (GA-CAP-001)' },
      { action: 'write', decision: 'allow', reason: 'write: automatic within repository (GA-CAP-001)' },
      { action: 'bash', decision: 'allow', reason: 'bash: automatic within repository (GA-CAP-001)' },

      // ── NETWORK (ASK — user-gated per GA-CAP-001 §1) ──
      { action: 'webfetch', decision: 'ask', reason: 'webfetch: network — user decision (GA-CAP-001)' },

      // ── 'other' catch-all with resource pattern checks ──
      // skill/todowrite/task/lsp: ALLOW (maps to 'other')
      {
        action: 'other',
        decision: 'allow',
        reason: 'assistant support tools: skill/todowrite/task/lsp',
        resourcePattern: /^(skill|todowrite|task|lsp)/i,
      },
      // websearch: ASK (maps to 'other')
      {
        action: 'other',
        decision: 'ask',
        reason: 'websearch: network — user decision (GA-CAP-001)',
        resourcePattern: /^websearch/i,
      },
      // external directory access: ASK (maps to 'other')
      {
        action: 'other',
        decision: 'ask',
        reason: 'external_directory: outside repository — user decision (GA-CAP-001)',
        resourcePattern: /external/i,
      },
    ],
  };
}

// ── Per-Agent Policy (ROUTING-CONVERGENCE-001C S2) ───────────────────

/** Declared OpenCode grants from the canonical AgentDefinition. */
export type AgentGrantSet = NonNullable<AgentDefinition['opencodePermissions']>;

/**
 * Derive a turn capability policy from an agent's DECLARED grants
 * (`AgentDefinition.opencodePermissions` — the same grants rendered into the
 * agent's `.opencode/agents/*.md` twin).
 *
 * One exact-match rule per recognized tool, in a fixed order; unknown tools
 * and unmapped grants fall through to DENY. No new permission vocabulary:
 * decisions stay allow/ask/deny and flow through the SAME Vestara
 * enforcement machinery (`evaluatePermission` → tools map → interaction
 * broker). Identity selects the declared policy — it never bypasses
 * enforcement, so a permissive grant cannot auto-approve outside the
 * pipeline (governance boundary: agent identity ≠ authority).
 *
 * Canonical grant quirk (see `OpenCodePermissions` docs): there is
 * deliberately no `write` key — writes/edits/patches gate on `edit`.
 */
export function createPolicyForAgent(
  repositoryDir: string,
  agentId: string,
  grants: AgentGrantSet,
): AssistantCapabilityPolicy {
  const record = grants as unknown as Record<string, string | undefined>;
  const rules: PolicyRule[] = ALL_TOOL_NAMES.map((tool) => {
    const decision = resolveAgentGrant(record, tool);
    return {
      action: normalizePermissionAction(tool),
      decision,
      resourcePattern: new RegExp(`^${tool}$`, 'i'),
      reason: `agent ${agentId}: ${tool}=${decision} (AgentDefinition grant)`,
    };
  });
  return { repositoryDir, defaultDecision: 'deny', rules };
}

function resolveAgentGrant(record: Record<string, string | undefined>, tool: string): PolicyDecision {
  const direct = record[tool];
  if (direct === 'allow' || direct === 'ask' || direct === 'deny') return direct;
  if (tool === 'write') {
    const edit = record.edit;
    if (edit === 'allow' || edit === 'ask' || edit === 'deny') return edit;
  }
  return 'deny';
}

// ── Policy Evaluation ─────────────────────────────────────────────────────

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
 *
 * Hardened: resolves symlinks via `realpathSync` before comparing, so a
 * symlink inside the repo pointing outside (or a `..` traversal) cannot
 * pass the lexical prefix check. Non-absolute resources (tool names, labels,
 * globs) are not paths — they return confined:true with reason `not-a-path`
 * so callers only gate actual filesystem scope. Unresolvable paths fail
 * closed (confined:false) — an attacker-controlled unresolvable path must
 * never read as inside.
 *
 * ENVELOPE DECISION (recorded 2026-10-26): the harness-path
 * `FilesystemRuntime.evaluate` content-hash envelope does NOT cover
 * OpenCode-native file operations (model-driven `edit`/`write` via the
 * OpenCode server bypass `FilesystemRuntime` entirely). Compensating
 * controls for the OpenCode path are: (1) this confinement check wired
 * into the adapter permission gate (`assistant-opencode-adapter.ts` —
 * absolute-path resources outside the repo downgrade ALLOW to DENY),
 * (2) network/external tools gated to ASK, (3) per-turn tool-call budget.
 * A unified content-hash envelope for OpenCode-native writes remains
 * future work — tracked, not silently assumed.
 */
export function checkRepositoryConfinement(repositoryDir: string, resourcePath: string): ConfinementCheck {
  // Only absolute paths are filesystem scope; everything else (tool names,
  // labels, globs, URLs) is not gated by confinement.
  if (typeof resourcePath !== 'string' || !resourcePath.startsWith('/')) {
    return {
      confined: true,
      reason: 'not-a-path: resource is not an absolute filesystem path',
      requestedPath: resourcePath,
      repositoryDir,
    };
  }
  try {
    // Resolve the repo root itself (it may contain symlinked components).
    const realRepo = realpathSync(resolve(repositoryDir));
    // For existing files/symlinks realpath resolves the full chain; for
    // not-yet-existing paths (new files) resolve the nearest existing
    // ancestor — a symlinked parent dir pointing outside still escapes.
    const candidate = resolve(resourcePath);
    let realCandidate: string | null = null;
    try {
      realCandidate = realpathSync(candidate);
    } catch {
      let dir = dirname(candidate);
      let suffix = candidate.slice(dir.length);
      for (let depth = 0; depth < 16; depth += 1) {
        try {
          const realDir = realpathSync(dir);
          realCandidate = resolve(realDir + suffix);
          break;
        } catch {
          const parent = dirname(dir);
          if (parent === dir) break;
          suffix = dir.slice(parent.length) + suffix;
          dir = parent;
        }
      }
    }
    if (!realCandidate) {
      return {
        confined: false,
        reason: 'unresolvable path — fail closed',
        requestedPath: resourcePath,
        repositoryDir,
      };
    }
    if (realCandidate === realRepo || realCandidate.startsWith(`${realRepo}/`)) {
      return { confined: true, reason: 'resource is within repository', requestedPath: resourcePath, repositoryDir };
    }
    return {
      confined: false,
      reason: 'resource is outside repository — external scope',
      requestedPath: resourcePath,
      repositoryDir,
    };
  } catch {
    return {
      confined: false,
      reason: 'confinement check failed — fail closed',
      requestedPath: resourcePath,
      repositoryDir,
    };
  }
}
