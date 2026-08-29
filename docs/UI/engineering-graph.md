# Engineering Graph — Workspace UI

The Engineering Graph page (`/graph`) is the canonical navigation layer of the
Workspace. It answers "how is everything connected?" and ties the Documentation
Center (how it works), Diagnostic Center (what's happening), and Execution
Center (what agents are doing) into one graph.

## Entrypoints

- Page: `apps/workspace/src/pages/Graph.tsx` → `apps/workspace/src/components/graph/GraphPage.tsx`
- Route: `/graph` (nav: Workspace → Engineering Graph)
- Global: the **Universal Inspector** and **graph search** are mounted in
  `ShellLayout`, so they are available on every page.

## Universal Inspector

Wherever the user clicks an entity — a plan, task, agent, file, artifact,
specification, execution, or diagnostic — the same inspector opens (right
drawer). Tabs:

- **Overview** — kind, status, owner, metadata, trace origin, produced items
- **Relationships** — outgoing/incoming with type filter; click any related
  entity to jump to its inspector (no dead ends)
- **Timeline** — correlated runtime events for the entity
- **Documentation** — linked documents (open in the Docs page)
- **Execution** — linked sessions / executions / agents
- **Artifacts** — linked change sets, verifications, reviews
- **History** — backlinks ("referenced by")
- **Actions** — open in the originating module, open in the explorer, copy id

## Relationship Explorer

Interactive graph of the subgraph around a center entity (defaults to the
repository). Pan by dragging, zoom with the wheel, click a node to inspect it.
Node color encodes kind (legend in the corner). Change center via the chips or
an entity id input.

## Global graph search

Press the search button (or `/` on the graph page) to search every entity by
name, id, tags, status, and owner. Selecting a result opens its inspector.

## Engineering insights & health

- **Insights** — automatically discovered: orphaned entities, dead plans,
  unverified artifacts, hot files, circular task dependencies.
- **Health** — graph completeness, orphan ratio, documentation coverage,
  verification coverage, task health, dependency health (cycle-free).

## Impact analysis

From any center entity, "Impact analysis" lists its transitive dependencies and
dependents — e.g. "everything affected by this plan" or "everything this file
touches".

## Cross-module navigation

- **Docs** → action menu → *Open in Engineering Graph* opens `document://<path>`.
- **Execution** → session rows expose *graph*, agent cards open `agent://<id>`.
- **Diagnostics** → health check rows open `diagnostic://health/<id>`.
- Any code path can dispatch `window.dispatchEvent(new CustomEvent('vestara:inspect', { detail: '<kind>://<id>' }))` or use the `inspectEntity` helper.

## AI analysis

The graph page provides relationship-aware analysis: ask "why is this task
blocked?", "find everything affected by this plan", or "explain this
dependency graph". The backend assembles the entity's relationships, backlinks,
timeline, insights, and graph stats into the prompt context.

## Temporal — Engineering Event Store

The graph keeps an append-only event log of every state change
(`entity-created/updated/deleted`, `relationship-added/removed`). The Graph
page exposes:

- **Reconstruct at time** — rebuild the graph exactly as it was at any
  timestamp (`/api/graph/at`).
- **Diff between** — structural diff between two points in time
  (`/api/graph/diff`).
- **Event feed** — the latest domain events (`/api/graph/events`).
- **Entity event log** — the Inspector's Timeline tab shows the stored history
  for the selected entity (seq, type, timestamp).

This makes the graph a model of *how the workspace evolved*, not just its
current state — the foundation for replay, historical analysis, and
"what changed between two executions" questions.

## Persistence & performance

- Subgraphs are requested on demand (`/api/graph/explore?center=&depth=`); the
  backend caches the built graph for 15s and appends the diff to the event
  store on each rebuild.
- Temporal queries reconstruct from the nearest checkpoint (auto-created every
  `checkpointEvery` events) plus incremental replay.
- Relationship lists and closures are bounded; the explorer renders a
  depth-limited radial layout.

## Related

- Architecture: `docs/Architecture/Engineering-Graph.md`
- Backend: `apps/api/src/routes/graph.ts`, `apps/api/src/graph/service.ts`
- Platform package: `packages/engineering-graph/`
- UI: `apps/workspace/src/components/graph/`, `src/lib/graph.ts`
