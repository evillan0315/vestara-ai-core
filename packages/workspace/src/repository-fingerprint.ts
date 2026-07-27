/**
 * RepositoryFingerprint — Stage 2 of the open pipeline.
 *
 * Establishes immutable repository identity. Everything downstream
 * depends on this — memory, knowledge, missions, agent state, plugins,
 * analytics. All answer: "Which repository does this belong to?"
 *
 * If the repo is not a git repository, git fields are null but the
 * fingerprint still provides identity via canonical path hash.
 *
 * Architecture Traceability:
 *   Epic: EPIC-001 — Repository Comprehension
 *   Foundation: VOM — RepositoryWorkspace
 */

import { execSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RepositoryFingerprint } from './types';

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function tryExec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 3000 }).trim();
  } catch {
    return null;
  }
}

function computeRepositoryHash(rootDir: string): string {
  const hash = crypto.createHash('sha256');
  const configFiles = [
    'package.json',
    'tsconfig.json',
    'Cargo.toml',
    'go.mod',
    'pyproject.toml',
    'Gemfile',
    'build.gradle',
    'pom.xml',
  ];

  for (const cf of configFiles) {
    const fp = path.join(rootDir, cf);
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      hash.update(content);
    } catch {
      // file doesn't exist — skip
    }
  }

  for (const wf of ['pnpm-workspace.yaml', 'lerna.json', 'nx.json', 'turbo.json']) {
    const fp = path.join(rootDir, wf);
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      hash.update(content);
    } catch {
      // skip
    }
  }

  return hash.digest('hex').slice(0, 16);
}

/**
 * Create a fingerprint for the repository at the given path.
 * Runs git commands if available; degrades gracefully for non-git repos.
 */
export async function createFingerprint(rootDir: string): Promise<RepositoryFingerprint> {
  const resolvedPath = path.resolve(rootDir);
  const _name = path.basename(resolvedPath);

  // Attempt git identity
  const gitRoot = tryExec('git rev-parse --show-toplevel', resolvedPath);
  const gitRemote = gitRoot ? tryExec('git remote get-url origin', gitRoot) : null;
  const gitBranch = gitRoot ? tryExec('git branch --show-current', gitRoot) : null;
  const gitCommit = gitRoot ? tryExec('git rev-parse HEAD', gitRoot) : null;

  // The canonical identity: use git root if available, else resolved path
  const canonicalPath = gitRoot ?? resolvedPath;
  const id = sha256(canonicalPath);
  const repositoryHash = computeRepositoryHash(resolvedPath);

  return {
    id,
    name: path.basename(canonicalPath),
    canonicalPath,
    gitRoot,
    gitRemote,
    gitBranch,
    gitCommit,
    repositoryHash,
    fingerprintedAt: new Date().toISOString(),
  };
}

export type { RepositoryFingerprint };
