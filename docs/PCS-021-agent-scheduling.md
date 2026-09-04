---
title: PCS-021 — Agent Scheduling
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-021 — Agent Scheduling

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-021 |
| Name | Agent Scheduling |
| Command | `POST /api/schedules`, `POST /api/schedules/run-due` |
| Version | 1.0 |
| Status | Implemented (v4.4) |

---

## Goal

Enable automated agent execution through configurable schedules. Agents can run on hourly, daily, weekly, or one-time schedules without manual invocation, enabling automated maintenance tasks like daily architecture analysis, hourly test runs, or weekly documentation generation.

---

## Schedule Model

```typescript
type ScheduleFrequency = 'once' | 'hourly' | 'daily' | 'weekly' | 'custom';

interface AgentSchedule {
  id: string;
  agentId: string;
  task: string;
  frequency: ScheduleFrequency;
  cronExpression?: string;
  nextRunAt: string;
  lastRunAt?: string;
  lastStatus?: string;
  enabled: boolean;
  createdAt: string;
}
```

### Frequency Behaviors

| Frequency | Next Run Calculation |
|-----------|---------------------|
| `once` | No repeat — runs once at `nextRunAt` |
| `hourly` | `nextRunAt + 1 hour` |
| `daily` | `nextRunAt + 24 hours` |
| `weekly` | `nextRunAt + 7 days` |
| `custom` | Uses `cronExpression` for custom scheduling |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/schedules` | List all schedules + currently due schedules |
| `POST` | `/api/schedules` | Create a new schedule |
| `DELETE` | `/api/schedules/:id` | Delete a schedule |
| `POST` | `/api/schedules/run-due` | Execute all due schedules immediately |

### Create Schedule

```json
POST /api/schedules
{
  "agentId": "agent-architect",
  "task": "Daily architecture analysis",
  "frequency": "daily"
}
```

### Run Due Schedules

```json
POST /api/schedules/run-due
// Returns:
{
  "ran": 2,
  "results": [
    { "scheduleId": "sched-123", "status": "completed" },
    { "scheduleId": "sched-456", "status": "failed", "error": "Agent not found" }
  ]
}
```

---

## Storage

SQLite `agent_schedules` table:
- `id TEXT PRIMARY KEY`
- `agent_id TEXT NOT NULL`
- `task TEXT NOT NULL`
- `frequency TEXT DEFAULT 'once'`
- `cron_expression TEXT DEFAULT ''`
- `next_run_at TEXT` — when the schedule should next execute
- `last_run_at TEXT` — when it last executed
- `last_status TEXT DEFAULT ''` — result of last execution
- `enabled INTEGER DEFAULT 1` — whether the schedule is active
- `created_at TEXT`

Indexed on `agent_id` and `next_run_at` for efficient due-schedule queries.

---

## Execution Flow

1. `POST /api/schedules/run-due` queries `agent_schedules WHERE enabled=1 AND next_run_at <= now`
2. For each due schedule, calls `agentRuntime.run(agentId, task, session)`
3. Updates `last_run_at`, `last_status`, and `next_run_at` (based on frequency)
4. Returns results array with status per schedule

---

## Dashboard Integration

The Dashboard's "Scheduled Tasks" section shows:
- Upcoming schedules with agent name, task, frequency, next run date
- Due schedules highlighted with amber pulsing indicator and "Due" badge
- Status dot: green (enabled), amber pulsing (due), gray (disabled)
- Live updates via dashboard refresh

---

## Success Criteria

1. Schedule can be created with any frequency
2. `run-due` executes only due schedules
3. Failed executions are recorded with error message
4. Completed executions update next run time
5. Dashboard displays upcoming and due schedules correctly
6. Schedules can be enabled/disabled
7. Deleting a schedule removes it from the queue
