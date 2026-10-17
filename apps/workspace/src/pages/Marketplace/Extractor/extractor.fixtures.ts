/**
 * VESTARA Extractor — local fixture authority (Phase 1.1).
 *
 * Fallback reference content only. Used when no artifact has been parsed
 * yet, or when parsing yields zero components — always labelled as
 * reference examples, never as live extraction output (cf. Discover).
 *
 * Props/descriptions mirror the reference artifact's own demo metadata,
 * so the fallback already teaches the real library shape. The bundle is
 * self-contained (icons vendored via an inline factory), hence no
 * external dependencies.
 *
 * Data → API first → mock server → THESE fixtures. Never inline arrays
 * in JSX (UI-UX governance §6).
 */

import type { ExtractedComponent, ExtractedProp, ExtractorCategory } from './types.js';

export interface ExtractorFilter {
  readonly id: ExtractorCategory | 'all';
  readonly label: string;
}

export const EXTRACTOR_FILTERS: readonly ExtractorFilter[] = [
  { id: 'all', label: 'All' },
  { id: 'code', label: 'Code' },
  { id: 'docs', label: 'Docs' },
  { id: 'ui', label: 'UI' },
];

function stubSource(varName: string, name: string): ExtractedComponent['source'] {
  return {
    original: `var ${varName}=/* minified ${name} — drop artifact.html to see real output */`,
    clean: [
      `// ${name} — reference example (no artifact parsed yet).`,
      `// Drop artifact.html to replace with live extraction.`,
      `export interface ${name}Props {`,
      `  // Add props here`,
      `}`,
      ``,
      `export function ${name}(props: ${name}Props) {`,
      `  return null;`,
      `}`,
    ].join('\n'),
  };
}

function component(
  id: string,
  varName: string,
  name: string,
  description: string,
  category: ExtractorCategory,
  sizeKb: number,
  props: readonly ExtractedProp[],
): ExtractedComponent {
  return {
    id,
    varName,
    name,
    description,
    file: `${name}.tsx`,
    category,
    sizeKb,
    source: stubSource(varName, name),
    props,
    dependencies: [],
  };
}

function p(name: string, type: string, defaultValue: string, description: string): ExtractedProp {
  return { name, type, defaultValue, description };
}

/** 12 reference primitives the extractor dog-foods (artifact §§1–12). */
export const EXTRACTOR_COMPONENT_FIXTURES: readonly ExtractedComponent[] = [
  component('fileicon', 'qe', 'FileIcon', 'File-type glyph by category.', 'ui', 2.1, [
    p('category', 'FileCategory', 'other', 'code | docs | config | folder | data'),
    p('open', 'boolean', 'false', 'Only for the folder category'),
  ]),
  component('treenode', 'Sc', 'TreeNode', 'Collapsible file-tree row with depth indent.', 'ui', 3.4, [
    p('node', 'FileNode', '—', 'File/folder with children'),
    p('depth', 'number', '0', 'Indent level'),
    p('activePath', 'string', '—', 'Current selected path'),
    p('expandedPaths', 'Set<string>', '—', 'Expanded folder paths'),
  ]),
  component('filterchips', 'Fc', 'FilterChips', 'Category filter pill row.', 'ui', 1.4, [
    p('value', 'string', '—', 'Active chip'),
    p('options', 'string[]', '—', 'Chip labels'),
  ]),
  component('searchinput', 'Si', 'SearchInput', 'Filter query input with focus ring.', 'ui', 1.1, [
    p('value', 'string', '—', 'Controlled value'),
    p('placeholder', 'string', 'Search...', 'Placeholder text'),
  ]),
  component('tabbar', 'Ta', 'TabBar', 'VS Code-style open-file tabs with active dot and close.', 'ui', 2.8, [
    p('tabs', 'Tab[]', '—', 'Open tabs'),
    p('active', 'string', '—', 'Active path'),
    p('onActive', '(path) => void', '—', 'Select tab'),
    p('onClose', '(path) => void', '—', 'Close tab'),
  ]),
  component('breadcrumb', 'Bc', 'Breadcrumb', 'Path trail with highlighted segment.', 'ui', 1.9, [
    p('path', 'string', '—', 'Full file path'),
  ]),
  component('codeviewer', 'Cv', 'CodeViewer', 'Gutter plus tinted code view.', 'code', 4.6, [
    p('code', 'string', '—', 'File content'),
  ]),
  component('detailcard', 'Dc', 'DetailCard', 'Name, category, size, and path card.', 'docs', 2.2, [
    p('node', 'FileNode', '—', 'File to display'),
  ]),
  component('actiongrid', 'Ag', 'ActionGrid', 'Open, download, and copy actions.', 'ui', 1.7, [
    p('onAction', '(label: string) => void', '—', 'Triggered on click'),
  ]),
  component('proptable', 'Pt', 'PropTable', 'Prop, type, default, and description table.', 'docs', 2.5, [
    p('rows', 'PropRow[]', '—', 'Table rows'),
  ]),
  component('codeblock', 'Cb', 'CodeBlock', 'Snippet card with copy button.', 'code', 1.8, [
    p('code', 'string', '—', 'Code text'),
  ]),
  component('toast', 'To', 'Toast', 'Bottom feedback notification.', 'ui', 1.2, [
    p('message', 'string', '—', 'Text'),
    p('show', 'boolean', '—', 'Visible'),
  ]),
];

export const EXTRACTOR_MANIFEST_FIXTURE = `{
  "name": "vestara-artifact",
  "bundleKb": 342,
  "cssKb": 18,
  "componentCount": 12,
  "referenceArtifact": {
    "react": "18.3.1",
    "tailwind": "3.4.18",
    "demoSections": 44
  },
  "status": "reference-example"
}`;

export const EXTRACTOR_TOKENS_FIXTURE = [
  '/* Reference tokens — replace by dropping artifact.html. All values resolve to var(--vestara-*). */',
  ':root {',
  '  --vestara-surface-canvas: var(--vestara-surface-canvas);',
  '  --vestara-surface-panel: var(--vestara-surface-panel);',
  '  --vestara-border-subtle: var(--vestara-border-subtle);',
  '  --vestara-accent: var(--vestara-accent);',
  '}',
].join('\n');
