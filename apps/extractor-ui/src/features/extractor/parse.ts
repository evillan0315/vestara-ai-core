/** Pure client-side artifact parsing. No network, no uploads. */

export interface TagCount {
  tag: string;
  count: number;
}

export interface ParsedArtifact {
  name: string;
  size: string;
  bytes: number;
  elements: number;
  lines: number;
  topTags: TagCount[];
  customProps: string[];
  original: string;
  cleaned: string;
  truncated: boolean;
}

/** Cap stored markup so a huge artifact cannot blow up React state. */
const MAX_STORE_CHARS = 200_000;

const STRIPPED_TAGS = 'script, style, noscript, template';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function store(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_STORE_CHARS) return { text, truncated: false };
  return { text: `${text.slice(0, MAX_STORE_CHARS)}\n…[truncated]`, truncated: true };
}

export function parseArtifact(text: string, name: string, bytes: number): ParsedArtifact {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const all = Array.from(doc.querySelectorAll('*'));
  const counts = new Map<string, number>();
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const topTags: TagCount[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));

  doc.querySelectorAll(STRIPPED_TAGS).forEach((el) => el.remove());
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
    }
  }
  const cleanedFull = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
  const found = new Set<string>();
  for (const match of cleanedFull.matchAll(/--[a-zA-Z0-9-_]+/g)) {
    found.add(match[0]);
    if (found.size >= 24) break;
  }

  const original = store(text);
  const cleaned = store(cleanedFull);

  return {
    name,
    size: formatBytes(bytes),
    bytes,
    elements: all.length,
    lines: text.split('\n').length,
    topTags,
    customProps: [...found].sort(),
    original: original.text,
    cleaned: cleaned.text,
    truncated: original.truncated || cleaned.truncated,
  };
}

export function buildImportSnippet(artifact: ParsedArtifact | null): string {
  if (!artifact) return '/* Drop an artifact to generate the import snippet. */';
  return [
    `// Extracted from ${artifact.name} — ${artifact.elements} elements, ${artifact.topTags.length} top tags`,
    `import artifact from './artifacts/${artifact.name}';`,
    `export const components = [${artifact.topTags.map((t) => `'${t.tag}'`).join(', ')}];`,
  ].join('\n');
}
