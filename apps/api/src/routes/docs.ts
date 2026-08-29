/**
 * Documentation module routes.
 *
 * Serves the repo's markdown documentation to the Workspace Documentation page:
 *   GET  /api/docs/meta     → repo identity + remote URL (for "Open Source")
 *   GET  /api/docs/tree     → documentation tree (known doc roots, nested)
 *   GET  /api/docs/index    → search index (title, headings, tags, excerpt)
 *   GET  /api/docs/content  → raw markdown content for one document
 *   POST /api/docs/ask      → AI answer grounded in one document
 *
 * Security: every file read is resolved inside `ctx.repoPath` and restricted
 * to markdown extensions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

const DOC_ROOTS = [
  'docs',
  'Documentation',
  'documentation',
  'wiki',
  'Blueprint',
  'Specifications',
  'Architecture',
  'API',
  'api',
  'Workflow',
  'Agents',
  'Runtime',
  'Development',
  'Deployment',
  'Planning',
  'Knowledge',
  'Research',
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  'LICENSE.md',
];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.vestara',
  '.next',
  '.nuxt',
  'coverage',
  'build',
  'out',
  '.turbo',
  '.cache',
  '.idea',
  '.vscode',
  'target',
  'vendor',
  'public',
  '__tests__',
]);

const MD_RE = /\.(md|mdx|markdown)$/i;

interface DocFileNode {
  type: 'file';
  name: string;
  path: string;
  title: string;
}

interface DocDirNode {
  type: 'dir';
  name: string;
  path: string;
  children: DocNode[];
  count: number;
}

type DocNode = DocFileNode | DocDirNode;

interface IndexEntry {
  path: string;
  title: string;
  headings: string[];
  tags: string[];
  aliases: string[];
  text: string;
}

/** Resolve a repo-relative path, rejecting traversal outside the repo. */
function safeResolve(repoPath: string, rel: string): string | null {
  const abs = path.resolve(repoPath, rel);
  const root = path.resolve(repoPath);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function isMarkdown(name: string): boolean {
  return MD_RE.test(name);
}

function readFrontmatter(raw: string): { title: string | null; tags: string[]; aliases: string[] } {
  const meta: Record<string, string> = {};
  const body = raw.startsWith('---') ? raw.slice(3) : raw;
  const end = body.indexOf('\n---');
  if (end === -1) return { title: null, tags: [], aliases: [] };
  const block = body.slice(0, end);
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-zA-Z][\w-]*)\s*:\s*(.*)$/);
    if (m) meta[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  const title = meta.title?.trim() || null;
  const tags = splitList(meta.tags);
  const aliases = splitList(meta.aliases);
  return { title, tags, aliases };
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return value
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstHeading(raw: string): string | null {
  const m = raw.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

/** Cheap title for a file: frontmatter title → first H1 → file name. */
function titleOf(repoPath: string, rel: string, fallback: string): string {
  const abs = safeResolve(repoPath, rel);
  if (!abs) return fallback;
  try {
    const raw = fs.readFileSync(abs, 'utf8').slice(0, 900);
    const { title } = readFrontmatter(raw);
    return title || firstHeading(raw) || fallback;
  } catch {
    return fallback;
  }
}

function walkDir(repoPath: string, rel: string, depth: number): DocDirNode {
  const abs = safeResolve(repoPath, rel) as string;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const dirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name));
  const files = entries.filter((e) => e.isFile() && isMarkdown(e.name));

  const children: DocNode[] = [];

  for (const d of dirs) {
    const childRel = path.posix.join(rel, d.name);
    children.push(walkDir(repoPath, childRel, depth + 1));
  }

  for (const f of files) {
    const childRel = path.posix.join(rel, f.name);
    children.push({
      type: 'file',
      name: f.name,
      path: childRel,
      title: titleOf(repoPath, childRel, f.name),
    });
  }

  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { type: 'dir', name: path.basename(rel) || rel, path: rel, children, count: children.length };
}

function stripMarkdown(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/^\s*[-+*]\s+/gm, ' ')
    .replace(/^\s*\d+\.\s+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build the documentation tree for a repo plus a flat list of markdown files. */
export function buildDocTree(repoPath: string): { roots: DocNode[]; files: string[] } {
  const roots: DocNode[] = [];
  for (const root of DOC_ROOTS) {
    const abs = safeResolve(repoPath, root);
    if (!abs) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      roots.push(walkDir(repoPath, root, 0));
    } else if (stat.isFile() && isMarkdown(root)) {
      roots.push({
        type: 'file',
        name: path.basename(root),
        path: root,
        title: titleOf(repoPath, root, path.basename(root)),
      });
    }
  }
  const files: string[] = [];
  const walk = (node: DocNode) => {
    if (node.type === 'file') files.push(node.path);
    else node.children.forEach(walk);
  };
  roots.forEach(walk);
  return { roots, files };
}

function collectFiles(repoPath: string, node: DocNode, out: Array<{ rel: string; abs: string }>): void {
  if (node.type === 'file') {
    const abs = safeResolve(repoPath, node.path);
    if (abs) out.push({ rel: node.path, abs });
    return;
  }
  for (const child of node.children) collectFiles(repoPath, child, out);
}

function buildIndex(repoPath: string, roots: DocNode[]): IndexEntry[] {
  const files: Array<{ rel: string; abs: string }> = [];
  for (const root of roots) collectFiles(repoPath, root, files);

  const entries: IndexEntry[] = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(file.abs, 'utf8');
      const { title: fmTitle, tags, aliases } = readFrontmatter(raw);
      const headings: string[] = [];
      let inFence = false;
      for (const line of raw.split('\n')) {
        if (/^\s*```/.test(line)) {
          inFence = !inFence;
          continue;
        }
        if (!inFence) {
          const m = line.match(/^(#{1,6})\s+(.+)$/);
          if (m) headings.push(m[2].trim());
        }
      }
      const text = stripMarkdown(raw).slice(0, 600);
      entries.push({
        path: file.rel,
        title: fmTitle || headings[0] || file.rel.split('/').pop() || file.rel,
        headings,
        tags,
        aliases,
        text,
      });
    } catch {
      /* unreadable file — skip from index */
    }
  }
  return entries;
}

function detectRemote(repoPath: string): string | null {
  try {
    const config = fs.readFileSync(path.join(repoPath, '.git', 'config'), 'utf8');
    const m = config.match(/url\s*=\s*(.+)/);
    const url = m?.[1]?.trim();
    if (!url) return null;
    if (url.startsWith('git@')) {
      const ssh = url
        .replace(/^git@/, '')
        .replace(':', '/')
        .replace(/\.git$/, '');
      return `https://${ssh}`;
    }
    if (url.startsWith('http')) return url.replace(/\.git$/, '');
    if (url.startsWith('ssh://')) return url.replace(/^ssh:\/\//, 'https://').replace(/\.git$/, '');
    return null;
  } catch {
    return null;
  }
}

function repoNameOf(repoPath: string): string {
  return path.basename(repoPath) || 'workspace';
}

const INDEX_CACHE_TTL_MS = 15_000;
let indexCache: { key: string; at: number; index: IndexEntry[] } | null = null;

function getIndex(repoPath: string, roots: DocNode[]): IndexEntry[] {
  const key = repoPath;
  const now = Date.now();
  if (indexCache && indexCache.key === key && now - indexCache.at < INDEX_CACHE_TTL_MS) {
    return indexCache.index;
  }
  const index = buildIndex(repoPath, roots);
  indexCache = { key, at: now, index };
  return index;
}

export async function handleDocsRoute(
  method: string,
  p: string,
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  const repoPath = ctx.repoPath;

  if (method === 'GET' && p === '/api/docs/meta') {
    json(res, 200, {
      repoName: repoNameOf(repoPath),
      repoPath,
      remoteUrl: detectRemote(repoPath),
    });
    return true;
  }

  if (method === 'GET' && p === '/api/docs/tree') {
    const { roots } = buildDocTree(repoPath);
    json(res, 200, { roots, rootsCount: roots.length });
    return true;
  }

  if (method === 'GET' && p === '/api/docs/index') {
    const { roots } = buildDocTree(repoPath);
    json(res, 200, { docs: getIndex(repoPath, roots) });
    return true;
  }

  if (method === 'GET' && p === '/api/docs/content') {
    const url = new URL(req.url || '', 'http://127.0.0.1');
    const rel = url.searchParams.get('path') || '';
    const abs = safeResolve(repoPath, rel);
    if (!abs || !isMarkdown(path.basename(rel))) {
      json(res, 404, { error: 'document not found' });
      return true;
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      json(res, 404, { error: 'document not found' });
      return true;
    }
    if (!stat.isFile()) {
      json(res, 400, { error: 'not a document' });
      return true;
    }
    try {
      const content = fs.readFileSync(abs, 'utf8');
      json(res, 200, { path: rel, name: path.basename(rel), content, bytes: Buffer.byteLength(content) });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  if (method === 'POST' && p === '/api/docs/ask') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const question = body.question?.trim();
    if (!question) {
      json(res, 400, { error: 'question is required' });
      return true;
    }
    const provider = ctx.kernel.providerManager?.getProvider('opencode') ?? null;
    if (!provider) {
      json(res, 503, { error: 'AI provider not available' });
      return true;
    }

    const title = typeof body.title === 'string' ? body.title : '';
    const content = typeof body.content === 'string' ? body.content.slice(0, 16_000) : '';
    const scope = body.scope || 'document';

    const scopeText =
      scope === 'entire-docs'
        ? 'the entire repository documentation'
        : scope === 'selection'
          ? 'the following selected excerpt'
          : 'the following document';

    const systemPrompt = [
      'You are Vestara, an AI engineering assistant specializing in technical documentation.',
      `You are answering a question about ${scopeText}.`,
      'Answer directly and concretely from the provided material.',
      'If the answer is not in the material, say so plainly.',
      'Keep responses concise and actionable. Use short markdown when helpful.',
    ].join('\n');

    const userMessage = [
      title ? `Document: ${title}` : '',
      content ? `Material:\n"""\n${content}\n"""` : '',
      `Question: ${question}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const result = await provider.complete({
        model: body.model || 'nemotron-3-ultra-free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        maxTokens: 2048,
      });
      json(res, 200, { answer: result.content || 'No response.' });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  return false;
}
