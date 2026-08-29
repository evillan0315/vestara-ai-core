# Agent Control — Slot-Bound Visibility Finding (investigation)

Discovered during Phase 1.1a live verification. Phase 1 completion is withheld
pending its disposition. This document classifies the behavior; no fix is
implemented.

## Observed behavior (reproduced live)

With the normal seeded workspace (all 16 role slots occupied by built-in
agents):

1. `POST /api/agents` succeeds (201) — the agent is **persisted**.
2. The Agent Control page does **not** render the new agent — it is
   **invisible**, with no error.
3. The agent is reachable via `GET /api/agents/:id` and the API catalog.
4. Only when a role slot was vacated (seed deleted) did a newly created agent
   with that role become visible — the green lifecycle ran under that modified
   precondition.

## Root-cause evidence (code)

- `apps/workspace/src/pages/Agents.tsx:144-151` — `allAgentSlots` maps the fixed
  `ALL_AGENT_SLOTS` (16 canonical roles) and replaces each slot with
  `agents.find((a) => a.role === slot.role)` — the **first agent per role**.
- `AgentStorage.listAgents()` orders by `created_at ASC` → the slot shows the
  **oldest** agent per role; later same-role agents are never displayed.
- `filteredAgents` (page search/filter) derives from `allAgentSlots` → search
  cannot surface a non-slot agent.
- An agent whose role is not among the 16 slots has **no slot at all** and is
  never displayed.
- The API and storage impose **no role uniqueness** — arbitrary roles and
  multiple agents per role are fully supported and persisted.

## Classification

**Accidental UI assumption / presentation-model mismatch — not an intentional
product constraint.**

- The data model (AgentStorage + API) is an open multi-agent catalog: roles are
  free-form and non-unique.
- The page's catalog view models **"16 canonical engineering role slots, one
  each"** (the `ALL_AGENT_SLOTS` grid, "Register" on empty slots), which assumes
  one configured agent per canonical role.
- `agents.find(...)` + `created_at ASC` silently collapses multiple same-role
  agents to the oldest — a UI presentation choice, not a data rule.
- Therefore creating a second agent for an occupied role (or any non-slot role)
  is legal and persisted but invisible. This is the same slot-collision the
  Phase 1 component test surfaced earlier.

## Disposition options (not implemented — for review)

- **A — catalog view**: render all agents (a real list), using role slots only
  as grouping. Matches the data model; larger UI change.
- **B — slot overflow**: keep the slot grid but show additional same-role
  agents (e.g., "+N more") and surface non-slot roles.
- **C — enforce one-per-role**: decide that Agent Control manages exactly the
  16 canonical roles; add role-uniqueness and reject creation of a second
  same-role agent. This makes the constraint intentional (requires a domain
  decision + API/storage change).

## Reviewer disposition (recorded; implementation NOT authorized yet)

- **Reject option C** (enforce one-per-role): that would alter the domain to
  accommodate an existing UI assumption, which is backwards unless product
  requirements explicitly change.
- **Favor option A — catalog view**: Agent Control should manage the actual
  agent catalog (all registered agents: search / filter / create / edit /
  delete).
- Keep the **role slot** model as a *secondary* concept if there is value in
  "which agent currently occupies the canonical Developer role" — but it must
  not be the only representation of all agents.

The recommended separation:

```
Agent Catalog          Role Assignment View
  ↓                        ↓
All registered agents   Canonical organizational slots
search/filter/crud      Developer → assigned agent
                        Reviewer → assigned agent
                        Observer  → assigned agent
```

Deeper modeling insight surfaced by the finding: **Identity ≠ Role.** An agent
is an identity/capability-bearing participant; a role is an organizational
position. Having "Developer Alpha / Beta / Gamma" and assigning one to
*current role: Developer* is valid; constraining the domain to one agent per
role is not.

**Status:** valid presentation/domain mismatch; direction chosen (catalog view
+ separate role assignment) but **pending a product/UX decision** before any
implementation. Phase 1 completion remains withheld until then.

## Verdict impact

```
Phase 1.1a migration proof          VERIFIED
Agent API CRUD                      VERIFIED
Historical workspace migration      VERIFIED
False-success regression            VERIFIED
Agent Control CRUD lifecycle        VERIFIED (under an available-slot condition)
Default seeded-workspace create visibility   FAILED / unresolved
Overall Phase 1                     NOT YET VERIFIED
```

Phase 1 remains open pending disposition of this finding (option A/B/C or
another decision).
