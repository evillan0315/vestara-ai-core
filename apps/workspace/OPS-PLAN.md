# Ops Center — Implementation Plan

## Architecture

```
@vestara/telemetry (server)
        │
        ▼
EventBus → WebSocket
                │
                ▼
TelemetryStore (client, React context)
        │
        ├── useTelemetryStore() → agent states
        ├── useTelemetryStore() → recent events
        └── useTelemetryStore() → session timeline
                │
      ┌─────────┼──────────┐
      ▼         ▼          ▼
  AgentCards  Timeline   Pipeline
```

The store is a single React context. Components consume projections, not raw events.

## Data model

```ts
interface TelemetryEvent {
  id: string; agent: string; timestamp: string;
  operation: string; status: string;
  task: string; filePath?: string;
  progress: number; phase: string;
  detail: string; severity: 'info' | 'warning' | 'error';
  sessionId?: string;
}

interface AgentState {
  id: string; name: string; status: AgentStatus;
  currentTask: string; currentOperation: string;
  activeFilePath?: string; progress: number;
  elapsedMs: number; phase: string;
  detail: string; updatedAt: string;
}
```

## Phases

### Phase 0 — TelemetryStore (React context + hook)

- `src/contexts/TelemetryContext.tsx` — provider wrapping the store
- `src/hooks/useTelemetryStore.ts` — selector hook (returns agent states, events, helpers)
- Wires into `workspaceSocket.onEvent`, filters for `agent.*` types
- Maps incoming events into a `Map<agentId, AgentState>` and an event log

### Phase 1 — Live Agent Cards

- `src/components/ops/AgentTelemetryCard.tsx` — card per agent with animated status icon, current file, progress bar, elapsed time, phase label
- `src/pages/OpsCenter.tsx` — replace static OpsRightSidebar with grid of live cards

### Phase 2 — Agent Timeline

- `src/components/ops/AgentTimeline.tsx` — chronological feed grouped by minute, one row per event
- `src/pages/OpsCenter.tsx` — add Timeline tab alongside Activity/Executions

### Phase 3 — Pipeline driven by AIDL

- `src/components/ops/PipelineAIDL.tsx` — maps agent phases to AIDL stages (Discovery → Understanding → Planning → Implementation → Review → Verification → Knowledge Capture)
- Replaces the current generic PipelinePanel

### Phase 4 — Agent Detail Drawer

- `src/components/ops/AgentDetailDrawer.tsx` — slide-over panel with full event history, grouped by operation type, expandable
- Shows session, duration, files touched, verification status, approval status

### Phase 5 — Group Chat (future)

- A new route `/ops/chat` subscribes to the same TelemetryStore
- Renders only `communication`-type events as a chat-like interface
- Proves the store abstraction: one event stream, multiple projections

## API endpoints

| Endpoint | Returns |
|----------|---------|
| `GET /api/telemetry` | Full snapshot |
| `GET /api/telemetry/agents` | Per-agent state |
| `GET /api/telemetry/events` | Recent event log |
| `GET /api/telemetry/timeline` | Events grouped by minute |
