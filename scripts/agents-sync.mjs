import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

// NOTE: this file runs directly under Node (no TS transform), so it must use
// plain ESM — no `import type` statements.
const here = dirname(fileURLToPath(import.meta.url));
const vestaraAiCore = resolve(here, '..');
const rootRepo = resolve(here, '..', '..');
const CHECK = process.argv.includes('--check');

// Load the canonical registry (.ts) by transpiling it in-memory. The registry
// only `import type`s from ./types (erased), so no runtime resolution is needed.
const registryPath = join(vestaraAiCore, 'packages', 'workspace', 'src', 'agents.registry.ts');
const { outputText } = transpileModule(readFileSync(registryPath, 'utf8'), {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2020, verbatimModuleSyntax: false },
  fileName: 'agents.registry.ts',
});
const dataUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
const { CANONICAL_AGENTS } = await import(dataUrl);

function renderMd(agent) {
  const p = agent.opencodePermissions;
  const model = agent.model?.startsWith('opencode/') ? agent.model : `opencode/${agent.model ?? ''}`;
  // OpenCode permission keys. Note: no `write` key — writes/edits/patches are
  // gated by `edit`. Optional single-tool keys are emitted only when set.
  const permissionKeys = [
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
  const permissionLines = permissionKeys.filter((k) => p[k] !== undefined).map((k) => `  ${k}: ${p[k]}`);
  const frontmatter = [
    '---',
    `description: "${agent.description ?? ''}"`,
    `mode: ${agent.mode}`,
    `model: ${model}`,
    'permission:',
    ...permissionLines,
    '---',
    '',
    agent.opencodePrompt.trim(),
    '',
  ];
  return frontmatter.join('\n');
}

function syncDir(label, baseDir) {
  const agentsDir = join(baseDir, '.opencode', 'agents');
  const written = [];
  if (CHECK) {
    if (!existsSync(agentsDir)) {
      console.error(`[agents:check] MISSING directory: ${agentsDir}`);
      process.exitCode = 1;
      return written;
    }
  } else {
    mkdirSync(agentsDir, { recursive: true });
  }
  for (const agent of CANONICAL_AGENTS) {
    const name = agent.runtimeAgent ?? agent.role;
    const file = join(agentsDir, `${name}.md`);
    const content = renderMd(agent);
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
    } else {
      writeFileSync(file, content);
    }
    written.push(file);
  }
  if (!CHECK) console.log(`[agents:sync] ${label}: wrote ${written.length} agent(s) to ${agentsDir}`);
  return written;
}

const targets = [
  ['vestara-ai-core', vestaraAiCore],
  ['root', rootRepo],
];

// OpenCode agents live ONLY in .opencode/agents/*.md (generated above). The
// project opencode.json files must not carry a hand-maintained `agent:` block,
// which previously drifted (it kept the removed `vestara-tester`). This guard
// strips it on sync and flags it on check so the single-source rule holds.
function syncOpencodeJson(label, file) {
  if (!existsSync(file)) return;
  const obj = JSON.parse(readFileSync(file, 'utf8'));
  if (!('agent' in obj)) return;
  if (CHECK) {
    console.error(
      `[agents:check] DRIFT in ${file} — unexpected \`agent\` block (agents live in .opencode/agents/*.md)`,
    );
    process.exitCode = 1;
    return;
  }
  delete obj.agent;
  writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
  console.log(`[agents:sync] ${label}: stripped \`agent\` block from ${file}`);
}

const opencodeJsonTargets = [
  ['vestara-ai-core', join(vestaraAiCore, 'opencode.json')],
  ['root', join(rootRepo, 'opencode.json')],
];

let total = 0;
for (const [label, dir] of targets) {
  total += syncDir(label, dir).length;
}
for (const [label, file] of opencodeJsonTargets) {
  syncOpencodeJson(label, file);
}

if (CHECK) {
  if (process.exitCode === 1) {
    console.error(
      '[agents:check] FAILED — .opencode/agents/*.md or opencode.json drifted from the canonical registry.',
    );
    process.exit(1);
  }
  console.log(
    `[agents:check] OK — ${CANONICAL_AGENTS.length} canonical agents in sync across both repos; opencode.json agent blocks clear.`,
  );
} else {
  console.log(`[agents:sync] Done. ${total} agent file(s) written (${CANONICAL_AGENTS.length} per repo × 2 repos).`);
}
