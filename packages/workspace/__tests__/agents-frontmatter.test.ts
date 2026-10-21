/**
 * Regression guard — generated agent files must be frontmatter-first.
 *
 * Runtimes parse YAML frontmatter ONLY when the file starts with the `---`
 * delimiter. A provenance comment ahead of the frontmatter makes the runtime
 * read the whole file — frontmatter included — as prompt text, silently
 * dropping `description`, `mode`, `model` and `permission`.
 *
 * The consequence was invisible in the repository (the files still "looked
 * right") but fatal at runtime: every agent fell back to the global
 * permission block, so the workflow Developer / Reviewer / Verifier resolved
 * `bash → ask` instead of their governed `bash → allow`. The OpenCode runtime
 * then gated every shell call behind `permission.asked`, which the workflow
 * runtime never answers — the shell call never ran and the turn stalled.
 *
 * This guard is offline (no live runtime required) so CI catches the defect
 * before it reaches a workflow run.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANONICAL_AGENTS, getAgentCorePrompt } from '../src/agents.registry';

/** Repository root — the directory that owns `.opencode/agents/*.md`. */
function findRepositoryRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.opencode', 'agents')) && fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('repository root (owner of .opencode/agents) not found');
}

interface ParsedFrontmatter {
  readonly fields: Record<string, string>;
  readonly permission: Record<string, string>;
}

/**
 * Parse the leading YAML frontmatter block.
 *
 * The generated format is a flat key/value list plus one nested
 * `permission:` map — a deliberately small subset, parsed here without a YAML
 * dependency so the guard runs anywhere.
 */
function parseFrontmatter(content: string): ParsedFrontmatter {
  if (!content.startsWith('---\n')) {
    throw new Error('file does not start with the "---" frontmatter delimiter');
  }
  const end = content.indexOf('\n---\n', 3);
  if (end === -1) throw new Error('frontmatter block is not terminated');
  const block = content.slice(4, end);
  const fields: Record<string, string> = {};
  const permission: Record<string, string> = {};
  let inPermission = false;
  for (const line of block.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const indented = /^\s+/.test(line);
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (indented) {
      if (inPermission) permission[key] = value;
      continue;
    }
    inPermission = key === 'permission';
    if (!inPermission) fields[key] = value;
  }
  return { fields, permission };
}

const RUNTIME_DIRS = [
  { target: 'opencode', dir: '.opencode/agents' },
  { target: 'codex', dir: '.codex/agents' },
  { target: 'claude', dir: '.claude/agents' },
  { target: 'gemini', dir: '.gemini/agents' },
] as const;

const REPOSITORY_ROOT = findRepositoryRoot();

describe('generated agent files are frontmatter-first', () => {
  it.each(RUNTIME_DIRS)('renders $target agent files with parseable frontmatter', ({ target, dir }) => {
    for (const agent of CANONICAL_AGENTS) {
      const file = path.join(REPOSITORY_ROOT, dir, `${agent.runtimeAgent ?? agent.role}.md`);
      expect(fs.existsSync(file), `${file} is missing`).toBe(true);
      const content = fs.readFileSync(file, 'utf8');

      // The invariant: frontmatter starts on line 1.
      expect(content.startsWith('---\n'), `${file} must start with the "---" frontmatter delimiter`).toBe(true);

      const { fields, permission } = parseFrontmatter(content);
      expect(fields.description, `${file} frontmatter description`).toBe(`"${agent.description ?? ''}"`);
      expect(fields.mode, `${file} frontmatter mode`).toBe(agent.mode);

      // The governed grants must survive into the rendered frontmatter — this
      // is what the runtime actually enforces. Only the OpenCode target
      // renders a permission block; the other runtimes carry the agent's
      // identity/mode and enforce grants natively.
      if (target === 'opencode') {
        for (const [key, grant] of Object.entries(agent.opencodePermissions)) {
          expect(permission[key], `${file} permission.${key}`).toBe(grant);
        }
      }

      // The core prompt is the body — never part of the frontmatter.
      expect(content).toContain(getAgentCorePrompt(agent));
    }
  });

  it('grants shell access to the workflow agents', () => {
    const shellAgents = CANONICAL_AGENTS.filter((agent) => ['developer', 'reviewer', 'verifier'].includes(agent.role));
    expect(shellAgents.map((agent) => agent.role).sort()).toEqual(['developer', 'reviewer', 'verifier']);
    for (const agent of shellAgents) {
      expect(agent.opencodePermissions.bash, `${agent.role} bash grant`).toBe('allow');
    }
  });
});
