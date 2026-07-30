import { BOLD, GOLD, GREEN, RED, GRAY, RESET } from '../output/format.js';
import type { WorkspaceSession } from '@vestara/workspace';

async function getPlanDb(session: WorkspaceSession): Promise<any> {
  const path = await import('node:path'); const fs = await import('node:fs');
  const dbDir = path.join(session.workspaceDir, 'plans'); fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'plans.db');
  const initSqlJs = (await import('sql.js')).default; const SQL = await initSqlJs();
  let db: any; if (fs.existsSync(dbPath)) { const buffer = fs.readFileSync(dbPath); db = new SQL.Database(buffer); } else db = new SQL.Database();
  return db;
}

export async function handleRemaining(input: string, line: string, session: WorkspaceSession, provider: any, runtime: any, rl: any): Promise<boolean> {
    if (input === 'cloud status') {
      try {
        const { CloudStorage, CloudService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new CloudService({ storage: new CloudStorage(db) });
        const overview = await svc.getOverview();
        console.log(
          `\n  Cloud: ${overview.activeJobs} active jobs, ${overview.idleWorkers}/${overview.workers} workers idle\n`,
        );
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'cloud workers') {
      try {
        const { CloudStorage, CloudService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new CloudService({ storage: new CloudStorage(db) });
        process.stdout.write(`\n${svc.renderWorkers(await svc.listWorkers())}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'cloud job list' || input === 'cloud jobs') {
      try {
        const { CloudStorage, CloudService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new CloudService({ storage: new CloudStorage(db) });
        process.stdout.write(`\n${svc.renderJobs(await svc.listJobs())}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('cloud job submit ')) {
      const rest = line.slice(17).trim();
      const parts = rest.split(' ');
      const type = parts[0] || '';
      const target = parts.slice(1).join(' ') || '';
      if (!type || !target) {
        console.log(`${GRAY}  Usage: cloud job submit <type> <target>${RESET}`);
        rl.prompt();
        return true;
      }
      try {
        const { CloudStorage, CloudService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new CloudService({ storage: new CloudStorage(db) });
        const job = await svc.submitJob(type, target);
        console.log(`\n${GREEN}  Job submitted:${RESET} ${job.id}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Async Execution commands ─────────────────────
    if (input.startsWith('exec status ') || input.startsWith('exec show ')) {
      const jobId = input.startsWith('exec status ') ? line.slice(12).trim() : line.slice(10).trim();
      try {
        const { ExecutionEngine } = await import('@vestara/workspace');
        const eng = new ExecutionEngine();
        const job = eng.getJob(jobId);
        if (!job) {
          console.log(`${GRAY}  Job "${jobId}" not found.${RESET}`);
        } else {
          process.stdout.write(`\n${eng.renderJob(job)}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'exec list' || input === 'exec jobs') {
      try {
        const { ExecutionEngine } = await import('@vestara/workspace');
        const eng = new ExecutionEngine();
        process.stdout.write(`\n${eng.renderJobList(eng.listJobs())}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('exec cancel ')) {
      const jobId = line.slice(12).trim();
      try {
        const { ExecutionEngine } = await import('@vestara/workspace');
        const eng = new ExecutionEngine();
        if (eng.cancel(jobId)) {
          console.log(`\n${GREEN}  Job ${jobId} cancelled${RESET}\n`);
        } else {
          console.log(`\n${GRAY}  Job ${jobId} not found or already completed${RESET}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('exec ')) {
      const rest = line.slice(5).trim();
      const parts = rest.split(' ');
      const type = parts[0] || '';
      const target = parts.slice(1).join(' ') || '';
      if (!type || !target) {
        console.log(`${GRAY}  Usage: exec <type> <target>${RESET}`);
        rl.prompt();
        return true;
      }
      try {
        const { ExecutionEngine } = await import('@vestara/workspace');
        const eng = new ExecutionEngine();
        const steps = ['Initializing', 'Processing', 'Finalizing'];
        const id = eng.submit(type, target, async (emit, signal) => {
          for (let i = 0; i < steps.length; i++) {
            if (signal.aborted) return;
            emit('log', `Step ${i + 1}: ${steps[i]}`, Math.round((i / steps.length) * 100));
            await new Promise((r) => setTimeout(r, 200));
            if (signal.aborted) return;
          }
          emit('result', `${type} completed for: ${target}`, 100);
        });
        console.log(`\n${GREEN}  Job submitted:${RESET} ${id}\n`);
        console.log(`${GRAY}  Track with: exec status ${id}${RESET}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── OS commands ──────────────────────────────────
    if (input === 'os info' || input === 'os status') {
      try {
        const { OSSystemService } = await import('@vestara/workspace');
        const osSvc = new OSSystemService();
        const info = await osSvc.getSystemInfo();
        process.stdout.write(`\n${osSvc.renderInfo(info)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'os start') {
      try {
        const { LifecycleController } = await import('@vestara/os-controller');
        const ctl = new LifecycleController();
        process.stdout.write(`\n${GRAY}  Starting AI OS services...${RESET}\n\n`);
        const results = await ctl.startAll();
        process.stdout.write(`${ctl.renderStatuses(results)}\n`);
        process.stdout.write(`\n${ctl.renderSummary(ctl.getSummary())}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'os stop') {
      try {
        const { LifecycleController } = await import('@vestara/os-controller');
        const ctl = new LifecycleController();
        process.stdout.write(`\n${GRAY}  Stopping AI OS services...${RESET}\n\n`);
        const results = await ctl.stopAll();
        process.stdout.write(`${ctl.renderStatuses(results)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'os services' || input === 'os daemon') {
      try {
        const { OSSystemService } = await import('@vestara/workspace');
        const osSvc = new OSSystemService();
        const health = await osSvc.getServiceHealth();
        process.stdout.write(`\n${osSvc.renderHealth(health)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Enterprise commands ───────────────────────────
    if (input === 'enterprise audit') {
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const audit = await svc.getAuditLog();
        process.stdout.write(`\n${svc.renderAuditLog(audit)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'enterprise policy list' || input === 'enterprise policies') {
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const policies = await svc.listPolicies();
        process.stdout.write(`\n${svc.renderPolicies(policies)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'enterprise project list') {
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const projects = await svc.listProjects();
        process.stdout.write(`\n${svc.renderProjects(projects)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('enterprise project create ')) {
      const name = line
        .slice(26)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (!name) {
        console.log(`${GRAY}  Usage: enterprise project create "<name>"${RESET}`);
        rl.prompt();
        return true;
      }
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const proj = await svc.createProject(name, `Project: ${name}`);
        console.log(`\n${GREEN}  Project created:${RESET} ${proj.name} (${proj.id})\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'enterprise team list') {
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const teams = await svc.listTeams();
        process.stdout.write(`\n${svc.renderTeams(teams)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('enterprise team create ')) {
      const name = line
        .slice(23)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (!name) {
        console.log(`${GRAY}  Usage: enterprise team create "<name>"${RESET}`);
        rl.prompt();
        return true;
      }
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const team = await svc.createTeam(name, `Team: ${name}`);
        console.log(`\n${GREEN}  Team created:${RESET} ${team.name} (${team.id})\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'enterprise status' || input === 'enterprise overview') {
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const overview = await svc.getOverview();
        process.stdout.write(`\n${svc.renderOverview(overview)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('enterprise ')) {
      console.log(
        `${GRAY}  Enterprise subcommands: status, team create, team list, project create, project list, policy list, audit${RESET}`,
      );
      rl.prompt();
      return true;
    }

    // ── Organization / Multi-Repo commands ────────────
    if (input.startsWith('org impact ')) {
      const repoName = line.slice(11).trim();
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new OrganizationService({ storage: new OrganizationStorage(db) });
        const orgs = await svc.listOrganizations();
        if (orgs.length === 0) {
          console.log(`${GRAY}  No organizations. Create one with "org init".${RESET}`);
          rl.prompt();
          return true;
        }
        const result = await svc.impactAnalysis(orgs[0].id, repoName);
        process.stdout.write(`\n${svc.renderImpact(result)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'org graph') {
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new OrganizationService({ storage: new OrganizationStorage(db) });
        const orgs = await svc.listOrganizations();
        if (orgs.length === 0) {
          console.log(`${GRAY}  No organizations.${RESET}`);
          rl.prompt();
          return true;
        }
        const graph = await svc.getGraph(orgs[0].id);
        process.stdout.write(`\n${svc.renderGraph(graph)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('org search ')) {
      const query = line.slice(11).trim();
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new OrganizationService({ storage: new OrganizationStorage(db) });
        const orgs = await svc.listOrganizations();
        if (orgs.length === 0) {
          console.log(`${GRAY}  No organizations.${RESET}`);
          rl.prompt();
          return true;
        }
        const results = await svc.searchCrossRepo(orgs[0].id, query);
        if (results.length === 0) {
          console.log(`${GRAY}  No matches found.${RESET}`);
        } else {
          for (const r of results) {
            console.log(`  • ${r.repo}: ${r.matches.join(', ')}`);
          }
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'org list-repos' || input === 'org repos') {
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new OrganizationService({ storage: new OrganizationStorage(db) });
        const orgs = await svc.listOrganizations();
        if (orgs.length === 0) {
          console.log(`${GRAY}  No organizations.${RESET}`);
          rl.prompt();
          return true;
        }
        for (const org of orgs) {
          process.stdout.write(`\n${svc.renderOrg(org)}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'org list') {
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new OrganizationService({ storage: new OrganizationStorage(db) });
        const orgs = await svc.listOrganizations();
        if (orgs.length === 0) {
          console.log(`${GRAY}  No organizations.${RESET}`);
        } else {
          for (const org of orgs) {
            console.log(`  • ${org.name} (${org.id}) — ${org.repositories.length} repos`);
          }
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('org add-repo ')) {
      const repoPath = line.slice(13).trim();
      if (!repoPath) {
        console.log(`${GRAY}  Usage: org add-repo <path>${RESET}`);
        rl.prompt();
        return true;
      }
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new OrganizationService({ storage: new OrganizationStorage(db) });
        const orgs = await svc.listOrganizations();
        if (orgs.length === 0) {
          console.log(`${RED}  No organizations. Create one with "org init".${RESET}`);
          rl.prompt();
          return true;
        }
        const repo = await svc.addRepository(orgs[0].id, repoPath);
        console.log(`\n${GREEN}  Repository added:${RESET} ${repo.name} at ${repo.path}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('org init ')) {
      const name = line
        .slice(9)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (!name) {
        console.log(`${GRAY}  Usage: org init "<name>"${RESET}`);
        rl.prompt();
        return true;
      }
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new OrganizationService({ storage: new OrganizationStorage(db) });
        const org = await svc.createOrganization(name, `Organization: ${name}`);
        console.log(`\n${GREEN}  Organization created:${RESET} ${org.name} (${org.id})\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Auto-Index commands ────────────────────────────
    if (input === 'auto-index status') {
      try {
        const { KnowledgeGraphStorage, AutoIndex } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const idx = new AutoIndex({ graph: new KnowledgeGraphStorage(db) });
        process.stdout.write(`\n${idx.renderStats(idx.getStats())}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'auto-index run') {
      try {
        const { KnowledgeGraphStorage, AutoIndex, PlanStorage, ChangeSetStorage, CollaborationStorage } = await import(
          '@vestara/workspace'
        );
        const db = await getPlanDb(session);
        const idx = new AutoIndex({
          graph: new KnowledgeGraphStorage(db),
          planStorage: new PlanStorage(db),
          csStorage: new ChangeSetStorage(db),
          collabStorage: new CollaborationStorage(db),
        });
        process.stdout.write(`\n${GRAY}  Auto-indexing...${RESET}\n\n`);
        const count = await idx.indexAll(session);
        process.stdout.write(`\n${GREEN}  Indexed ${count} artifacts into knowledge graph.${RESET}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Memory / Knowledge Graph commands ──────────────
    if (input.startsWith('memory graph') || input === 'knowledge graph') {
      try {
        const { KnowledgeGraphStorage, MemoryService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const memory = new MemoryService({ graph: new KnowledgeGraphStorage(db) });
        process.stdout.write(`\n${await memory.getGraph()}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('memory explain ')) {
      const concept = line.slice(15).trim();
      if (!concept) {
        console.log(`${GRAY}  Usage: memory explain <concept>${RESET}`);
        rl.prompt();
        return true;
      }
      try {
        const { KnowledgeGraphStorage, MemoryService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const memory = new MemoryService({ graph: new KnowledgeGraphStorage(db) });
        process.stdout.write(`\n${await memory.explain(concept)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('memory search ')) {
      const query = line.slice(14).trim();
      if (!query) {
        console.log(`${GRAY}  Usage: memory search <query>${RESET}`);
        rl.prompt();
        return true;
      }
      try {
        const { KnowledgeGraphStorage, MemoryService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const memory = new MemoryService({ graph: new KnowledgeGraphStorage(db) });
        const results = await memory.search(query);
        process.stdout.write(`\n${memory.renderSearchResults(results)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'memory index' || input === 'memory index all') {
      try {
        const {
          KnowledgeGraphStorage,
          MemoryService,
          PlanStorage,
          ChangeSetStorage,
          VerificationStorage,
          CollaborationStorage,
          AgentStorage,
        } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const memory = new MemoryService({
          graph: new KnowledgeGraphStorage(db),
          planStorage: new PlanStorage(db),
          csStorage: new ChangeSetStorage(db),
          vrStorage: new VerificationStorage(db),
          collabStorage: new CollaborationStorage(db),
          agentStorage: new AgentStorage(db),
        });

        process.stdout.write(`\n${GRAY}  Indexing workspace artifacts...${RESET}\n\n`);
        const report = await memory.index(session);
        console.log(`${GREEN}  Knowledge graph ready: ${report.nodes} nodes${RESET}`);
        process.stdout.write(`${GRAY}  Duration: ${report.duration}ms${RESET}\n\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Workspace / Session commands ───────────────────
    if (input.startsWith('workspace events ')) {
      const sesId = line.slice(17).trim().toUpperCase();
      try {
        const { SessionStorage, SessionService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new SessionService({ storage: new SessionStorage(db) });
        const events = await svc.getEvents(sesId);
        process.stdout.write(`\n${svc.renderEvents(events)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'workspace list' || input === 'sessions') {
      try {
        const { SessionStorage, SessionService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new SessionService({ storage: new SessionStorage(db) });
        const sessions = await svc.listSessions();
        process.stdout.write(`\n${svc.renderSessionsList(sessions)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('workspace status ')) {
      const sesId = line.slice(17).trim().toUpperCase();
      try {
        const { SessionStorage, SessionService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new SessionService({ storage: new SessionStorage(db) });
        const ses = await svc.getSession(sesId);
        if (!ses) {
          console.log(`${GRAY}  Session "${sesId}" not found.${RESET}`);
        } else {
          process.stdout.write(`\n${svc.renderSession(ses)}\n`);
          const events = await svc.getEvents(sesId);
          process.stdout.write(`${svc.renderEvents(events)}\n`);
        }
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('workspace run ')) {
      const sesId = line.slice(14).trim().toUpperCase();
      try {
        const { SessionStorage, SessionService } = await import('@vestara/workspace');
        const { AgentStorage, AgentRuntime } = await import('@vestara/workspace');
        const { PlanStorage, ChangeSetStorage, CollaborationStorage, VerificationStorage } = await import(
          '@vestara/workspace'
        );
        const db = await getPlanDb(session);
        const agentRuntime = new AgentRuntime({ storage: new AgentStorage(db), provider });
        const svc = new SessionService({
          storage: new SessionStorage(db),
          planStorage: new PlanStorage(db),
          csStorage: new ChangeSetStorage(db),
          collabStorage: new CollaborationStorage(db),
          vrStorage: new VerificationStorage(db),
          agentRuntime,
        });

        process.stdout.write(`\n${GRAY}  Running session ${sesId}...${RESET}\n\n`);
        const result = await svc.runSession(sesId, session);
        process.stdout.write(`  Steps: ${result.completed}/${result.total} completed\n`);
        process.stdout.write(`  Status: ${result.session.status}\n`);
        process.stdout.write(`  Artifacts: ${result.session.artifacts.length}\n\n`);

        const events = await svc.getEvents(sesId);
        process.stdout.write(`${svc.renderEvents(events)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('workspace create ')) {
      const rest = line.slice(17).trim();
      const title = rest.replace(/^["']|["']$/g, '');
      if (!title) {
        console.log(`${GRAY}  Usage: workspace create "<objective>"${RESET}`);
        rl.prompt();
        return true;
      }
      try {
        const { SessionStorage, SessionService } = await import('@vestara/workspace');
        const db = await getPlanDb(session);
        const svc = new SessionService({ storage: new SessionStorage(db) });
        const ses = await svc.createSession(title, title);
        process.stdout.write(`\n${GREEN}  Session ${ses.id} created.${RESET}\n`);
        process.stdout.write(`  Objective: ${ses.objective}\n`);
        process.stdout.write(`  Status: ${ses.status}\n`);
        process.stdout.write(`  Run with: workspace run ${ses.id}\n\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Monitor commands ───────────────────────────────
    if (input === 'monitor status') {
      const mon = (globalThis as any).__vestara_monitor;
      if (!mon) {
        console.log(`${GRAY}  Monitor not active. Reopen workspace to enable.${RESET}`);
      } else {
        console.log(
          `\n  File Monitor: ${mon.isActive ? '● Active' : '○ Inactive'}\n  Watching: ${mon.watchedDirectoryCount} directories\n`,
        );
      }
      rl.prompt();
      return true;
    }

    // ── Persistence commands ───────────────────────────
    if (input === 'workspace save') {
      try {
        const { WorkspacePersistence } = await import('@vestara/workspace');
        const persist = new WorkspacePersistence(session);
        const result = await persist.saveAll();
        process.stdout.write(`\n${persist.renderSaveResult(result)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'workspace saved') {
      try {
        const { WorkspacePersistence } = await import('@vestara/workspace');
        const persist = new WorkspacePersistence(session);
        const summary = persist.getSavedSummary();
        process.stdout.write(`\n${persist.renderSavedSummary(summary)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Suggestion commands ────────────────────────────
    if (input === 'suggestions' || input === 'suggest next') {
      try {
        const { SuggestionService, PlanStorage } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        const svc = new SuggestionService({ planStorage: new PlanStorage(db) });
        const suggestions = await svc.generate(session);
        process.stdout.write(`\n${svc.renderSuggestions(suggestions)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Engineering Memory commands ────────────────────
    if (input === 'patterns' || input === 'engineering memory') {
      try {
        const { EngineeringMemory } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const eng = new EngineeringMemory({ db: new SQL.Database() });
        process.stdout.write(`\n${eng.renderPatterns(eng.listPatterns())}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('memory recall ')) {
      const goal = line.slice(14).trim();
      try {
        const { EngineeringMemory } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const eng = new EngineeringMemory({ db: new SQL.Database() });
        const matches = eng.recall(goal);
        process.stdout.write(`\n${eng.renderMatches(matches)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('memory record ')) {
      const parts = line.slice(14).trim().split(' ');
      const planId = parts[0]?.toUpperCase();
      const outcome = (parts[1] || 'success') as 'success' | 'partial' | 'failed';
      if (!planId) {
        console.log(`${GRAY}  Usage: memory record <plan-id> [success|partial|failed]${RESET}`);
        rl.prompt();
        return true;
      }
      try {
        const { EngineeringMemory, PlanStorage } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        const eng = new EngineeringMemory({ db, planStorage: new PlanStorage(db) });
        const pattern = await eng.record(planId, outcome, 0.5);
        console.log(`\n${GREEN}  Pattern recorded:${RESET} ${pattern.id}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Preference commands ────────────────────────────
    if (input === 'pref list' || input === 'preferences') {
      try {
        const { PreferenceService } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const svc = new PreferenceService(new SQL.Database());
        process.stdout.write(`\n${svc.renderAll()}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('pref get ')) {
      const key = line.slice(9).trim();
      try {
        const { PreferenceService } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const svc = new PreferenceService(new SQL.Database());
        console.log(`  ${key} = ${svc.get(key)}`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('pref set ')) {
      const rest = line.slice(9).trim();
      const eqIdx = rest.indexOf('=');
      if (eqIdx < 0) {
        console.log(`${GRAY}  Usage: pref set <key>=<value>${RESET}`);
        rl.prompt();
        return true;
      }
      const key = rest.slice(0, eqIdx).trim();
      const value = rest.slice(eqIdx + 1).trim();
      try {
        const { PreferenceService } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const svc = new PreferenceService(new SQL.Database());
        svc.set(key, value);
        console.log(`\n${GREEN}  ${key} = ${value}${RESET}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Workflow Intelligence commands ─────────────────
    if (input === 'workflow recommend' || input === 'workflow why') {
      try {
        const { WorkflowService } = await import('@vestara/workspace');
        const svc = new WorkflowService();
        const ctx = svc.recommend(session);
        const confidenceBar =
          '█'.repeat(Math.round(ctx.confidence * 10)) + '░'.repeat(10 - Math.round(ctx.confidence * 10));
        process.stdout.write(`\nNext Recommendation: ${ctx.label}\n`);
        process.stdout.write(`${'─'.repeat(40)}\n`);
        process.stdout.write(`\n  Command: ${ctx.command}\n`);
        process.stdout.write(`  Confidence: ${confidenceBar} ${(ctx.confidence * 100).toFixed(0)}%\n`);
        process.stdout.write(`\n  Why?\n`);
        for (const f of ctx.factors) {
          process.stdout.write(`    • ${f}\n`);
        }
        process.stdout.write(`\n  ${ctx.reason}\n\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Workflow commands ──────────────────────────────
    if (input === 'workflow list') {
      try {
        const { WorkflowService } = await import('@vestara/workspace');
        const svc = new WorkflowService();
        process.stdout.write(`\n${svc.renderWorkflowList()}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('workflow start ')) {
      const rest = line.slice(15).trim();
      const spaceIdx = rest.indexOf(' ');
      const wfId = spaceIdx > 0 ? rest.slice(0, spaceIdx) : rest;
      const goal = spaceIdx > 0 ? rest.slice(spaceIdx + 1) : wfId;
      try {
        const { WorkflowService } = await import('@vestara/workspace');
        const svc = new WorkflowService();
        const wf = svc.start(wfId as any, goal);
        process.stdout.write(`\n${svc.renderWorkflowStatus(wf)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('workflow next ')) {
      const key = line.slice(14).trim();
      try {
        const { WorkflowService } = await import('@vestara/workspace');
        const svc = new WorkflowService();
        const wf = svc.next(key);
        if (!wf) {
          console.log(`${GRAY}  Workflow not found or already completed.${RESET}`);
        } else {
          process.stdout.write(`\n${svc.renderWorkflowStatus(wf)}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('workflow status ')) {
      const key = line.slice(16).trim();
      try {
        const { WorkflowService } = await import('@vestara/workspace');
        const svc = new WorkflowService();
        const current = svc.getCurrentStep(key);
        if (!current) {
          console.log(`${GRAY}  Workflow not found.${RESET}`);
        } else {
          process.stdout.write(`\n${svc.renderWorkflowStatus(current.workflow)}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('workflow cancel ')) {
      const key = line.slice(16).trim();
      try {
        const { WorkflowService } = await import('@vestara/workspace');
        const svc = new WorkflowService();
        const wf = svc.cancel(key);
        if (!wf) {
          console.log(`${GRAY}  Workflow not found.${RESET}`);
        } else {
          console.log(`\n${GREEN}  Workflow cancelled.${RESET}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Desktop commands ───────────────────────────────
    if (input === 'desktop status') {
      try {
        const { DesktopService } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const svc = new DesktopService(new SQL.Database());
        const ses = await svc.getSession();
        process.stdout.write(`\n${svc.renderDesktop(ses)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('desktop pin')) {
      const path = line.slice(12).trim() || '.';
      try {
        const { DesktopService } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const svc = new DesktopService(new SQL.Database());
        await svc.pinRepository(path);
        console.log(`\n${GREEN}  Repository pinned:${RESET} ${path}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('desktop panel ')) {
      const panelId = line.slice(14).trim();
      try {
        const { DesktopService } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const svc = new DesktopService(new SQL.Database());
        await svc.togglePanel(panelId);
        console.log(`\n${GREEN}  Panel toggled:${RESET} ${panelId}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input === 'desktop restore') {
      try {
        const { DesktopService } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const svc = new DesktopService(new SQL.Database());
        const ses = await svc.getSession();
        if (ses.lastWorkspacePath) {
          console.log(`\n${GREEN}  Restoring workspace:${RESET} ${ses.lastWorkspacePath}\n`);
          // In a real OS, this would trigger vestara open <path>
        } else {
          console.log(`\n${GRAY}  No previous workspace to restore.${RESET}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── OS Dashboard command ────────────────────────────
    if (input === 'os dashboard' || input === 'dashboard') {
      try {
        const { OSSystemService, CapabilityService, collectSystemState, renderSystemState } = await import(
          '@vestara/workspace'
        );
        const osSvc = new OSSystemService();
        const capSvc = new CapabilityService();
        const mon = (globalThis as any).__vestara_monitor;
        const state = await collectSystemState(
          session,
          osSvc,
          capSvc,
          mon?.isActive ?? false,
          mon?.watchedDirectoryCount ?? 0,
        );
        process.stdout.write(`\n${renderSystemState(state)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Analytics commands ──────────────────────────────
    if (input === 'workspace analytics' || input === 'analytics') {
      try {
        const { AnalyticsService } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        const analytics = new AnalyticsService(db);
        analytics.recordSnapshot(session);
        const report = analytics.getReport();
        process.stdout.write(`\n${analytics.renderReport(report)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    // ── Capability status commands ─────────────────────
    if (input === 'capability list' || input === 'capabilities') {
      try {
        const { CapabilityService } = await import('@vestara/workspace');
        const svc = new CapabilityService();
        process.stdout.write(`\n${svc.renderList()}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

    if (input.startsWith('capability ')) {
      const id = line.slice(11).trim();
      try {
        const { CapabilityService } = await import('@vestara/workspace');
        const svc = new CapabilityService();
        const cap = svc.get(id) || svc.getByCommand(id);
        if (!cap) {
          console.log(`${GRAY}  Capability "${id}" not found.${RESET}`);
        } else {
          process.stdout.write(`\n${svc.renderDetail(cap)}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return true;
    }

  rl.prompt(); return false;
}
