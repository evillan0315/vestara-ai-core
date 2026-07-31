# Engineering Graph — Architecture

The Engineering Graph is the canonical relationship engine of the Workspace.
Every engineering object — projects, plans, tasks, agents, executions,
artifacts, reviews, verifications, files, packages, documentation, capabilities,
and runtime events — is a graph node with a stable identity. Relationships
between them are the single source of truth for navigation, traceability,
impact analysis, and AI context assembly. Modules present graph views; they no
longer own relationship logic.

```
packages/engineering-graph/          Platform service (zero dependencies)
└── src/
    ├── ids.ts                       Universal entity ids (kind://id)
    ├── types.ts                     Kinds, relationship types, sources, DTOs
    ├── graph.ts                     EngineeringGraph store (adjacency + search + insights + health)
    └── registry.ts                  EntityRegistry (sources → graph hydration)

apps/api/
├── src/graph/service.ts             EngineeringGraphService (wires workspace services as sources)
└── src/routes/graph.ts              /api/graph/* endpoints

apps/workspace/src/
├── lib/graph.ts                     Typed client + layout helpers
└── components/graph/                GraphContext, Inspector, RelationshipExplorer, GraphSearch, GraphPage
```

## Universal entity ids

Every entity is addressed as `kind://id`, e.g. `plan://P-24`, `task://P-24:T-15`,
`agent://developer`, `artifact://changeset/42`, `file://packages/runtime/src/index.ts`,
`doc://Architecture/Runtime.md`. `parseEntityId` round-trips them; clients
URL-encode the full id in query strings.

## Relationship types

A fixed catalog lives in `types.ts` / `RELATIONSHIP_TYPES`: `implements`,
`references`, `contains`, `depends-on`, `creates`, `updates`, `deletes`,
`reviews`, `tests`, `verifies`, `approves`, `owns`, `executes`, `observes`,
`documents`, `links-to`, `imports`, `exports`, `calls`, `publishes`,
`subscribes`, `belongs-to`, `generated-by`, `uses-capability`, `touches-file`,
`produced-artifact`, `caused`, `triggered`, `resolved`, `related`.

## EngineeringGraph store

Pure in-memory directed adjacency store (`graph.ts`):

- `addEntity` / `getEntity` / `entitiesByKind` / `removeEntity`
- `addRelationship` (dedupes by from/to/type) with forward + backlink indexes
- `relationships` / `outRelationships` / `inRelationships` (backlinks)
- `dependencies` / `dependents` (transitive closures) / `shortestPath` (BFS)
- `subgraph(center, depth)` for exploration
- `search(query, { kind, fields })` with weighted ranking
- `insights()` — orphans, dead plans, unverified artifacts, hot files, circular
  dependency detection (DFS)
- `health()` — completeness, orphan ratio, documentation/verification coverage,
  dependency health, check list

## EntityRegistry

Modules register `EntitySource`s (nodes) and `RelationshipSource`s (edges).
`refresh()` clears and rehydrates the graph, dropping edges that reference
unregistered entities. The registry owns hydration; no module owns
relationships.

## Backend service (`apps/api/src/graph/service.ts`)

Wires the live workspace services into the graph:

| Source | Produces |
|--------|----------|
| repository | `repository://<name>` root node |
| projects | `project://<id>` |
| plans + tasks | `plan://<id>`, `task://<plan>:<task>` |
| agents | `agent://<id>` (live telemetry status) |
| executions / sessions | `execution://<id>`, `session://<id>` |
| artifacts | `artifact://changeset/<id>`, `verification://<id>`, `review://<id>` |
| documents | `document://<path>` (reuses `buildDocTree`) |
| files / packages | `file://<path>`, `package://<name>` (derived from path) |
| capabilities | `capability://<agent>/<op>` (telemetry) |
| events | `event://…` (telemetry, bounded) |

Relationships include: repository owns plan, plan contains task, task
depends-on task, task/changeSet/capability touches-file, file belongs-to
package, session references plan + executes agent, agent executes execution,
changeSet produced by plan, verification verifies changeSet, review reviews
changeSet, document documents repository, agent caused event.

The built graph is cached with a 15s TTL; `timelineFor(entity)` correlates
telemetry + session timelines by actor/connected/mentions.

## Backend routes (`apps/api/src/routes/graph.ts`)

`stats`, `entities`, `entity/:id`, `relationships`, `backlinks`, `search`,
`explore`, `dependencies`, `dependents`, `trace`, `timeline`, `insights`,
`health`, and `POST analyze` (AI with graph context).

## Frontend

- `GraphContext` is mounted once in `ShellLayout`, so the Universal Inspector
  and global graph search work on every page. Any module opens the inspector
  via `useGraph().openInspector(id)` or the `vestara:inspect` custom event
  (`inspectEntity(id)` helper).
- `Inspector` — tabs: Overview, Relationships, Timeline, Documentation,
  Execution, Artifacts, History, Actions.
- `RelationshipExplorer` — pure-SVG radial layout (BFS depth from center) with
  pan/zoom, kind-colored nodes, click-to-inspect.
- `GraphSearch` — global overlay searching all entities.
- Cross-module integration: docs (Open in Graph), execution sessions/agents,
  diagnostics health checks all deep-link into the inspector.

## Performance & extensibility

- O(k) backlink/dependency lookups via dual adjacency indexes.
- Bounded relationship lists and subgraphs; transitive closures capped by depth.
- New node kinds are added to `ENTITY_KINDS`/`RELATIONSHIP_TYPES` and a source;
  the UI renders any kind via the kind-color map with a generic fallback.

## EngineeringEventStore — the temporal layer

The graph is **event-sourced**, not snapshot-based. Every hydration diffs the
previous state against the new state and appends the resulting domain events
to an append-only log (`events.ts`):

```
entity-created / entity-updated / entity-deleted
relationship-added / relationship-removed
```

- Each event carries a monotonic `seq`, an ISO timestamp, the affected ids,
  and (for creates/updates) the full entity or field patch.
- `stateAt(time)` reconstructs any point in time by replaying the log from the
  nearest **checkpoint** (created automatically every `checkpointEvery` events)
  or from the beginning. Checkpoints are bounded (`maxCheckpoints`).
- `history(id)` returns the chronological events involving one entity.
- `diff(from, to)` returns a structural diff between two points in time
  (added/updated/removed entities and relationships).
- `executeGraphQuery(graph, query)` runs a bounded walk
  (`start`, `direction`, `relationships[]`, `depth`, `kind`) — optionally
  against a past state via `stateAt`.

The service (`apps/api/src/graph/service.ts`) hydrates through this store, so
the event log is the source of truth and every graph state is derived. Temporal
APIs: `/api/graph/events`, `/history`, `/at?time=`, `/diff?from=&to=`,
`/replay`, `/store`, and `POST /api/graph/query`.

## Testing

- `packages/engineering-graph/__tests__/graph.test.ts` — ids, store, search,
  backlinks, shortest path, cycles, orphans, registry hydration.
- `packages/engineering-graph/__tests__/events.test.ts` — diff generation,
  replay/state-at reconstruction, checkpoints, entity deletion, history,
  temporal diffs, and graph queries (including temporal + kind-filtered walks).
- `apps/api/__tests__/graph-service.test.ts` — service hydration against the
  real repo (documents + repository), search, health, relationships.
