import * as fs from 'node:fs';
import * as path from 'node:path';
import { openSharedDb } from '../lib/db.js';
import { BOLD, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

export async function runPlansList(cliArgs?: string[]): Promise<void> {
  const useJson = cliArgs?.includes('--json');
  console.log();
  console.log(`${BOLD}${GOLD}Vestara Plans${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();
  try {
    const db = await openSharedDb();
    const { PlanStorage } = await import('@vestara/workspace');
    const wsDir = path.join(process.cwd(), '.vestara');
    const manifestPath = path.join(wsDir, 'workspace.json');
    let workspaceId = 'default';
    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      if (manifest.id) workspaceId = manifest.id;
    } catch {}
    const store = new PlanStorage(db);
    const plans = await store.list(workspaceId);
    const statusCounts: Record<string, number> = {};
    for (const p of plans) statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
    const totalTasks = plans.reduce((sum, p) => sum + (p.tasks?.length ?? 0), 0);

    if (useJson) {
      console.log(
        JSON.stringify(
          {
            total: plans.length,
            tasks: totalTasks,
            statuses: statusCounts,
            plans: plans.map((p: any) => ({
              id: p.id,
              title: p.title,
              goal: p.goal,
              status: p.status,
              tasks: p.tasks?.length ?? 0,
              completedTasks: p.tasks?.filter((t: any) => t.status === 'completed').length ?? 0,
              createdAt: p.createdAt,
              updatedAt: p.updatedAt,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`  ${BOLD}Summary${RESET}`);
    console.log(`    Plans:       ${plans.length}`);
    console.log(`    Tasks:       ${totalTasks}`);
    console.log(
      `    Statuses:    ${Object.entries(statusCounts)
        .map(([s, c]) => `${s}: ${c}`)
        .join(', ')}`,
    );
    console.log();
    if (plans.length === 0) {
      console.log(`  ${GRAY}No plans found.${RESET}\n`);
      return;
    }

    for (const plan of plans) {
      const statusIcon =
        plan.status === 'executing'
          ? `${GREEN}●${RESET}`
          : plan.status === 'completed'
            ? `${GREEN}✔${RESET}`
            : plan.status === 'cancelled'
              ? `${RED}✘${RESET}`
              : `${GRAY}○${RESET}`;
      const taskCount = plan.tasks?.length ?? 0;
      const doneTasks = plan.tasks?.filter((t: any) => t.status === 'completed').length ?? 0;
      console.log(`  ${statusIcon} ${BOLD}${plan.title}${RESET}  ${GRAY}(${plan.id})${RESET}`);
      if (plan.goal && plan.goal !== plan.title)
        console.log(`       ${plan.goal.length > 100 ? `${plan.goal.slice(0, 97)}...` : plan.goal}`);
      console.log(`       Status: ${plan.status}  ·  Tasks: ${doneTasks}/${taskCount}`);
      console.log();
    }
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}\n`);
  }
}

export async function runPlanShow(id: string): Promise<void> {
  console.log();
  try {
    const db = await openSharedDb();
    const { PlanStorage, PlanningService } = await import('@vestara/workspace');
    const store = new PlanStorage(db);
    const plan = await store.get(id.toUpperCase());
    if (!plan) {
      console.log(`${RED}Plan "${id}" not found.${RESET}\n`);
      return;
    }
    const planner = new PlanningService({ storage: store });
    console.log(planner.renderPlan(plan));
    if (plan.status === 'draft') console.log(`${GRAY}  Approve: vestara plan approve ${plan.id}${RESET}`);
    console.log(`${GRAY}  Delete:  vestara plan delete ${plan.id}${RESET}\n`);
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}\n`);
  }
}

export async function runPlanApprove(id: string): Promise<void> {
  console.log();
  try {
    const db = await openSharedDb();
    const { PlanStorage, PlanningService } = await import('@vestara/workspace');
    const store = new PlanStorage(db);
    const planner = new PlanningService({ storage: store });
    const plan = await store.get(id.toUpperCase());
    if (!plan) {
      console.log(`${RED}Plan "${id}" not found.${RESET}\n`);
      return;
    }
    await planner.updatePlanStatus(id.toUpperCase(), 'approved');
    console.log(`${GREEN}✓${RESET} Plan ${BOLD}${id.toUpperCase()}${RESET} approved  ${GRAY}(${plan.title})${RESET}\n`);
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}\n`);
  }
}

export async function runPlanDelete(id: string): Promise<void> {
  console.log();
  try {
    const db = await openSharedDb();
    const { PlanStorage } = await import('@vestara/workspace');
    const store = new PlanStorage(db);
    const plan = await store.get(id.toUpperCase());
    if (!plan) {
      console.log(`${RED}Plan "${id}" not found.${RESET}\n`);
      return;
    }
    await store.delete(id.toUpperCase());
    console.log(`${GREEN}✓${RESET} Deleted plan ${BOLD}${id.toUpperCase()}${RESET}  ${GRAY}(${plan.title})${RESET}\n`);
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}\n`);
  }
}

export async function runPlanCreate(goal: string): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Creating plan...${RESET}`);
  console.log(`${GRAY}Goal: ${goal}${RESET}`);
  console.log();
  try {
    const db = await openSharedDb();
    const { PlanStorage, PlanningService } = await import('@vestara/workspace');
    const store = new PlanStorage(db);
    const wsDir = path.join(process.cwd(), '.vestara');
    const manifestPath = path.join(wsDir, 'workspace.json');
    let workspaceId = 'default';
    let profile: any = {
      name: 'workspace',
      language: 'typescript',
      isMonorepo: false,
      packages: [],
      entryPoints: [],
      risks: [],
    };
    try {
      if (fs.existsSync(manifestPath)) {
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(raw);
        workspaceId = manifest.id || workspaceId;
        profile = {
          name: manifest.name || 'workspace',
          language: manifest.analysis?.language || 'typescript',
          isMonorepo: manifest.analysis?.isMonorepo || false,
          packages: manifest.analysis?.packages || [],
          entryPoints: manifest.analysis?.entryPoints || [],
          risks: manifest.analysis?.risks || [],
        };
      }
    } catch {}

    const { OpenCodeProvider } = await import('@vestara/provider-opencode');
    const ocp = new OpenCodeProvider();
    await ocp.initialize({});
    const planner = new PlanningService({ storage: store, provider: ocp });
    const miniSession = {
      fingerprint: { id: workspaceId },
      profile,
      memory: { search: async () => ({ memories: [] }), store: async () => {} },
      storeMemory: async () => {},
    };
    const result = await planner.createPlan(goal, miniSession as any);
    console.log(
      `  ${GREEN}✓${RESET} Plan created  ${BOLD}(${result.plan.id})${RESET}  ${GRAY}source: ${result.source}, ${(result.duration / 1000).toFixed(1)}s${RESET}`,
    );
    console.log(`  ${GRAY}Use 'vestara plan show ${result.plan.id}' to view details${RESET}`);
    console.log(`  ${GRAY}Use 'vestara plan approve ${result.plan.id}' to approve${RESET}\n`);
    console.log(`  ${BOLD}${result.plan.title}${RESET}`);
    for (const ts of result.plan.tasks.map((t: any) => `${t.id}: ${t.summary} (${t.effort})`))
      console.log(`    · ${ts}`);
    console.log();
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}\n`);
  }
}

export async function runPlanUpdateStatus(id: string, status: string): Promise<void> {
  const validStatuses = ['draft', 'proposed', 'approved', 'executing', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    console.log(`${RED}Invalid status: "${status}"${RESET}\n`);
    return;
  }
  console.log();
  try {
    const db = await openSharedDb();
    const { PlanStorage, PlanningService } = await import('@vestara/workspace');
    const store = new PlanStorage(db);
    const planner = new PlanningService({ storage: store });
    const plan = await store.get(id.toUpperCase());
    if (!plan) {
      console.log(`${RED}Plan "${id}" not found.${RESET}\n`);
      return;
    }
    const prevStatus = plan.status;
    await planner.updatePlanStatus(id.toUpperCase(), status as any);
    console.log(
      `${GREEN}✓${RESET} Plan ${BOLD}${id.toUpperCase()}${RESET}: ${prevStatus} → ${GREEN}${status}${RESET}  ${GRAY}(${plan.title})${RESET}\n`,
    );
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}\n`);
  }
}
