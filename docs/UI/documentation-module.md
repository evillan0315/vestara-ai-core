# Documentation Module

The Documentation module is a three-panel engineering knowledge base inside the
Workspace UI. It turns the repository's markdown into a browsable, searchable,
cross-linked documentation experience — the primary place for understanding the
project.

## Entrypoint

- Page: `apps/workspace/src/pages/Docs.tsx` → `apps/workspace/src/components/docs/DocPage.tsx`
- Route: `/docs` (document selection is driven by `?path=<repo-relative path>`)

## Architecture

```
apps/workspace/src/components/docs/
├── DocPage.tsx           Three-panel composition + scroll-spy/progress owner
├── DocsContext.tsx       Persistent state (localStorage, `vestara-docs-*` keys)
├── DocExplorer.tsx       Left: tree, tabs (browse/favorites/pinned/recents), search, resize
├── DocViewer.tsx         Center: toolbar, breadcrumbs, prev/next, selection, raw overlay
├── DocToc.tsx            Right: TOC + reading progress + related resources
├── DocSearch.tsx         Overlay search: ranking, snippets, keyboard nav
├── DocMarkdown.tsx       Rich renderer (callouts, mermaid, anchors, internal links)
├── DocCodeBlock.tsx      Code blocks: filename, copy, line numbers, diff, highlight
├── Mermaid.tsx           Lazy mermaid SVG renderer (theme-aware)
├── DocMetadata.tsx       Frontmatter header card
├── DocActions.tsx        Toolbar actions (favorite, pin, print, copy, raw, open source)
├── AskAi.tsx             Grounded Q&A over document / selection / whole docs
├── frontmatter.tsx       Parser + heading/slug/snippet utilities
└── (docs.css imported by DocPage)
```

Supporting client: `apps/workspace/src/lib/docs.ts`.

## Backend

`apps/api/src/routes/docs.ts` serves the repo's markdown to the module:

| Route | Purpose |
|-------|---------|
| `GET /api/docs/meta` | repo name, absolute path, detected git remote URL |
| `GET /api/docs/tree` | nested doc tree from known doc roots (incl. root `*.md` files) |
| `GET /api/docs/index` | search index: title, headings, tags, aliases, plain-text excerpt |
| `GET /api/docs/content?path=` | raw markdown for one document |
| `POST /api/docs/ask` | AI answer grounded in a document / selection / whole docs |

Security: all file reads resolve inside `ctx.repoPath` (traversal blocked) and are
restricted to markdown extensions.

## Content sources

Doc roots (top-level, case-insensitive): `docs/`, `Blueprint/`,
`Specifications/`, `Architecture/`, `API/`, `Workflow/`, `Agents/`, `Runtime/`,
`Development/`, `Deployment/`, `Planning/`, `Knowledge/`, `Research/`, plus
root-level `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, and
similar. `node_modules`, `dist`, `.git`, `.vestara`, `__tests__` are skipped.

## Conventions

- State persists under `vestara-docs-*` localStorage keys (expanded folders,
  favorites, pins, recents, reading history, panel widths, viewer settings).
- Document selection lives in the URL (`?path=`), so links are shareable and
  browser back/forward works.
- Markdown uses react-markdown + remark-gfm + rehype-highlight, with custom
  components for callouts (`> [!NOTE]`), Mermaid, code blocks, anchors, and
  internal `.md` navigation.
- Heading anchors are GitHub-style slugs (see `slugify`), shared between the
  TOC and rendered headings.
- Search runs client-side over the `/api/docs/index` payload with weighted
  ranking (title > alias/tag > heading > content).
- The module reuses the Workspace design tokens (`--vestara-*`, `--color-zinc-*`)
  and existing components (`ArtifactActionsMenu`, `useTheme`).
- Height follows the app convention `h-[calc(100vh-7rem)]` (see
  `TerminalWorkspace`).

## Frontmatter

Frontmatter drives the metadata card and cross-links:

```yaml
title: Getting Started
description: How to begin
status: active          # badge
version: 1.2            # badge
category: guides        # badge
author: Vestara Team
updated: 2026-07-30
tags: [architecture, runtime]
related: [./architecture.md, ./plans.md]
plans: pln-123          # matched against GET /api/plans
agents: agent-planner   # matched against GET /api/agents
specification: PCS-010
api: /api/health
```

## Related

- `apps/api/src/routes/docs.ts` — backend
- `apps/workspace/src/components/docs/` — module source
- `apps/workspace/src/lib/docs.ts` — client + tree helpers
