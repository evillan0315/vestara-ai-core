/**
 * Documentation module API client.
 *
 * Thin fetch wrapper around the Vestara docs endpoints (apps/api/src/routes/docs.ts).
 */

export interface DocFileNode {
  type: 'file';
  name: string;
  path: string;
  title: string;
}

export interface DocDirNode {
  type: 'dir';
  name: string;
  path: string;
  children: DocNode[];
  count: number;
}

export type DocNode = DocFileNode | DocDirNode;

export interface DocsMeta {
  repoName: string;
  repoPath: string;
  remoteUrl: string | null;
}

export interface DocIndexEntry {
  path: string;
  title: string;
  headings: string[];
  tags: string[];
  aliases: string[];
  text: string;
}

export interface DocContent {
  path: string;
  name: string;
  content: string;
  bytes: number;
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`/api/docs${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getDocsMeta(): Promise<DocsMeta | null> {
  return fetchJSON<DocsMeta>('/meta');
}

export async function getDocsTree(): Promise<{ roots: DocNode[]; rootsCount: number } | null> {
  return fetchJSON<{ roots: DocNode[]; rootsCount: number }>('/tree');
}

export async function getDocsIndex(): Promise<{ docs: DocIndexEntry[] } | null> {
  return fetchJSON<{ docs: DocIndexEntry[] }>('/index');
}

export async function getDocContent(path: string): Promise<DocContent | null> {
  const qs = encodeURIComponent(path);
  return fetchJSON<DocContent>(`/content?path=${qs}`);
}

export async function askAboutDoc(payload: {
  question: string;
  title?: string;
  content?: string;
  scope?: 'document' | 'selection' | 'entire-docs';
}): Promise<{ answer?: string; error?: string } | null> {
  try {
    const res = await fetch('/api/docs/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { error: err.error || res.statusText };
    }
    return await res.json();
  } catch (err: any) {
    return { error: err.message };
  }
}

// ─── Tree helpers ────────────────────────────────────────────

export interface DocFlatEntry {
  node: DocFileNode;
  depth: number;
  breadcrumb: string[];
}

/** Flatten a doc tree into a depth-ordered list of files (for prev/next + search navigation). */
export function flattenDocs(roots: DocNode[]): DocFlatEntry[] {
  const out: DocFlatEntry[] = [];
  const walk = (nodes: DocNode[], depth: number, crumb: string[]) => {
    for (const node of nodes) {
      if (node.type === 'file') {
        out.push({ node, depth, breadcrumb: [...crumb, node.title || node.name] });
      } else {
        walk(node.children, depth + 1, [...crumb, node.name]);
      }
    }
  };
  walk(roots, 0, []);
  return out;
}

export function findInTree(roots: DocNode[], target: string): { file: DocFileNode; ancestors: string[] } | null {
  const walk = (nodes: DocNode[], ancestors: string[]): { file: DocFileNode; ancestors: string[] } | null => {
    for (const node of nodes) {
      if (node.type === 'file') {
        if (node.path === target) return { file: node, ancestors };
      } else {
        const found = walk(node.children, [...ancestors, node.name]);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(roots, []);
}

export function isDirPath(path: string): boolean {
  return path.endsWith('/');
}

export function parentDir(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}
