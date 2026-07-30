import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AdrDocument, AdrFrontmatter } from './types.js';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

function trimQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, '');
}

function parseYamlBlock(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yaml.split('\n');

  let currentKey: string | null = null;
  let listAccum: any[] = [];
  let nestedObj: Record<string, string> | null = null;
  let nestedIndent = 0;

  function flushList() {
    if (currentKey) {
      if (nestedObj) {
        listAccum.push({ ...nestedObj });
        nestedObj = null;
      }
      if (listAccum.length > 0) {
        result[currentKey] = listAccum;
      }
      listAccum = [];
    }
  }

  for (const raw of lines) {
    const line = raw;
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    // Top-level key: value
    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (topMatch && !line.startsWith(' ')) {
      flushList();
      currentKey = topMatch[1];
      const val = topMatch[2].trim();
      if (val === '[]') {
        result[currentKey] = [];
        currentKey = null;
      } else if (val === '') {
        listAccum = [];
        nestedObj = null;
        nestedIndent = 0;
      } else if (val.startsWith('[')) {
        result[currentKey] = val.slice(1, -1).split(',').map((s) => trimQuotes(s.trim()));
        currentKey = null;
      } else {
        result[currentKey] = trimQuotes(val);
        currentKey = null;
      }
      continue;
    }

    if (!currentKey) continue;

    // Line starting with dash — list item
    const listMatch = line.match(/^(\s*)- \s*(.*)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const itemText = listMatch[2].trim();

      if (indent > nestedIndent && nestedObj) {
        listAccum.push({ ...nestedObj });
        nestedObj = {};
      } else if (nestedObj && indent <= nestedIndent) {
        listAccum.push({ ...nestedObj });
        nestedObj = null;
      }

      nestedIndent = indent;
      const kv = itemText.match(/^(\w+):\s*(.*)$/);
      if (kv) {
        nestedObj = nestedObj ?? {};
        nestedObj[kv[1]] = trimQuotes(kv[2]);
      } else {
        nestedObj = null;
        listAccum.push(trimQuotes(itemText));
      }
      continue;
    }

    // Indented continuation of a nested object (property without dash)
    const propMatch = line.match(/^(\s+)(\w+):\s*(.*)$/);
    if (propMatch && nestedObj) {
      nestedObj[propMatch[2]] = trimQuotes(propMatch[3].trim());
    }
  }

  flushList();
  return result;
}

export function parseFrontmatter(raw: string): AdrFrontmatter | null {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return null;

  const yaml = match[1];
  const parsed = parseYamlBlock(yaml);

  const dependsOnRaw = parsed['depends_on'] ?? [];
  const dependsOn = Array.isArray(dependsOnRaw)
    ? dependsOnRaw.map((d: any) =>
        typeof d === 'string' ? { id: d, relationship: undefined } : { id: d.id, relationship: d.relationship }
      )
    : [];

  const referencedByRaw = parsed['referenced_by'] ?? [];
  const referencedBy = Array.isArray(referencedByRaw)
    ? referencedByRaw.map((r: any) =>
        typeof r === 'string' ? { type: 'blueprint' as const, target: r } : { type: r.type ?? 'blueprint', target: r.target }
      )
    : [];

  return {
    id: String(parsed['id'] ?? ''),
    adr: String(parsed['adr'] ?? ''),
    title: String(parsed['title'] ?? ''),
    category: String(parsed['category'] ?? ''),
    version: Number(parsed['version'] ?? 0),
    date: String(parsed['date'] ?? ''),
    status: String(parsed['status'] ?? ''),
    author: String(parsed['author'] ?? ''),
    deciders: Array.isArray(parsed['deciders']) ? parsed['deciders'] : [],
    consulted: Array.isArray(parsed['consulted']) ? parsed['consulted'] : [],
    informed: Array.isArray(parsed['informed']) ? parsed['informed'] : [],
    tags: Array.isArray(parsed['tags']) ? parsed['tags'] : [],
    depends_on: dependsOn,
    referenced_by: referencedBy,
    influences: Array.isArray(parsed['influences']) ? parsed['influences'] : [],
  };
}

export function parseAdrFile(filePath: string): AdrDocument | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const frontmatter = parseFrontmatter(raw);
    if (!frontmatter) return null;
    return { frontmatter, filePath, raw };
  } catch {
    return null;
  }
}

const ADR_FILENAME_RE = /^ADR-\d+.*\.md$/;

export function findAdrFiles(adrDir: string): string[] {
  if (!fs.existsSync(adrDir)) return [];
  return fs
    .readdirSync(adrDir)
    .filter((f) => ADR_FILENAME_RE.test(f))
    .map((f) => path.join(adrDir, f));
}

export function loadAllAdrs(adrDir: string): AdrDocument[] {
  const files = findAdrFiles(adrDir);
  const docs: AdrDocument[] = [];
  for (const file of files) {
    const doc = parseAdrFile(file);
    if (doc) docs.push(doc);
  }
  return docs;
}
