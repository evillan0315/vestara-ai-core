// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCodeMeta } from '../src/components/docs/DocCodeBlock';
import { resolveDocPath } from '../src/components/docs/DocMarkdown';
import {
  extractHeadings,
  highlightText,
  metaList,
  metaString,
  parseFrontmatter,
  slugify,
  stripMarkdown,
} from '../src/components/docs/frontmatter';
import { flattenDocs } from '../src/lib/docs';
import { documentationApi } from '../src/lib/documentation';

afterEach(() => vi.unstubAllGlobals());

describe('frontmatter', () => {
  it('parses scalar fields', () => {
    const md = `---\ntitle: "Getting Started"\ndescription: How to begin\nstatus: active\nversion: 1.2\n---\n# Body`;
    const { meta, body } = parseFrontmatter(md);
    expect(metaString(meta, 'title')).toBe('Getting Started');
    expect(metaString(meta, 'description')).toBe('How to begin');
    expect(metaString(meta, 'status')).toBe('active');
    expect(body.trim()).toBe('# Body');
  });

  it('parses list fields as arrays', () => {
    const md = '---\ntags: [architecture, runtime, core]\nagents: agent-planner, agent-reviewer\n---\n';
    const { meta } = parseFrontmatter(md);
    expect(metaList(meta, 'tags')).toEqual(['architecture', 'runtime', 'core']);
    expect(metaList(meta, 'agents')).toContain('agent-planner');
  });

  it('returns empty meta when no frontmatter exists', () => {
    const { meta, body } = parseFrontmatter('# Just a heading');
    expect(meta).toEqual({});
    expect(body).toBe('# Just a heading');
  });
});

describe('slugify', () => {
  it('produces GitHub-style slugs', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('  Spaces  &  More ')).toBe('spaces-more');
    expect(slugify('TypeScript (v5)')).toBe('typescript-v5');
  });
});

describe('extractHeadings', () => {
  it('extracts nested headings with depth', () => {
    const { headings } = { headings: extractHeadings('# One\n\n## Two\n\n### Three') };
    expect(headings).toHaveLength(3);
    expect(headings[0]).toMatchObject({ depth: 1, text: 'One', slug: 'one' });
    expect(headings[1]).toMatchObject({ depth: 2, text: 'Two', slug: 'two' });
  });

  it('ignores headings inside code fences', () => {
    const md = '# Real\n\n```ts\n# Fake heading\n```\n\n## Also real';
    const { headings } = { headings: extractHeadings(md) };
    expect(headings.map((h) => h.text)).toEqual(['Real', 'Also real']);
  });

  it('dedupes repeated heading slugs', () => {
    const { headings } = { headings: extractHeadings('# Install\n\n# Install') };
    expect(headings[0].slug).toBe('install');
    expect(headings[1].slug).toBe('install-1');
  });

  it('ignores the title inside frontmatter', () => {
    const md = '---\ntitle: Not a heading\n---\n# The real heading';
    const { headings } = { headings: extractHeadings(md) };
    expect(headings.map((h) => h.text)).toEqual(['The real heading']);
  });
});

describe('stripMarkdown', () => {
  it('removes markdown syntax but keeps text', () => {
    expect(stripMarkdown('# Heading\n\nSome **bold** and [link](http://x) text')).toBe(
      'Heading Some bold and link text',
    );
  });
});

describe('highlightText', () => {
  it('wraps matching terms in mark elements', () => {
    const out = highlightText('runtime package', 'run');
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveProperty('type', 'mark');
  });

  it('returns plain text when query is empty', () => {
    expect(highlightText('plain', '')).toEqual(['plain']);
  });
});

describe('parseCodeMeta', () => {
  it('extracts a filename and line ranges', () => {
    const meta = parseCodeMeta('title=src/index.ts {1,3-5}');
    expect(meta.filename).toBe('src/index.ts');
    expect(meta.highlight).toEqual(new Set([1, 3, 4, 5]));
  });

  it('returns empty when no meta', () => {
    const meta = parseCodeMeta(undefined);
    expect(meta.filename).toBeUndefined();
    expect(meta.highlight).toBeUndefined();
  });
});

describe('resolveDocPath', () => {
  it('resolves relative links against the current document directory', () => {
    expect(resolveDocPath('docs/getting-started.md', './architecture.md')).toBe('docs/architecture.md');
    expect(resolveDocPath('docs/guides/start.md', '../index.md')).toBe('docs/index.md');
  });

  it('treats leading-slash links as repo-absolute', () => {
    expect(resolveDocPath('docs/guides/start.md', '/docs/architecture.md')).toBe('docs/architecture.md');
  });
});

describe('flattenDocs', () => {
  it('flattens nested trees in document order with breadcrumbs', () => {
    const roots = [
      {
        type: 'dir' as const,
        name: 'docs',
        path: 'docs',
        count: 2,
        children: [
          {
            type: 'dir' as const,
            name: 'guides',
            path: 'docs/guides',
            count: 1,
            children: [{ type: 'file' as const, name: 'start.md', path: 'docs/guides/start.md', title: 'Start' }],
          },
          { type: 'file' as const, name: 'index.md', path: 'docs/index.md', title: 'Index' },
        ],
      },
      { type: 'file' as const, name: 'README.md', path: 'README.md', title: 'Readme' },
    ];
    const flat = flattenDocs(roots);
    expect(flat.map((f) => f.node.path)).toEqual(['docs/guides/start.md', 'docs/index.md', 'README.md']);
    expect(flat[0].breadcrumb).toEqual(['docs', 'guides', 'Start']);
  });
});

describe('documentation review API', () => {
  it('creates review plans from selected findings', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'doc-plan-1', tasks: [], status: 'ready' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await documentationApi.createPlan(['finding-1']);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/documentation/plans',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ findingIds: ['finding-1'] }) }),
    );
  });

  it('sends explicit proposal decisions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'proposal-1' }) });
    vi.stubGlobal('fetch', fetchMock);
    await documentationApi.proposalAction('proposal-1', 'approve');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/documentation/proposals/proposal-1/approve',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
