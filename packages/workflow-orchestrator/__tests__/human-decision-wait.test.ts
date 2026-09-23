import { migrate } from '@vestara/sqlite-migrations';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { ORCHESTRATION_MANIFEST } from '../src/orchestration-migrations';
import { TaskStore } from '../src/stores/task-store';

describe('AR-COORD-HUMAN-WAIT-001 workflow linkage', () => {
  it('persists the pending interaction identity and clears it on a new approval cycle', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    try {
      migrate(db, ORCHESTRATION_MANIFEST);
      const store = new TaskStore(db);
      const [task] = await store.createMany('plan-1', [
        {
          planId: 'plan-1',
          summary: 'AR-COORD-001 plan ready',
          description: '',
          files: [],
          dependencies: [],
          effort: 'medium',
          requiredCapabilities: [],
        },
      ]);

      await store.requestApproval(task.id, 'Awaiting Director approval');
      const pending = await store.attachApprovalInteraction(task.id, 'workflow-approval:project-1:task-1:0');
      expect(pending?.status).toBe('awaiting-approval');
      expect(pending?.approvalInteractionId).toBe('workflow-approval:project-1:task-1:0');

      await store.clearApproval(task.id);
      expect((await store.get(task.id))?.approvalInteractionId).toBeUndefined();

      await store.requestApproval(task.id, 'Awaiting Director approval again');
      expect((await store.get(task.id))?.approvalInteractionId).toBeUndefined();
    } finally {
      db.close();
    }
  });
});
