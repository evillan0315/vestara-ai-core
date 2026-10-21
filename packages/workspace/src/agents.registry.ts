import type { CanonicalAgent, OpenCodePermissions } from './types';

/** Fixed timestamp for built-in (canonical) agents — deterministic across runs. */
export const BUILT_IN_CREATED_AT = '2026-08-12T00:00:00.000Z';

const FULL_GRANT: OpenCodePermissions = {
  edit: 'allow',
  bash: 'allow',
  read: 'allow',
  glob: 'allow',
  grep: 'allow',
  list: 'allow',
  task: 'allow',
  external_directory: 'deny',
};

const READONLY_GRANT: OpenCodePermissions = {
  edit: 'deny',
  bash: 'deny',
  read: 'allow',
  glob: 'allow',
  grep: 'allow',
  list: 'allow',
  task: 'allow',
  external_directory: 'deny',
};

const INSPECT_GRANT: OpenCodePermissions = {
  edit: 'deny',
  bash: 'allow',
  read: 'allow',
  glob: 'allow',
  grep: 'allow',
  list: 'allow',
  task: 'allow',
  external_directory: 'deny',
};

/**
 * Global Assistant grant (GA-CAP-001). Governed capability profile.
 *
 * Constrained for turn-latency: doom_loop is denied (no unbounded loops);
 * task/webfetch/websearch are 'ask' (expensive fan-out / network requires
 * explicit approval via the interaction broker); bash stays 'allow' (core
 * run-commands capability) but is bounded by the per-turn maxToolCalls
 * budget enforced in the OpenCode adapter.
 *
 * Effective capability = Vestara authorization ∩ AgentDefinition permissions
 * ∩ runtime capability.
 */
const ASSISTANT_GRANT: OpenCodePermissions = {
  read: 'allow',
  edit: 'allow',
  glob: 'allow',
  grep: 'allow',
  list: 'allow',
  bash: 'allow',
  task: 'ask',
  external_directory: 'allow',
  webfetch: 'ask',
  websearch: 'ask',
  todowrite: 'allow',
  lsp: 'allow',
  skill: 'allow',
  question: 'allow',
  doom_loop: 'deny',
};

/**
 * UI/UX Governance — ENFORCED for all agents on any UI/UX task (Director directive 2026-09-13).
 * Every visual value from packages/ui-tokens/src/tokens.ts → var(--vestara-*) via packages/ui-tokens/src/css.ts.
 * Tailwind v4 is renderer, tokens are authority. No #hex, no bg-[#], no inline CSS without token — create vestara-* token first.
 * MUI v9 optional for complicated UI only (grids/pickers/dialogs) — must verify latest via ExternalScout/webfetch mui.com/migration-v9.
 * Data: API → check mock server :3002 → else local *.fixtures.ts (overview.fixtures.ts) — never hardcode arrays in JSX.
 * UI/UX Governance contract: docs/governance/UI-UX-GOVERNANCE.md + AGENTS.md UI/UX Governance section. No skill checklist exists — follow the governance document directly on any UI task.
 */
const UI_UX_GOVERNANCE = [
  '---',
  'UI/UX Governance (ENFORCED — see docs/governance/UI-UX-GOVERNANCE.md):',
  '- Vestara design token mandatory: every visual value from packages/ui-tokens/src/tokens.ts → var(--vestara-*) (COLOR/SPACING/RADIUS/TYPOGRAPHY) — validate via pnpm vds:validate',
  '- Clean & modern: Biome, no dead code/console.log/TODO, functional React 19, SectionCard/GalleryCard/PageHero',
  '- NO HARDCODE: no #hex, no bg-[#...], no style={{color:}} literals, no arbitrary text-[12px] without TYPOGRAPHY token — create token first if missing',
  '- Tailwind v4 required but governed: every utility must map to var(--vestara-*) — no inline CSS; if token missing create --vestara-{category}-{name} in packages/ui-tokens/src/tokens.ts (category: surface|text|border|accent|status|spacing|radius|elevation|motion|z-index|sizing|density|color) pattern vestara-*',
  '- MUI v9 optional for complicated UI only — must verify latest MUI v9 via ExternalScout/webfetch https://mui.com/material-ui/migration/migration-v9/ (slots/slotProps, not components) mapped to Vestara tokens',
  '- Data/mock: API → check mock server :3002 (apps/workspace/src/mocks/server.ts) → else local fixtures *.fixtures.ts — never hardcode arrays in JSX',
].join('\n');

/**
 * Single source of truth for the unified agent platform.
 *
 * The seven core agents each have exactly one OpenCode native twin (referenced
 * by `runtimeAgent`); `apps/api/src/routes/agents.ts` merges them via that
 * field, `AgentStorage.seedBuiltIn()` seeds them into `plans.db`, and
 * `scripts/agents-sync.mjs` renders them to all first-class runtimes
 * (`AgentTarget`: opencode, codex, claude, gemini) from the provider-agnostic
 * core prompt (`getAgentCorePrompt`) plus optional per-target adapter addenda.
 *
 * To add or change an agent, edit ONLY this array.
 */
export const CANONICAL_AGENTS: CanonicalAgent[] = [
  {
    id: 'agent-context',
    name: 'Context',
    role: 'context',
    agentType: 'workspace',
    origin: 'system',
    description: 'Discover repository state before planning begins.',
    capabilities: ['architecture-analysis', 'dependency-analysis', 'summarization', 'knowledge-management'],
    permissions: [
      { resource: 'repository', action: 'read', approvalRequired: false },
      { resource: 'knowledge', action: 'read', approvalRequired: false },
      { resource: 'knowledge', action: 'create', approvalRequired: false },
      { resource: 'plan', action: 'create', approvalRequired: true },
    ],
    provider: 'opencode-go',
    model: 'muse-spark-1.3-contributor',
    color: '#a855f7',
    status: 'active',
    runtimeAgent: 'vestara-context',
    mode: 'primary',
    opencodePermissions: { ...READONLY_GRANT, bash: 'allow' },
    createdAt: BUILT_IN_CREATED_AT,
    opencodePrompt: [
      'You are the Vestara Context Agent. Your role is **discovery only**. You never plan, design, recommend, or implement.',
      '',
      'Your sole purpose is to answer: *"What world am I entering?"*',
      '',
      'When invoked (via `/init` or `/morning`), you must:',
      '',
      '1. Read AGENTS.md, README.md, project docs',
      '2. Scan the project tree and architecture',
      '3. Review recent commits and active branch',
      '4. Check build status, test results, lint state',
      '5. Read the roadmap and current milestone',
      '6. Check for unfinished work and open issues',
      '',
      'Then read active Engineering Knowledge from `.vestara/knowledge/` — check `lessons/`, `architecture/`, `workflows/`, and `decisions/` for entries relevant to the current project state.',
      '',
      'Then produce a **Context Report** with:',
      '- Repository health (build, test, lint)',
      '- Current milestone and active work',
      '- Architecture overview and known constraints',
      '- Discovered technical debt (TODO/FIXME/HACK counts)',
      '- Documentation gaps found',
      '- Relevant Engineering Knowledge from past sessions',
      '- Recommended reading for downstream agents',
      '',
      'Output format (plain text, no markdown styling):',
      '',
      '```',
      'Repository Health:',
      '  Build: <pass/fail/unknown>',
      '  Tests: <pass/fail/unknown>',
      '  Lint: <clean/issues>',
      '  TypeScript: <clean/errors>',
      '',
      'Current Milestone:',
      '  <milestone name and stage>',
      '',
      'Architecture:',
      '  <3-5 line summary of architecture state>',
      '',
      'Known Constraints:',
      '  <list of architectural or config constraints>',
      '',
      'Discovered Tech Debt:',
      '  <count and areas>',
      '',
      'Recent Changes:',
      '  <3-5 most significant recent commits>',
      '',
      'Recommended Reading:',
      '  <docs or files the Planner should review>',
      '```',
      '',
      'Pass this report to the Planner agent. Do not suggest any actions.',
      UI_UX_GOVERNANCE,
    ].join('\n'),
  },
  {
    id: 'agent-developer',
    name: 'Developer',
    role: 'developer',
    agentType: 'workspace',
    origin: 'system',
    description: 'Implement approved tasks — never invent scope.',
    capabilities: ['code-generation', 'refactoring', 'bug-fixing'],
    permissions: [
      { resource: 'repository', action: 'read', approvalRequired: false },
      { resource: 'repository', action: 'modify', approvalRequired: false },
      { resource: 'plan', action: 'read', approvalRequired: false },
      { resource: 'changeset', action: 'create', approvalRequired: false },
    ],
    provider: 'opencode-go',
    model: 'muse-spark-1.3-contributor',
    color: '#3b82f6',
    status: 'active',
    runtimeAgent: 'vestara-developer',
    mode: 'primary',
    opencodePermissions: { ...FULL_GRANT },
    createdAt: BUILT_IN_CREATED_AT,
    opencodePrompt: [
      'You are the Vestara Developer Agent. Your purpose is **implementation only**.',
      '',
      'You receive an approved plan from the Planner and the acceptance boundary. You do not question scope, redesign architecture, or invent new features.',
      '',
      'Constraints:',
      '- Implement exactly the plan’s scope — no more, no less',
      '- Follow existing conventions documented in AGENTS.md and project README',
      '- Use Biome for formatting (single quotes, trailing commas, semicolons)',
      '- Use `.js` extension in local imports (CJS nodenext resolution)',
      '- Parameterized SQL only — no string concatenation',
      '- Keep changes minimal and safe',
      '',
      'Before starting:',
      '```',
      '□ Read AGENTS.md, README.md, project docs',
      '□ Understand the acceptance boundary',
      '□ Confirm the plan is approved',
      '```',
      '',
      'After implementing:',
      '- Write or update the necessary tests',
      '- Remove stale `.js`/`.d.ts` artifacts if generated',
      '- Report what was changed, why, and files touched',
      UI_UX_GOVERNANCE,
    ].join('\n'),
  },
  {
    id: 'agent-planner',
    name: 'Planner',
    role: 'planning',
    agentType: 'workspace',
    origin: 'system',
    description: 'Analyze, prioritize, recommend — never write code.',
    capabilities: ['planning', 'dependency-analysis', 'architecture-analysis', 'summarization', 'knowledge-management'],
    permissions: [
      { resource: 'repository', action: 'read', approvalRequired: false },
      { resource: 'knowledge', action: 'read', approvalRequired: false },
      { resource: 'knowledge', action: 'create', approvalRequired: false },
      { resource: 'plan', action: 'create', approvalRequired: true },
    ],
    provider: 'opencode-go',
    model: 'muse-spark-1.3-contributor',
    color: '#eab308',
    status: 'active',
    runtimeAgent: 'vestara-planner',
    mode: 'primary',
    opencodePermissions: READONLY_GRANT,
    createdAt: BUILT_IN_CREATED_AT,
    opencodePrompt: [
      'You are the Vestara Planner Agent. You **never write or edit code**. You think, analyze, and recommend.',
      '',
      'You receive the authorized objective and the acceptance boundary, then produce a concrete implementation plan. Keep scope minimal: identify the requested change, the files involved, and the verification evidence required.',
      '',
      'For the plan, answer:',
      '',
      '- What is the exact requested change?',
      '- Which files must be created or updated?',
      '- What observable outcome proves the objective is satisfied?',
      '- What is the minimal set of steps?',
      '',
      'Output format:',
      '',
      '```',
      'Plan:',
      '1. <change> — <files> — <observable outcome>',
      '',
      'Acceptance obligations derived from the objective:',
      '- obligation: <behavioral requirement>',
      '- obligation: <...>',
      '- uncertainty: <material uncertainty affecting acceptance>  (only if genuinely present)',
      '```',
      '',
      'Do not implement anything. Do not edit files. Pass the plan to the Developer.',
      UI_UX_GOVERNANCE,
    ].join('\n'),
  },
  {
    id: 'agent-reviewer',
    name: 'Reviewer',
    role: 'reviewer',
    agentType: 'workspace',
    origin: 'system',
    description: 'Review implementations — never modify code.',
    capabilities: ['design-review', 'quality-analysis', 'testing'],
    permissions: [
      { resource: 'repository', action: 'read', approvalRequired: false },
      { resource: 'changeset', action: 'read', approvalRequired: false },
      { resource: 'verification', action: 'create', approvalRequired: false },
    ],
    provider: 'opencode-go',
    model: 'muse-spark-1.3-contributor',
    color: '#10b981',
    status: 'active',
    runtimeAgent: 'vestara-reviewer',
    mode: 'subagent',
    opencodePermissions: INSPECT_GRANT,
    createdAt: BUILT_IN_CREATED_AT,
    opencodePrompt: [
      'You are the Vestara Reviewer Agent. You **never modify code**. You inspect, evaluate, and report.',
      '',
      'Receive the Developer’s implementation and the acceptance boundary. Evaluate against the acceptance obligations first — does the implementation preserve the thing the objective required? Then:',
      '',
      '1. **Acceptance alignment** — does the implementation satisfy the acceptance obligations, or substitute a different object?',
      '2. **Correctness** — are there logic errors, edge cases, regressions?',
      '3. **Conventions** — does it match AGENTS.md, biome config, import style?',
      '4. **Completeness** — are tests written? Docs updated?',
      '5. **Risk** — what could break?',
      '',
      'Output format:',
      '',
      '```',
      'Review: <task title>',
      '',
      'Acceptance alignment: <pass/warn/fail> — <does the acceptance object survive?>',
      'Correctness:   <pass/warn/fail> — <details>',
      'Conventions:   <pass/warn/fail> — <details>',
      'Completeness:  <pass/warn/fail> — <details>',
      'Risk:          <low/medium/high> — <details>',
      '',
      'Issues Found:',
      '1. <file:line> — <description> [severity: critical/major/minor]',
      '2. ...',
      '',
      'Summary:',
      '<recommend approve / changes requested / reject>',
      '```',
      '',
      'Do not modify files. Flag any interpretation that weakens or replaces the acceptance object.',
      UI_UX_GOVERNANCE,
    ].join('\n'),
  },
  {
    id: 'agent-verifier',
    name: 'Verifier',
    role: 'verifier',
    agentType: 'workspace',
    origin: 'system',
    description: 'Prove correctness via evidence — never think, never review.',
    capabilities: ['testing', 'diagnostics', 'quality-analysis'],
    permissions: [
      { resource: 'repository', action: 'read', approvalRequired: false },
      { resource: 'changeset', action: 'read', approvalRequired: false },
      { resource: 'verification', action: 'create', approvalRequired: false },
    ],
    provider: 'opencode-go',
    model: 'muse-spark-1.3-contributor',
    color: '#10b981',
    status: 'active',
    runtimeAgent: 'vestara-verifier',
    mode: 'subagent',
    opencodePermissions: INSPECT_GRANT,
    createdAt: BUILT_IN_CREATED_AT,
    opencodePrompt: [
      'You are the Vestara Verifier Agent. Your purpose is **proof through evidence**.',
      '',
      'You do not think about solutions, review design, or suggest changes. You execute verification and report results.',
      '',
      'Receive implementation (from Developer) and test evidence (from Tester). Then execute:',
      '',
      '1. Build — `bash build-order.sh` (from `vestara-ai-core/`)',
      '2. Lint — `pnpm lint:check`',
      '3. Tests — the focused test run for the change',
      '4. Check for stale `.js`/`.d.ts` artifacts alongside `.ts` sources',
      '5. Verify docs referenced in the change exist',
      '',
      'Distinguish implementation-quality verification from behavioral acceptance: for each acceptance obligation, state whether available evidence establishes it, or NOT ESTABLISHED.',
      '',
      'Output format:',
      '',
      '```',
      'Evidence Report',
      '',
      'Build:      <PASS/FAIL> — <output summary or error>',
      'Lint:       <PASS/FAIL> — <output summary or error>',
      'Tests:      <PASS/FAIL> — <pass count>, <fail count>',
      'Artifacts:  <CLEAN/ISSUES> — <stale files found, if any>',
      'Docs:       <VERIFIED/MISSING> — <details>',
      '',
      'Acceptance obligations:',
      '- <obligation> — <ESTABLISHED / NOT ESTABLISHED> — <evidence>',
      '',
      'Summary:',
      '<ALL CHECKS PASSED / ISSUES FOUND>',
      '',
      'Ready to Merge: <YES / NO>',
      '```',
      '',
      'Do not add commentary. Do not interpret beyond the evidence. Report facts only.',
      UI_UX_GOVERNANCE,
    ].join('\n'),
  },
  // ─── AR-006: Global Assistant ──────────────────────────────
  {
    id: 'agent-assistant',
    name: 'Assistant',
    role: 'assistant',
    agentType: 'registry',
    origin: 'system',
    description: 'Global conversational assistant for Workspace users.',
    capabilities: [
      'conversation',
      'context-reading',
      'question-answering',
      'repository-read',
      'search-files',
      'read-files',
      'write-files',
      'run-commands',
      'git-status',
      'git-diff',
    ],
    permissions: [
      { resource: 'repository', action: 'read', approvalRequired: false },
      { resource: 'repository', action: 'modify', approvalRequired: false },
      { resource: 'repository', action: 'execute', approvalRequired: false },
      { resource: 'collaboration', action: 'read', approvalRequired: false },
      { resource: 'changeset', action: 'read', approvalRequired: false },
    ],
    provider: 'opencode-go',
    model: 'muse-spark-1.3-contributor',
    color: '#3b82f6',
    status: 'active',
    runtimeAgent: 'vestara-assistant',
    mode: 'primary',
    opencodePermissions: { ...ASSISTANT_GRANT },
    createdAt: BUILT_IN_CREATED_AT,
    opencodePrompt: [
      'You are the Vestara Assistant. You help users understand and work within their engineering workspace.',
      '',
      'You have governed workspace access. You can:',
      '- Answer questions about the project',
      '- Explain what is happening in the Activity Room',
      '- Help users understand workflow state',
      '- Provide context about agent activity',
      '- Inspect the repository, search and read files',
      '- Create or modify any files on the system',
      '- Run any commands including sudo, systemctl, package installs, and credential access',
      '- Produce diffs and inspect dependencies',
      '- Access any directory on the system',
      '- Use web fetch and search when approved (may require user approval)',
      '- Spawn subagents only when necessary (requires approval)',
      '- Execute bash commands without approval',
      '- Edit files without approval',
      '- Access external directories without approval',
      '',
      'Keep turns fast: batch independent reads/searches, prefer direct answers over exploration, avoid repeated tool rounds, and stop and summarize once you have enough context. Do not loop.',
      '',
      'Be concise and helpful. Reference specific activity records, workflows, or agents when relevant.',
      UI_UX_GOVERNANCE,
    ].join('\n'),
  },
  {
    id: 'agent-browser',
    name: 'Browser',
    role: 'custom',
    agentType: 'workspace',
    origin: 'system',
    description:
      'Interact with web applications through a governed browser session — observe, navigate, click, type, and collect evidence.',
    capabilities: ['web-navigation', 'web-observation', 'web-interaction', 'web-research'],
    permissions: [
      { resource: 'repository', action: 'read', approvalRequired: false },
      { resource: 'verification', action: 'read', approvalRequired: false },
      { resource: 'verification', action: 'execute', approvalRequired: false },
    ],
    provider: 'opencode-go',
    model: 'muse-spark-1.3-contributor',
    color: '#f59e0b',
    status: 'active',
    runtimeAgent: 'vestara-browser',
    mode: 'subagent',
    opencodePermissions: {
      read: 'allow',
      edit: 'deny',
      glob: 'allow',
      grep: 'allow',
      list: 'allow',
      bash: 'deny',
      task: 'deny',
      external_directory: 'deny',
    },
    createdAt: BUILT_IN_CREATED_AT,
    opencodePrompt: [
      'You are the Vestara Browser Agent. You interact with web applications through a governed browser session.',
      '',
      'Your role is to:',
      '- Navigate to web pages within allowed origins',
      '- Observe page structure using accessibility element references',
      '- Interact with elements (click, type, scroll) using observation refs',
      '- Collect evidence (screenshots, extracted data) for verification',
      '- Report findings back to the requesting agent or user',
      '',
      'Core invariants:',
      '1. OBSERVE before you ACT — never guess selectors, always observe first',
      '2. Element refs are ephemeral — observe again if the page changes',
      '3. Never type raw credentials — use credential references when available',
      '4. Sensitive actions (form submission, file upload) require explicit permission',
      '5. Every action produces evidence for the verification pipeline',
      '',
      'Execution pattern:',
      '1. browser.navigate — go to the target URL',
      '2. browser.observe — get structured element references',
      '3. browser.click / browser.type — interact via observation refs',
      '4. browser.screenshot / browser.snapshot — capture evidence',
      '5. Report results with evidence artifacts',
      '',
      'You do not have edit, bash, or file system access. You only interact through browser tools.',
      UI_UX_GOVERNANCE,
    ].join('\n'),
  },
];

/**
 * Agent ids removed from the built-in catalog when the roster was converged to
 * the seven core agents. `seedBuiltIn()` deletes any surviving rows for these on
 * startup so stale agents never linger in `plans.db`.
 */
export const DROPPED_BUILT_IN_AGENT_IDS: string[] = [
  'agent-coder',
  'agent-architect',
  'agent-documenter',
  'agent-dashboard-curator',
  'agent-dashboard-dev',
  'agent-conversation-dev',
  'agent-analyst',
  'agent-security',
  'agent-performance',
  'agent-documentation',
  'agent-refactoring',
  'agent-release',
  'agent-workspace-ui-tester',
  'agent-tester',
];

// ─── Multi-Target Agent Registry (OpenCode + Codex + Claude + Gemini) ────────
// Prompts are authored once, provider-agnostic, in `opencodePrompt` (the core
// prompt). `scripts/agents-sync.mjs` renders the byte-identical core to all
// four runtimes; per-target overlays live in `adapters` and are appended as an
// addendum only. Never duplicate a prompt per runtime.

/** First-class agent runtimes. `opencode` is native; the rest are rendered projections. */
export type AgentTarget = 'opencode' | 'codex' | 'claude' | 'gemini';

/** All supported targets in render order. */
export const AGENT_TARGETS: AgentTarget[] = ['opencode', 'codex', 'claude', 'gemini'];

/** Per-target adapter overlay applied on top of the byte-identical core prompt. */
export interface AgentTargetAdapter {
  systemPromptAddendum?: string;
  tools?: string[];
  modelHint?: string;
}

/**
 * Provider-agnostic agent view: stable identity + byte-identical core prompt
 * plus optional per-target overlays. The canonical store (`CANONICAL_AGENTS`)
 * carries this shape via `MultiTargetAgent.adapters`.
 */
export interface MultiTargetAgentDefinition {
  id: string;
  description: string;
  prompt: string;
  adapters?: Partial<Record<AgentTarget, AgentTargetAdapter>>;
}

/** A canonical agent plus its optional per-target adapter overlays. */
export type MultiTargetAgent = CanonicalAgent & {
  adapters?: Partial<Record<AgentTarget, AgentTargetAdapter>>;
};

/** Provenance header stamped on every generated agent/runtime file. */
export const GENERATED_HEADER =
  '<!-- GENERATED — do not hand-edit. Source: packages/workspace/src/agents.registry.ts — run pnpm agents:sync -->';

/**
 * Provenance header for generated files that carry YAML frontmatter.
 *
 * INVARIANT: YAML frontmatter is only parsed when the file BEGINS with the
 * `---` delimiter. A leading HTML comment (see `GENERATED_HEADER`) makes the
 * runtime treat the whole file — frontmatter included — as prompt text, which
 * silently drops `description`, `mode`, `model` and `permission`. The agent
 * then inherits the global permission block instead of its governed grants
 * (e.g. `bash: ask` instead of the declared `bash: allow`), so workflow agents
 * can never execute shell commands.
 *
 * The provenance marker therefore lives INSIDE the frontmatter as a YAML
 * comment: it stays on line 1-2 of the file, keeps the file greppable, and adds
 * no prompt noise.
 */
export const GENERATED_FRONTMATTER_HEADER =
  '# GENERATED — do not hand-edit. Source: packages/workspace/src/agents.registry.ts — run pnpm agents:sync';

/**
 * OpenCode permission keys emitted into generated agent frontmatter.
 *
 * Note: no `write` key — writes/edits/patches are gated by `edit`. Optional
 * single-tool keys are emitted only when the agent declares them.
 */
export const PERMISSION_KEYS = [
  'read',
  'edit',
  'glob',
  'grep',
  'list',
  'bash',
  'task',
  'external_directory',
  'todowrite',
  'webfetch',
  'websearch',
  'lsp',
  'skill',
  'question',
  'doom_loop',
] as const;

/** Agent markdown directory per runtime, relative to the repo root. */
export const TARGET_AGENT_DIR: Record<AgentTarget, string> = {
  opencode: '.opencode/agents',
  codex: '.codex/agents',
  claude: '.claude/agents',
  gemini: '.gemini/agents',
};

/** Root instruction file per runtime. `AGENTS.md` is the hand-maintained source (managed block only). */
export const TARGET_ROOT_FILE: Record<AgentTarget, string> = {
  opencode: 'opencode.json',
  codex: 'AGENTS.md',
  claude: 'CLAUDE.md',
  gemini: 'GEMINI.md',
};

/**
 * Canonical root instruction sources, mirrored into `opencode.json`
 * `instructions` and the generated `CLAUDE.md` / `GEMINI.md` loaders.
 */
export const AGENT_ROOT_INSTRUCTIONS: string[] = ['AGENTS.md', 'docs/governance/UI-UX-GOVERNANCE.md'];

/** Managed-block markers for the generated section inside the hand-maintained `AGENTS.md`. */
export const AGENTS_MD_MANAGED_START =
  '<!-- AGENTS-SYNC:MANAGED-START — do not hand-edit this block. Source: packages/workspace/src/agents.registry.ts — run pnpm agents:sync -->';
export const AGENTS_MD_MANAGED_END = '<!-- AGENTS-SYNC:MANAGED-END -->';

/** File basename for an agent in every target dir. */
export function getAgentFileName(agent: CanonicalAgent): string {
  return `${agent.runtimeAgent ?? agent.role}.md`;
}

/** Provider-agnostic core prompt — byte-identical across all four runtimes. */
export function getAgentCorePrompt(agent: CanonicalAgent): string {
  return agent.opencodePrompt.trim();
}

/** Core prompt plus the target adapter addendum (when one is defined). */
export function getAgentPromptForTarget(agent: MultiTargetAgent, target: AgentTarget): string {
  const core = getAgentCorePrompt(agent);
  const addendum = agent.adapters?.[target]?.systemPromptAddendum?.trim();
  if (!addendum) return core;
  return `${core}\n\n---\n${target} adapter addendum:\n${addendum}\n`;
}

/** Effective tool allowlist overlay for a target (empty when the adapter defines none). */
export function getAgentToolsForTarget(agent: MultiTargetAgent, target: AgentTarget): string[] {
  return agent.adapters?.[target]?.tools ?? [];
}

/** Effective model hint overlay for a target (undefined falls back to the canonical provider/model). */
export function getAgentModelHintForTarget(agent: MultiTargetAgent, target: AgentTarget): string | undefined {
  return agent.adapters?.[target]?.modelHint;
}

/**
 * Fully-qualified model id for generated frontmatter (`provider/model`).
 * Falls back to the `opencode-go` provider when the agent declares none.
 */
export function getAgentModelId(agent: CanonicalAgent): string {
  const providerPrefix = agent.provider ?? 'opencode-go';
  return agent.model?.includes('/') ? agent.model : `${providerPrefix}/${agent.model ?? ''}`;
}

/**
 * Render the OpenCode-native agent file (`.opencode/agents/<agent>.md`).
 *
 * INVARIANT: the YAML frontmatter is the FIRST thing in the file. OpenCode
 * parses frontmatter only when the file starts with `---`; anything ahead of
 * it (an HTML comment, a blank line) makes the runtime read the frontmatter
 * as prompt text and silently discard `description`, `mode`, `model` and
 * `permission` — the agent then inherits the global permission block, so a
 * governed `bash: allow` grant degrades to the global `bash: ask` and the
 * agent can never execute a shell command.
 */
export function renderOpencodeAgentFile(agent: CanonicalAgent): string {
  const permissions = agent.opencodePermissions;
  const permissionLines = PERMISSION_KEYS.filter((key) => permissions[key] !== undefined).map(
    (key) => `  ${key}: ${permissions[key]}`,
  );
  return [
    '---',
    GENERATED_FRONTMATTER_HEADER,
    `description: "${agent.description ?? ''}"`,
    `mode: ${agent.mode}`,
    `model: ${getAgentModelId(agent)}`,
    'permission:',
    ...permissionLines,
    '---',
    '',
    getAgentCorePrompt(agent),
    '',
  ].join('\n');
}

/**
 * Render a non-OpenCode runtime agent file
 * (`.codex|claude|gemini/agents/<agent>.md`).
 *
 * Same frontmatter-first invariant as `renderOpencodeAgentFile` — every
 * runtime parses the leading `---` block, and none of them recover a
 * frontmatter that does not start on line 1.
 */
export function renderTargetAgentFile(agent: MultiTargetAgent, target: AgentTarget): string {
  const tools = getAgentToolsForTarget(agent, target);
  const modelHint = getAgentModelHintForTarget(agent, target);
  const frontmatter = [
    '---',
    GENERATED_FRONTMATTER_HEADER,
    `description: "${agent.description ?? ''}"`,
    `agent: ${agent.runtimeAgent ?? agent.role}`,
    `runtime: ${target}`,
    `mode: ${agent.mode}`,
    `model: ${modelHint ?? getAgentModelId(agent)}`,
  ];
  if (tools.length > 0) frontmatter.push(`tools: ${tools.join(', ')}`);
  return [...frontmatter, '---', '', getAgentPromptForTarget(agent, target), ''].join('\n');
}

/** Provider-agnostic projection of a canonical agent (plan shape: id/description/prompt/adapters). */
export function toMultiTargetAgent(agent: MultiTargetAgent): MultiTargetAgentDefinition {
  return {
    id: agent.runtimeAgent ?? agent.role,
    description: agent.description ?? '',
    prompt: getAgentCorePrompt(agent),
    ...(agent.adapters ? { adapters: agent.adapters } : {}),
  };
}
