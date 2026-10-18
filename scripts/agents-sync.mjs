import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

// NOTE: this file runs directly under Node (no TS transform), so it must use
// plain ESM — no `import type` statements.
const here = dirname(fileURLToPath(import.meta.url));
const vestaraAiCore = resolve(here, '..');
const rootRepo = resolve(here, '..', '..');
const CHECK = process.argv.includes('--check');

// The parent-of-repo target exists for a local layout where sibling repos sit
// under one folder that also carries a shared .opencode/agents. GitHub Actions
// checks the repo out at <parent>/<repo> where the parent is a bare directory,
// so probing it there reported the agent dirs as MISSING and failed
// `agents:check` on every run — and it passed locally only because this machine
// happens to have that shared folder. Treat the parent as a target only when it
// already looks like one, so the check reflects this checkout rather than
// whatever layout the runner happens to have.
const rootRepoIsTarget =
  existsSync(join(rootRepo, '.git')) ||
  existsSync(join(rootRepo, 'opencode.json')) ||
  existsSync(join(rootRepo, '.opencode', 'agents'));

// Load the canonical registry (.ts) by transpiling it in-memory. The registry
// only `import type`s from ./types (erased), so no runtime resolution is needed.
const registryPath = join(vestaraAiCore, 'packages', 'workspace', 'src', 'agents.registry.ts');
const { outputText } = transpileModule(readFileSync(registryPath, 'utf8'), {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2020, verbatimModuleSyntax: false },
  fileName: 'agents.registry.ts',
});
const dataUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
const {
  CANONICAL_AGENTS,
  AGENT_TARGETS,
  TARGET_AGENT_DIR,
  GENERATED_HEADER,
  AGENT_ROOT_INSTRUCTIONS,
  AGENTS_MD_MANAGED_START,
  AGENTS_MD_MANAGED_END,
  getAgentCorePrompt,
  getAgentPromptForTarget,
  getAgentToolsForTarget,
  getAgentModelHintForTarget,
} = await import(dataUrl);

function agentFileName(agent) {
  return `${agent.runtimeAgent ?? agent.role}.md`;
}

function agentModel(agent) {
  const providerPrefix = agent.provider ?? 'opencode-go';
  return agent.model?.includes('/') ? agent.model : `${providerPrefix}/${agent.model ?? ''}`;
}

// OpenCode permission keys. Note: no `write` key — writes/edits/patches are
// gated by `edit`. Optional single-tool keys are emitted only when set.
const PERMISSION_KEYS = [
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
];

function renderOpencode(agent) {
  const p = agent.opencodePermissions;
  const permissionLines = PERMISSION_KEYS.filter((k) => p[k] !== undefined).map((k) => `  ${k}: ${p[k]}`);
  return [
    GENERATED_HEADER,
    '',
    '---',
    `description: "${agent.description ?? ''}"`,
    `mode: ${agent.mode}`,
    `model: ${agentModel(agent)}`,
    'permission:',
    ...permissionLines,
    '---',
    '',
    getAgentCorePrompt(agent),
    '',
  ].join('\n');
}

// Non-OpenCode runtimes share the byte-identical core prompt; only the
// frontmatter envelope and an optional adapter addendum differ per target.
function renderTarget(agent, target) {
  const tools = getAgentToolsForTarget(agent, target);
  const modelHint = getAgentModelHintForTarget(agent, target);
  const frontmatter = [
    '---',
    `description: "${agent.description ?? ''}"`,
    `agent: ${agent.runtimeAgent ?? agent.role}`,
    `runtime: ${target}`,
    `mode: ${agent.mode}`,
    `model: ${modelHint ?? agentModel(agent)}`,
  ];
  if (tools.length > 0) frontmatter.push(`tools: ${tools.join(', ')}`);
  return [GENERATED_HEADER, '', ...frontmatter, '---', '', getAgentPromptForTarget(agent, target), ''].join('\n');
}

function renderAgent(agent, target) {
  return target === 'opencode' ? renderOpencode(agent) : renderTarget(agent, target);
}

function expectedFiles() {
  return new Set(CANONICAL_AGENTS.map(agentFileName));
}

function syncTargetDir(label, baseDir, target) {
  const agentsDir = join(baseDir, TARGET_AGENT_DIR[target]);
  const expected = expectedFiles();
  let written = 0;
  if (CHECK) {
    if (!existsSync(agentsDir)) {
      console.error(`[agents:check] MISSING directory: ${agentsDir}`);
      process.exitCode = 1;
      return 0;
    }
    for (const stale of readdirSync(agentsDir).filter((f) => f.endsWith('.md') && !expected.has(f))) {
      console.error(`[agents:check] STALE file ${join(agentsDir, stale)} (not in registry — remove it)`);
      process.exitCode = 1;
    }
  } else {
    mkdirSync(agentsDir, { recursive: true });
    for (const stale of readdirSync(agentsDir).filter((f) => f.endsWith('.md') && !expected.has(f))) {
      rmSync(join(agentsDir, stale));
      console.log(`[agents:sync] ${label}: removed stale ${target} agent file ${stale}`);
    }
  }
  for (const agent of CANONICAL_AGENTS) {
    const file = join(agentsDir, agentFileName(agent));
    const content = renderAgent(agent, target);
    if (CHECK) {
      if (!existsSync(file)) {
        console.error(`[agents:check] MISSING agent file: ${file}`);
        process.exitCode = 1;
        continue;
      }
      if (readFileSync(file, 'utf8') !== content) {
        console.error(`[agents:check] DRIFT in ${file} (run \`pnpm agents:sync\`)`);
        process.exitCode = 1;
        continue;
      }
      // Core prompts must be byte-identical across all four runtimes (adapter
      // addenda, when defined, are appended after the core — never interleaved).
      const core = getAgentCorePrompt(agent);
      if (!readFileSync(file, 'utf8').includes(core)) {
        console.error(`[agents:check] CORE-PROMPT DIVERGENCE in ${file} (core prompt not byte-identical)`);
        process.exitCode = 1;
        continue;
      }
    } else {
      writeFileSync(file, content);
    }
    written += 1;
  }
  if (!CHECK) console.log(`[agents:sync] ${label}: wrote ${written} ${target} agent(s) to ${agentsDir}`);
  return written;
}

// Root instruction loaders mirror opencode.json `instructions` (single source:
// AGENT_ROOT_INSTRUCTIONS in the registry) plus the canonical agent roster.
// They are generated — never hand-maintained duplicates.
function renderRootLoader(runtime) {
  const lines = [
    GENERATED_HEADER,
    '',
    `# Vestara — ${runtime === 'claude' ? 'Claude' : 'Gemini'} Instructions`,
    '',
    'Load in order:',
    '',
    ...AGENT_ROOT_INSTRUCTIONS.map(
      (entry, i) => `${i + 1}. \`${entry}\` — canonical repo instructions (single source of truth).`,
    ),
    '',
    'Repo is `vestara-ai-core`, pnpm workspaces (`pnpm-workspace.yaml` is authority), Node 22+, `bash build-order.sh` before test, `pnpm lint:check && pnpm build && pnpm test`.',
    '',
    'UI rules (summary): tokens mandatory (`packages/ui-tokens/src/tokens.ts` → `var(--vestara-*)`), no hardcode, Tailwind v4 governed via `vestara-*`, MUI v9 optional (verify via webfetch), mock server :3002 → else local fixtures. Full spec in `docs/governance/UI-UX-GOVERNANCE.md`.',
    '',
    '## Canonical agents (managed by `pnpm agents:sync`)',
    '',
    ...CANONICAL_AGENTS.map((a) => `- \`${a.runtimeAgent ?? a.role}\` — ${a.description ?? ''}`),
    '',
  ];
  return lines.join('\n');
}

function renderAgentsManagedBlock() {
  return [
    AGENTS_MD_MANAGED_START,
    '',
    '## Agent Runtimes (managed by `pnpm agents:sync`)',
    '',
    `Single source of truth: \`packages/workspace/src/agents.registry.ts\` (${CANONICAL_AGENTS.length} canonical agents).`,
    '',
    'Rendered targets (identical core prompts, per-target adapter addenda only):',
    '',
    ...AGENT_TARGETS.map((t) => `- \`${t}\` → \`${TARGET_AGENT_DIR[t]}/<agent>.md\``),
    '',
    'Root instruction files mirror `opencode.json` instructions (never hand-maintained duplicates):',
    '',
    ...AGENT_ROOT_INSTRUCTIONS.map((entry) => `- \`${entry}\``),
    '',
    'Never hand-edit generated agent files or add an `agent` block to `opencode.json` — use `pnpm agents:sync` / `pnpm agents:check`.',
    '',
    AGENTS_MD_MANAGED_END,
  ].join('\n');
}

// AGENTS.md stays hand-maintained; only the managed roster block is synced.
function syncAgentsMd(label, baseDir) {
  const file = join(baseDir, 'AGENTS.md');
  if (!existsSync(file)) {
    if (CHECK) {
      console.error(`[agents:check] MISSING root file: ${file}`);
      process.exitCode = 1;
    }
    return 0;
  }
  const block = renderAgentsManagedBlock();
  const current = readFileSync(file, 'utf8');
  const start = current.indexOf(AGENTS_MD_MANAGED_START);
  const end = current.indexOf(AGENTS_MD_MANAGED_END);
  const hasCurrentBlock =
    start !== -1 && end !== -1 && current.slice(start, end + AGENTS_MD_MANAGED_END.length) === block;
  if (CHECK) {
    if (!hasCurrentBlock) {
      console.error(`[agents:check] DRIFT in ${file} managed block (run \`pnpm agents:sync\`)`);
      process.exitCode = 1;
    }
    return 0;
  }
  let next;
  if (start !== -1 && end !== -1 && end > start) {
    next = current.slice(0, start) + block + current.slice(end + AGENTS_MD_MANAGED_END.length);
  } else {
    next = `${current.trimEnd()}\n\n${block}\n`;
  }
  if (next !== current) {
    writeFileSync(file, next);
    console.log(`[agents:sync] ${label}: refreshed managed block in ${file}`);
    return 1;
  }
  return 0;
}

function syncRootLoader(label, baseDir, fileName, runtime) {
  const file = join(baseDir, fileName);
  const content = renderRootLoader(runtime);
  if (CHECK) {
    if (!existsSync(file)) {
      console.error(`[agents:check] MISSING root file: ${file}`);
      process.exitCode = 1;
      return 0;
    }
    if (readFileSync(file, 'utf8') !== content) {
      console.error(`[agents:check] DRIFT in ${file} (run \`pnpm agents:sync\`)`);
      process.exitCode = 1;
    }
    return 0;
  }
  const prev = existsSync(file) ? readFileSync(file, 'utf8') : null;
  writeFileSync(file, content);
  if (prev !== content) console.log(`[agents:sync] ${label}: wrote ${file}`);
  return 1;
}

// OpenCode agents live ONLY in .opencode/agents/*.md (generated above). The
// project opencode.json files must not carry a hand-maintained `agent:` block,
// which previously drifted (it kept the removed `vestara-tester`). This guard
// strips it on sync and flags it on check so the single-source rule holds.
// `instructions` is synced from AGENT_ROOT_INSTRUCTIONS (registry authority).
function syncOpencodeJson(label, file) {
  if (!existsSync(file)) return;
  const obj = JSON.parse(readFileSync(file, 'utf8'));
  const wantInstructions = JSON.stringify(AGENT_ROOT_INSTRUCTIONS);
  const drift = 'agent' in obj || JSON.stringify(obj.instructions ?? null) !== wantInstructions;
  if (CHECK) {
    if ('agent' in obj) {
      console.error(
        `[agents:check] DRIFT in ${file} — unexpected \`agent\` block (agents live in .opencode/agents/*.md)`,
      );
      process.exitCode = 1;
    }
    if (JSON.stringify(obj.instructions ?? null) !== wantInstructions) {
      console.error(`[agents:check] DRIFT in ${file} — \`instructions\` must mirror the registry`);
      process.exitCode = 1;
    }
    return;
  }
  if (!drift) return;
  delete obj.agent;
  obj.instructions = [...AGENT_ROOT_INSTRUCTIONS];
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
  console.log(`[agents:sync] ${label}: synced ${file} (instructions mirrored, \`agent\` block stripped)`);
}

const agentDirTargets = [['vestara-ai-core', vestaraAiCore], ...(rootRepoIsTarget ? [['root', rootRepo]] : [])];

const opencodeJsonTargets = [
  ['vestara-ai-core', join(vestaraAiCore, 'opencode.json')],
  ...(rootRepoIsTarget ? [['root', join(rootRepo, 'opencode.json')]] : []),
];

// Root instruction files belong to the repo itself — the parent checkout is a
// different project grouping, so only agent dirs + opencode.json sync there.
const rootFileTargets = [['vestara-ai-core', vestaraAiCore]];

let total = 0;
for (const [label, dir] of agentDirTargets) {
  for (const target of AGENT_TARGETS) {
    total += syncTargetDir(label, dir, target);
  }
}
for (const [label, file] of opencodeJsonTargets) {
  syncOpencodeJson(label, file);
}
let roots = 0;
for (const [label, dir] of rootFileTargets) {
  roots += syncAgentsMd(label, dir);
  roots += syncRootLoader(label, dir, 'CLAUDE.md', 'claude');
  roots += syncRootLoader(label, dir, 'GEMINI.md', 'gemini');
}

if (CHECK) {
  if (process.exitCode === 1) {
    console.error('[agents:check] FAILED — generated agent/runtime files drifted from the canonical registry.');
    process.exit(1);
  }
  console.log(
    `[agents:check] OK — ${CANONICAL_AGENTS.length} canonical agents × ${AGENT_TARGETS.length} runtimes in sync; root files and opencode.json instructions clear.`,
  );
} else {
  console.log(
    `[agents:sync] Done. ${total} agent file(s) written (${CANONICAL_AGENTS.length} per runtime × ${AGENT_TARGETS.length} runtimes × ${agentDirTargets.length} repo(s)) + ${roots} root file update(s).`,
  );
}
