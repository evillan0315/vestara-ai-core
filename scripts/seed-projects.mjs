#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const dbPath = path.resolve('.vestara/plans/plans.db');
if (!fs.existsSync(dbPath)) {
  console.error('DB not found:', dbPath);
  process.exit(1);
}

const initSqlJs = (await import('sql.js')).default;

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sqlJsDir = path.dirname(require.resolve('sql.js'));
const SQL = await initSqlJs({ locateFile: (f) => path.join(sqlJsDir, f) });
const buf = fs.readFileSync(dbPath);
const db = new SQL.Database(buf);

function exec(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  stmt.step();
  stmt.free();
}
function all(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// Clear existing demo data
exec(`DELETE FROM tasks`);
exec(`DELETE FROM sprints`);
exec(`DELETE FROM projects`);

const _now = new Date().toISOString();

// Helper to insert project
function insertProject({ id, name, description, status, priority, tags, createdAt }) {
  exec(
    `INSERT INTO projects (id, name, description, status, priority, lead_agent_id, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, description, status, priority, '', JSON.stringify(tags), createdAt, createdAt],
  );
}

function insertTask({ id, projectId, title, description, status, priority, createdAt }) {
  exec(
    `INSERT INTO tasks (id, project_id, sprint_id, title, description, status, priority, assignee_agent_id, depends_on, labels, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      projectId,
      '',
      title,
      description,
      status,
      priority,
      '',
      JSON.stringify([]),
      JSON.stringify([]),
      createdAt,
      createdAt,
    ],
  );
}

const projects = [
  {
    id: 'proj-vestara-ui',
    name: 'Vestara Workspace UI Revamp',
    description: 'Premium marketplace design system, hero consolidation, and shell layout unification.',
    status: 'active',
    priority: 'high',
    tags: ['ui', 'workspace', 'premium'],
    createdAt: '2026-08-20T10:00:00.000Z',
  },
  {
    id: 'proj-harness',
    name: 'Agent Harness Hardening',
    description: 'Durable single-turn execution loop, tool-result projection, and retry budgets.',
    status: 'active',
    priority: 'critical',
    tags: ['harness', 'reliability'],
    createdAt: '2026-08-18T09:00:00.000Z',
  },
  {
    id: 'proj-marketplace',
    name: 'Marketplace Gallery Polish',
    description: 'Luxury gallery materials, asset detail polish, and Publish flow hardening.',
    status: 'planning',
    priority: 'medium',
    tags: ['marketplace', 'gallery'],
    createdAt: '2026-09-01T12:00:00.000Z',
  },
  {
    id: 'proj-docs',
    name: 'Documentation Automation',
    description: 'Baseline drift gate, evidence ingestion, and CLI status implementation plan.',
    status: 'active',
    priority: 'medium',
    tags: ['docs', 'automation'],
    createdAt: '2026-08-25T14:00:00.000Z',
  },
  {
    id: 'proj-migration',
    name: 'Legacy API Migration',
    description: 'Migrate deprecated /api/ops to governed execution center with backward compat.',
    status: 'on_hold',
    priority: 'high',
    tags: ['api', 'migration'],
    createdAt: '2026-07-15T08:00:00.000Z',
  },
];

for (const p of projects) insertProject(p);

// Tasks per project — varied to make dashboard meaningful
const tasks = [
  // UI Revamp — 7 tasks (3 done, 2 in_progress, 2 backlog)
  { projectId: 'proj-vestara-ui', title: 'Consolidate PageHero across shell routes', status: 'done', priority: 'high' },
  {
    projectId: 'proj-vestara-ui',
    title: 'Remove duplicate Global Assistant header',
    status: 'done',
    priority: 'medium',
  },
  {
    projectId: 'proj-vestara-ui',
    title: 'Square premium agent cards (aspect-square)',
    status: 'done',
    priority: 'medium',
  },
  { projectId: 'proj-vestara-ui', title: 'Files dashboard after hero', status: 'in_progress', priority: 'high' },
  { projectId: 'proj-vestara-ui', title: 'Projects dashboard after hero', status: 'in_progress', priority: 'high' },
  { projectId: 'proj-vestara-ui', title: 'Execution center toolbar cleanup', status: 'backlog', priority: 'medium' },
  { projectId: 'proj-vestara-ui', title: 'Settings premium pass (VES-DESIGN-007)', status: 'backlog', priority: 'low' },

  // Harness — 6 tasks (2 done, 1 review, 2 in_progress, 1 backlog)
  {
    projectId: 'proj-harness',
    title: 'Wire OpenCode runtime provider per agent',
    status: 'done',
    priority: 'critical',
  },
  { projectId: 'proj-harness', title: 'Persist verification evidence bundles', status: 'done', priority: 'high' },
  {
    projectId: 'proj-harness',
    title: 'Tool-result → engineering event projection',
    status: 'review',
    priority: 'high',
  },
  {
    projectId: 'proj-harness',
    title: 'Retry budget + blocked → awaiting-approval',
    status: 'in_progress',
    priority: 'critical',
  },
  {
    projectId: 'proj-harness',
    title: 'Harness approval → Interaction bridge',
    status: 'in_progress',
    priority: 'high',
  },
  { projectId: 'proj-harness', title: 'Remote worker dispatch hardening', status: 'backlog', priority: 'medium' },

  // Marketplace — 5 tasks (1 done, 4 backlog/planning)
  {
    projectId: 'proj-marketplace',
    title: 'Asset detail verified footer + install affordance',
    status: 'done',
    priority: 'medium',
  },
  {
    projectId: 'proj-marketplace',
    title: 'Registries rescan + operation center',
    status: 'backlog',
    priority: 'medium',
  },
  {
    projectId: 'proj-marketplace',
    title: 'Publish directory validation + signing',
    status: 'backlog',
    priority: 'high',
  },
  { projectId: 'proj-marketplace', title: 'Marketplace fixture seed hardening', status: 'backlog', priority: 'low' },
  { projectId: 'proj-marketplace', title: 'Discover filters + publisher grouping', status: 'backlog', priority: 'low' },

  // Docs — 6 tasks
  { projectId: 'proj-docs', title: 'Generate docs baseline + drift check', status: 'done', priority: 'medium' },
  { projectId: 'proj-docs', title: 'Docs governance strict gate in CI', status: 'done', priority: 'medium' },
  { projectId: 'proj-docs', title: 'CLI status implementation plan page', status: 'in_progress', priority: 'medium' },
  { projectId: 'proj-docs', title: 'Evidence ingestion for visual scenarios', status: 'review', priority: 'low' },
  { projectId: 'proj-docs', title: 'Benchmark indexing pipeline', status: 'backlog', priority: 'low' },
  { projectId: 'proj-docs', title: 'AGENTS.md alignment with pnpm-workspace', status: 'backlog', priority: 'low' },

  // Migration — on_hold, 4 tasks mostly blocked
  { projectId: 'proj-migration', title: 'Audit deprecated /api/ops consumers', status: 'done', priority: 'high' },
  { projectId: 'proj-migration', title: 'Execution center route parity', status: 'in_progress', priority: 'high' },
  { projectId: 'proj-migration', title: 'Cut over OpsCenter → Execution API', status: 'backlog', priority: 'critical' },
  { projectId: 'proj-migration', title: 'Decommission legacy ops bridge', status: 'backlog', priority: 'medium' },
];

for (let i = 0; i < tasks.length; i++) {
  const t = tasks[i];
  insertTask({
    id: `task-${t.projectId}-${i + 1}`,
    projectId: t.projectId,
    title: t.title,
    description: '',
    status: t.status,
    priority: t.priority,
    createdAt: new Date(Date.now() - (tasks.length - i) * 3600000).toISOString(),
  });
}

// Persist
const data = db.export();
fs.writeFileSync(dbPath, Buffer.from(data));
console.log(`Seeded ${projects.length} projects, ${tasks.length} tasks into ${dbPath}`);
console.log(
  all(`SELECT id, name, status, priority FROM projects`)
    .map((r) => `${r.id} [${r.status}/${r.priority}] ${r.name}`)
    .join('\n'),
);
console.log(
  all(`SELECT project_id, status, count(*) as c FROM tasks GROUP BY project_id, status ORDER BY project_id`)
    .map((r) => `${r.project_id} ${r.status}: ${r.c}`)
    .join('\n'),
);
