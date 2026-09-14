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

const projects = [];

for (const p of projects) insertProject(p);

// Tasks per project — varied to make dashboard meaningful
const tasks = [];

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
