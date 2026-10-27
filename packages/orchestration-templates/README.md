# Orchestration Templates

Installable distribution of the orchestration project-creation catalog
(`ORCHESTRATION_TEMPLATES` in `@vestara/workflow-orchestrator`) — the same
presets the Orchestration surface serves at `GET /api/orchestration/templates`.

## Templates

- **Feature Delivery** — plan, build, verify, and review a scoped feature.
- **Agent Control Restructure** — decompose the Agent Control page into
  focused, testable sub-components without changing behavior.
- **Activity Room Premium Redesign** — redesign the Activity Room toward the
  premium operations-room contract while preserving protected behaviors.
- **Marketplace Monorepo Build Matrix** — build every app and package in
  `apps/` and `packages/` in dependency order, then verify. Its executable
  runner lives in the `vestara.monorepo-build-matrix` asset
  (`monorepo-build-matrix.sh --build`); this pack carries the same plan as a
  reviewable task wave.

Each template is a `workflows/<id>.workflow.json` file with the template
`goal` plus its task rows (`summary`, `files`, `requiredCapabilities`).

## Use

This is a metadata-only asset: installing registers the catalog locally
without activating a runtime. Start a template from the Orchestration
surface, or via the API:

```bash
curl -H "Authorization: Bearer $VESTARA_TOKEN" \
  -H Content-Type:application/json \
  -d '{"templateId": "feature-delivery"}' \
  http://127.0.0.1:3001/api/orchestration/projects
```

## Regenerating

The workflow files are generated from the TypeScript source of truth — never
hand-edit them:

```bash
node scripts/generate-orchestration-template-pack.mjs
```
