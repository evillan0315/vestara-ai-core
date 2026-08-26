import { buildManifest, fingerprint, type MigrationManifest, type MigrationStep } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

/**
 * Versioned evolution of the remaining @vestara/workspace domain tables in the
 * shared `plans.db` (migration inventory, Track 3). All are stable (current
 * schema == original), so this is a single baseline step; future changes must
 * be added as migrations.
 */

const BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS engineering_sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        objective TEXT,
        status TEXT DEFAULT 'created',
        participants TEXT DEFAULT '[]',
        artifacts TEXT DEFAULT '[]',
        created_at TEXT,
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS workspace_events (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        type TEXT,
        actor TEXT,
        artifact_id TEXT,
        message TEXT,
        timestamp TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_we_session ON workspace_events(session_id);
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        title TEXT,
        goal TEXT,
        scope TEXT DEFAULT '[]',
        assumptions TEXT DEFAULT '[]',
        constraints TEXT DEFAULT '[]',
        risks TEXT DEFAULT '[]',
        tasks TEXT DEFAULT '[]',
        status TEXT DEFAULT 'draft',
        created_at TEXT,
        updated_at TEXT,
        workspace_id TEXT,
        parent_explanations TEXT DEFAULT '[]',
        prediction_id TEXT,
        decision_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
      CREATE INDEX IF NOT EXISTS idx_plans_workspace ON plans(workspace_id);
      CREATE TABLE IF NOT EXISTS change_sets (
        id TEXT PRIMARY KEY,
        plan_id TEXT,
        title TEXT,
        status TEXT DEFAULT 'draft',
        files TEXT DEFAULT '[]',
        created_at TEXT,
        applied_at TEXT,
        workspace_id TEXT,
        assessment_id TEXT,
        decision_id TEXT,
        author TEXT,
        summary TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cs_plan ON change_sets(plan_id);
      CREATE INDEX IF NOT EXISTS idx_cs_workspace ON change_sets(workspace_id);
      CREATE TABLE IF NOT EXISTS verification_reports (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        plan_id TEXT,
        change_set_id TEXT,
        status TEXT DEFAULT 'pending',
        checks TEXT DEFAULT '[]',
        summary TEXT DEFAULT '{"total":0,"passed":0,"failed":0,"skipped":0}',
        created_at TEXT,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_vr_cs ON verification_reports(change_set_id);
      CREATE INDEX IF NOT EXISTS idx_vr_workspace ON verification_reports(workspace_id);
      CREATE TABLE IF NOT EXISTS collaboration_records (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        change_set_id TEXT,
        plan_id TEXT,
        verification_id TEXT,
        status TEXT DEFAULT 'draft',
        approvals TEXT DEFAULT '[]',
        comments TEXT DEFAULT '[]',
        ownership TEXT DEFAULT '{}',
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cr_cs ON collaboration_records(change_set_id);
      CREATE INDEX IF NOT EXISTS idx_cr_workspace ON collaboration_records(workspace_id);
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        record_id TEXT,
        reviewer TEXT,
        decision TEXT,
        comment TEXT,
        created_at TEXT,
        FOREIGN KEY (record_id) REFERENCES collaboration_records(id)
      );
      CREATE INDEX IF NOT EXISTS idx_apr_record ON approvals(record_id);
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        record_id TEXT,
        artifact_type TEXT,
        artifact_id TEXT,
        author TEXT,
        message TEXT,
        created_at TEXT,
        FOREIGN KEY (record_id) REFERENCES collaboration_records(id)
      );
      CREATE INDEX IF NOT EXISTS idx_cmt_record ON comments(record_id);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        token TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip TEXT,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
      CREATE TABLE IF NOT EXISTS knowledge_nodes (
        id TEXT PRIMARY KEY,
        type TEXT,
        name TEXT,
        description TEXT,
        source_artifacts TEXT DEFAULT '[]',
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_kn_type ON knowledge_nodes(type);
      CREATE INDEX IF NOT EXISTS idx_kn_name ON knowledge_nodes(name);
      CREATE TABLE IF NOT EXISTS knowledge_relations (
        id TEXT PRIMARY KEY,
        source_id TEXT,
        target_id TEXT,
        type TEXT,
        created_at TEXT,
        FOREIGN KEY (source_id) REFERENCES knowledge_nodes(id),
        FOREIGN KEY (target_id) REFERENCES knowledge_nodes(id)
      );
      CREATE INDEX IF NOT EXISTS idx_kr_source ON knowledge_relations(source_id);
      CREATE INDEX IF NOT EXISTS idx_kr_target ON knowledge_relations(target_id);
      CREATE INDEX IF NOT EXISTS idx_kr_type ON knowledge_relations(type);
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT, description TEXT DEFAULT '',
        status TEXT DEFAULT 'planning', priority TEXT DEFAULT 'medium',
        lead_agent_id TEXT DEFAULT '', tags TEXT DEFAULT '[]',
        created_at TEXT, updated_at TEXT, completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, project_id TEXT, sprint_id TEXT DEFAULT '',
        title TEXT, description TEXT DEFAULT '',
        status TEXT DEFAULT 'backlog', priority TEXT DEFAULT 'medium',
        assignee_agent_id TEXT DEFAULT '', depends_on TEXT DEFAULT '[]',
        labels TEXT DEFAULT '[]', estimated_hours REAL DEFAULT 0,
        actual_hours REAL DEFAULT 0,
        created_at TEXT, updated_at TEXT, completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS sprints (
        id TEXT PRIMARY KEY, project_id TEXT, name TEXT, goal TEXT DEFAULT '',
        status TEXT DEFAULT 'planning',
        start_date TEXT, end_date TEXT,
        created_at TEXT, completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id);
      CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, customer_id TEXT, customer_email TEXT, customer_name TEXT,
        status TEXT DEFAULT 'pending', priority TEXT DEFAULT 'normal',
        subtotal REAL DEFAULT 0, tax REAL DEFAULT 0, shipping REAL DEFAULT 0, discount REAL DEFAULT 0,
        total REAL DEFAULT 0, currency TEXT DEFAULT 'USD', payment_status TEXT DEFAULT 'pending',
        payment_method TEXT DEFAULT '', shipping_address TEXT DEFAULT '{}', billing_address TEXT DEFAULT '{}',
        notes TEXT DEFAULT '', metadata TEXT DEFAULT '{}',
        created_at TEXT, updated_at TEXT, confirmed_at TEXT, shipped_at TEXT, delivered_at TEXT, cancelled_at TEXT
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY, order_id TEXT, product_id TEXT, product_name TEXT, product_sku TEXT DEFAULT '',
        quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0, total_price REAL DEFAULT 0,
        tax REAL DEFAULT 0, discount REAL DEFAULT 0, metadata TEXT DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    `;

export const WORKSPACE_DOMAIN_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'workspace.baseline',
    produces: [
      fingerprint('engineering_sessions', [
        'id',
        'title',
        'objective',
        'status',
        'participants',
        'artifacts',
        'created_at',
        'completed_at',
      ]),
      fingerprint('workspace_events', ['id', 'session_id', 'type', 'actor', 'artifact_id', 'message', 'timestamp']),
      fingerprint('plans', [
        'id',
        'title',
        'goal',
        'scope',
        'assumptions',
        'constraints',
        'risks',
        'tasks',
        'status',
        'created_at',
        'updated_at',
        'workspace_id',
        'parent_explanations',
        'prediction_id',
        'decision_id',
      ]),
      fingerprint('change_sets', [
        'id',
        'plan_id',
        'title',
        'status',
        'files',
        'created_at',
        'applied_at',
        'workspace_id',
        'assessment_id',
        'decision_id',
        'author',
        'summary',
      ]),
      fingerprint('verification_reports', [
        'id',
        'workspace_id',
        'plan_id',
        'change_set_id',
        'status',
        'checks',
        'summary',
        'created_at',
        'completed_at',
      ]),
      fingerprint('collaboration_records', [
        'id',
        'workspace_id',
        'change_set_id',
        'plan_id',
        'verification_id',
        'status',
        'approvals',
        'comments',
        'ownership',
        'created_at',
        'updated_at',
      ]),
      fingerprint('approvals', ['id', 'record_id', 'reviewer', 'decision', 'comment', 'created_at']),
      fingerprint('comments', ['id', 'record_id', 'artifact_type', 'artifact_id', 'author', 'message', 'created_at']),
      fingerprint('users', ['id', 'username', 'role', 'token', 'created_at']),
      fingerprint('audit_log', [
        'id',
        'user_id',
        'username',
        'action',
        'resource',
        'resource_id',
        'details',
        'ip',
        'timestamp',
      ]),
      fingerprint('knowledge_nodes', [
        'id',
        'type',
        'name',
        'description',
        'source_artifacts',
        'created_at',
        'updated_at',
      ]),
      fingerprint('knowledge_relations', ['id', 'source_id', 'target_id', 'type', 'created_at']),
      fingerprint('projects', [
        'id',
        'name',
        'description',
        'status',
        'priority',
        'lead_agent_id',
        'tags',
        'created_at',
        'updated_at',
        'completed_at',
      ]),
      fingerprint('tasks', [
        'id',
        'project_id',
        'sprint_id',
        'title',
        'description',
        'status',
        'priority',
        'assignee_agent_id',
        'depends_on',
        'labels',
        'estimated_hours',
        'actual_hours',
        'created_at',
        'updated_at',
        'completed_at',
      ]),
      fingerprint('sprints', [
        'id',
        'project_id',
        'name',
        'goal',
        'status',
        'start_date',
        'end_date',
        'created_at',
        'completed_at',
      ]),
      fingerprint('orders', [
        'id',
        'customer_id',
        'customer_email',
        'customer_name',
        'status',
        'priority',
        'subtotal',
        'tax',
        'shipping',
        'discount',
        'total',
        'currency',
        'payment_status',
        'payment_method',
        'shipping_address',
        'billing_address',
        'notes',
        'metadata',
        'created_at',
        'updated_at',
        'confirmed_at',
        'shipped_at',
        'delivered_at',
        'cancelled_at',
      ]),
      fingerprint('order_items', [
        'id',
        'order_id',
        'product_id',
        'product_name',
        'product_sku',
        'quantity',
        'unit_price',
        'total_price',
        'tax',
        'discount',
        'metadata',
      ]),
    ],
    up: (db: Database) => {
      db.exec(BASELINE_DDL);
    },
  },
  {
    name: 'impact_assessments.baseline',
    produces: [
      fingerprint('impact_assessments', [
        'id',
        'workspace_id',
        'plan_id',
        'target',
        'created_at',
        'confidence',
        'scope',
        'risk',
        'effort',
        'health',
        'recommendations',
        'narrative',
        'model_version',
      ]),
    ],
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS impact_assessments (
          id TEXT PRIMARY KEY, workspace_id TEXT, plan_id TEXT,
          target TEXT, created_at TEXT, confidence REAL,
          scope TEXT, risk TEXT, effort TEXT, health TEXT,
          recommendations TEXT, narrative TEXT, model_version TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_imp_ws ON impact_assessments(workspace_id);
      `);
    },
  },
];

/** Standalone workspace-domain manifest (for direct-construction tests). */
export const WORKSPACE_DOMAIN_MANIFEST: MigrationManifest = buildManifest('plans-workspace', [
  WORKSPACE_DOMAIN_MIGRATIONS,
]);

const PREFERENCES_BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );
    `;

export const PREFERENCES_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'preferences.baseline',
    produces: [fingerprint('preferences', ['key', 'value', 'updated_at'])],
    up: (db: Database) => {
      db.exec(PREFERENCES_BASELINE_DDL);
    },
  },
];

/** Manifest for the workspace `prefs.db` file. */
export const PREFERENCES_MANIFEST: MigrationManifest = buildManifest('preferences', [PREFERENCES_MIGRATIONS]);
