/**
 * Workspace-aware REPL.
 *
 * After `vestara open .`, the prompt changes to `{repo-name} > ` and
 * every command operates within the workspace context. Questions are
 * routed through the workspace conversation service, which has access
 * to the indexed knowledge base and workspace memory.
 *
 * Architecture Traceability:
 *   Epic: EPIC-001 — Repository Comprehension
 *   Runtime: VESTARA-KERNEL.md → Boot Sequence
 */

import type { DefaultKernel } from '@vestara/kernel';
import type { AIProvider } from '@vestara/shared';
import type { WorkspaceRuntime } from '@vestara/workspace';

const GOLD = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GRAY = '\x1b[90m';

function isRateLimitError(err: any): boolean {
  const msg = err?.message ?? err?.toString?.() ?? '';
  return (
    msg.includes('429') ||
    msg.includes('RateLimit') ||
    msg.includes('rate limit') ||
    msg.includes('FreeUsageLimitError')
  );
}

function renderRateLimitHint(): string {
  return [
    `${GOLD}╔═══════════════════════════════════════════════════════════╗${RESET}`,
    `${GOLD}║${RESET}  OpenCode free tier rate limit reached.                ${GOLD}║${RESET}`,
    `${GOLD}║${RESET}                                                       ${GOLD}║${RESET}`,
    `${GOLD}║${RESET}  Options:                                              ${GOLD}║${RESET}`,
    `${GOLD}║${RESET}    ${BOLD}1. Wait${RESET} a few minutes and try again.                ${GOLD}║${RESET}`,
    `${GOLD}║${RESET}    ${BOLD}2. Use a local provider${RESET} (Ollama):                    ${GOLD}║${RESET}`,
    `${GOLD}║${RESET}       vestara provider add-local ollama               ${GOLD}║${RESET}`,
    `${GOLD}║${RESET}       vestara provider model enable ollama <model>    ${GOLD}║${RESET}`,
    `${GOLD}║${RESET}    ${BOLD}3. Add another remote provider${RESET}:                    ${GOLD}║${RESET}`,
    `${GOLD}║${RESET}       vestara provider add <id> --base-url <url>      ${GOLD}║${RESET}`,
    `${GOLD}╚═══════════════════════════════════════════════════════════╝${RESET}`,
  ].join('\n');
}

export async function startWorkspaceRepl(
  kernel: DefaultKernel,
  runtime: WorkspaceRuntime,
  provider?: AIProvider,
): Promise<void> {
  const session = runtime.getSession();
  const promptName = session.fingerprint.name;
  const readline = (await import('node:readline')).default;

  // Lazy-initialized plan database handle (outside line handler for cleanup access)
  let _planDb: any = null;
  async function getPlanDb(): Promise<any> {
    if (_planDb) return _planDb;
    const path = await import('node:path');
    const fs = await import('node:fs');
    const dbDir = path.join(session.workspaceDir, 'plans');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'plans.db');
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    let db: any;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
    _planDb = db;
    return db;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GOLD}${promptName} >${RESET} `,
  });

  // Show welcome tour on first open
  try {
    const { HelpService } = await import('@vestara/workspace');
    const help = new HelpService();
    process.stdout.write(`\n${help.renderWelcomeTour()}\n`);
  } catch {
    /* fallback */
  }
  console.log();

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim().toLowerCase();

    // ── Built-in commands ──────────────────────────────
    if (input === 'exit' || input === 'quit') {
      await cleanup();
      rl.close();
      return;
    }

    if (input === 'help') {
      try {
        const { HelpService } = await import('@vestara/workspace');
        const help = new HelpService();
        process.stdout.write(`\n${help.renderTopicList()}\n`);
        console.log(`${GRAY}  Use "help <topic>" for details (e.g., "help plan")${RESET}`);
      } catch (error) {
        console.log(`${GRAY}Help system unavailable${RESET}`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('help ')) {
      const topic = line.slice(5).trim();
      try {
        const { HelpService } = await import('@vestara/workspace');
        const help = new HelpService();
        const t = help.findTopic(topic);
        if (!t) {
          console.log(`${GRAY}  Topic "${topic}" not found. Use "help" for available commands.${RESET}`);
        } else {
          process.stdout.write(`\n${help.renderTopic(t)}\n`);
        }
      } catch (error) {
        console.log(`${GRAY}  Help topic "${topic}" unavailable${RESET}`);
      }
      rl.prompt();
      return;
    }

    if (input === 'health' || input === 'status') {
      try {
        const diag = await kernel.diagnose();
        console.log(`  Status: ${diag.status}`);
        console.log(`  Uptime: ${diag.uptime}s`);
        const totalServices = diag.health.healthyCount + diag.health.degradedCount + diag.health.unhealthyCount;
        console.log(`  Health: ${diag.health.overall} (${diag.health.healthyCount}/${totalServices} healthy)`);
        console.log(`  Memory: ${diag.resources.memory.heapUsed}MB / ${diag.resources.memory.heapTotal}MB`);
      } catch {
        console.log(`${RED}  Runtime unavailable${RESET}`);
      }
      rl.prompt();
      return;
    }

    if (input === 'history') {
      const conv = session.conversation.getConversation(
        (session.conversation as any).listConversations()?.[0]?.id ?? '',
      );
      if (conv) {
        console.log(`${GRAY}Conversation: ${conv.title} (${conv.messages.length} messages)${RESET}`);
        for (const msg of conv.messages) {
          const role = msg.role === 'user' ? 'You' : 'Vestara';
          const preview = msg.content.slice(0, 100) + (msg.content.length > 100 ? '...' : '');
          console.log(`  ${BOLD}${role}${RESET}: ${preview}`);
        }
      } else {
        console.log(`${GRAY}  No conversation history${RESET}`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('search ')) {
      const query = line.slice(7).trim();
      if (!query) {
        console.log(`${GRAY}  Usage: search <term>${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const results = await session.search(query, 5);
        if (results.length === 0) {
          console.log(`${GRAY}  No results found for "${query}"${RESET}`);
        } else {
          console.log(`${GRAY}  Results for "${query}":${RESET}`);
          for (const r of results.slice(0, 5)) {
            console.log(`  • ${r.document.title} (${r.document.language}) [score: ${r.score.toFixed(2)}]`);
          }
        }
      } catch (error: any) {
        console.log(`${RED}  Search error: ${error.message}${RESET}`);
      }
      rl.prompt();
      return;
    }

    if (input === 'risks') {
      const profile = session.profile;
      if (profile.risks.length === 0) {
        console.log(`${GREEN}  No risks detected${RESET}`);
      } else {
        console.log(`${GOLD}  Detected Risks (${profile.risks.length}):${RESET}`);
        for (const risk of profile.risks) {
          const icon = risk.severity === 'high' ? '⚠' : risk.severity === 'medium' ? '•' : '·';
          console.log(`  ${icon} [${risk.severity}] ${risk.category} — ${risk.detail}`);
          console.log(`     ${GRAY}${risk.location}${RESET}`);
        }
      }
      rl.prompt();
      return;
    }

    if (input === 'summary') {
      const result = runtime.currentWorkspace;
      if (result.presentation) {
        const { RepositoryPresenter } = await import('@vestara/workspace');
        const presenter = new RepositoryPresenter();
        process.stdout.write(presenter.renderCli(result.presentation));
      } else {
        console.log(`${GRAY}  Summary not available${RESET}`);
      }
      rl.prompt();
      return;
    }

    // ── Config command ────────────────────────────────
    if (input.startsWith('config set ') && input.length > 11) {
      const rest = line.slice(11).trim();
      const spaceIdx = rest.indexOf(' ');
      const key = spaceIdx > 0 ? rest.slice(0, spaceIdx) : rest;
      const value = spaceIdx > 0 ? rest.slice(spaceIdx + 1) : '';
      if (!key || !value) {
        console.log(`${GRAY}  Usage: config set <key> <value>${RESET}`);
        rl.prompt();
        return;
      }

      // Validate against provider registry from manifest
      if (key === 'model' || key === 'provider') {
        try {
          const { WorkspaceManifest } = await import('@vestara/workspace');
          const manifest = await WorkspaceManifest.load(session.workspaceDir);
          const providers = manifest?.providers ?? [];
          if (key === 'provider' && providers.length > 0) {
            const match = providers.find((p: any) => p.id === value);
            if (!match) {
              console.log(`\n${RED}  Provider "${value}" not found in registry.${RESET}`);
              console.log(`  ${GRAY}  To add it: vestara provider add ${value} --base-url <url>${RESET}\n`);
              rl.prompt();
              return;
            }
          }
          if (key === 'model' && providers.length > 0) {
            const currentProvider = session.prefs.get('provider');
            const prov = providers.find((p: any) => p.id === currentProvider);
            if (prov) {
              const match = prov.models.find((m: any) => m.id === value);
              if (!match) {
                console.log(`\n${GOLD}  ⚠ Model "${value}" not registered for provider "${currentProvider}".${RESET}`);
                console.log(`  ${GRAY}  Add it: vestara provider model add ${currentProvider} ${value}${RESET}\n`);
                rl.prompt();
                return;
              }
            }
          }
        } catch {}
      }

      session.prefs.set(key, value);
      console.log(`\n${GREEN}  ${key} updated to: ${value}${RESET}\n`);
      rl.prompt();
      return;
    }

    if (input === 'config list' || input === 'config') {
      try {
        process.stdout.write(`\n${session.prefs.renderAll()}\n`);
        // Show active provider/model from registry
        const { WorkspaceManifest } = await import('@vestara/workspace');
        const manifest = await WorkspaceManifest.load(session.workspaceDir);
        if (manifest?.providers && manifest.providers.length > 0) {
          const activeProv = manifest.providers.find((p: any) => p.enabled);
          if (activeProv) {
            const activeModels = activeProv.models.filter((m: any) => m.enabled).map((m: any) => m.id);
            console.log(`\n  Provider Registry: ${manifest.providers.length} provider(s) configured`);
            console.log(`  Active: ${activeProv.id} (${activeModels.length} model(s) enabled)`);
            if (activeModels.length > 0) console.log(`  Models: ${activeModels.join(', ')}`);
          } else {
            console.log(`\n  ${GOLD}⚠ No enabled providers in registry${RESET}`);
          }
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('config reset ')) {
      const key = line.slice(13).trim();
      if (!key) {
        console.log(`${GRAY}  Usage: config reset <key>${RESET}`);
        rl.prompt();
        return;
      }
      session.prefs.reset(key);
      const val = session.prefs.get(key);
      console.log(`\n${GREEN}  ${key} reset to: ${val}${RESET}\n`);
      rl.prompt();
      return;
    }

    // ── Explain command ───────────────────────────────
    if (input.startsWith('explain ')) {
      const target = line.slice(8).trim();
      if (!target) {
        console.log(`${GRAY}  Usage: explain <target> (e.g., "architecture", "packages/workspace")${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { ExplainService } = await import('@vestara/workspace');
        const explainer = new ExplainService({ provider });
        const result = await explainer.explain(target, session);
        process.stdout.write('\n');
        process.stdout.write(result.content);
        process.stdout.write('\n\n');

        // Store explanation in memory
        try {
          await session.storeMemory('event', `Explained ${target}: ${result.content.slice(0, 100)}...`);
        } catch {
          // best effort
        }
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    // ── Plan commands ─────────────────────────────────
    if (input === 'plan list' || input === 'plans') {
      try {
        const { PlanStorage, PlanningService } = await import('@vestara/workspace');
        const planDb = await getPlanDb();
        const storage = new PlanStorage(planDb);
        const planner = new PlanningService({ storage, provider });
        const plans = await planner.listPlans(session.fingerprint.id);
        process.stdout.write(`\n${planner.renderPlanList(plans)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('plan show ')) {
      const planId = line.slice(10).trim().toUpperCase();
      if (!planId) {
        console.log(`${GRAY}  Usage: plan show <id> (e.g., "plan show P-1")${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { PlanStorage, PlanningService } = await import('@vestara/workspace');
        const planDb = await getPlanDb();
        const storage = new PlanStorage(planDb);
        const planner = new PlanningService({ storage, provider });
        const plan = await planner.getPlan(planId);
        if (!plan) {
          console.log(`${GRAY}  Plan "${planId}" not found. Use "plan list" to see available plans.${RESET}`);
        } else {
          process.stdout.write(`\n${planner.renderPlan(plan)}\n`);
        }
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('plan approve ')) {
      const planId = line.slice(13).trim().toUpperCase();
      if (!planId) {
        console.log(`${GRAY}  Usage: plan approve <id> (e.g., "plan approve P-1")${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { PlanStorage, PlanningService } = await import('@vestara/workspace');
        const planDb = await getPlanDb();
        const storage = new PlanStorage(planDb);
        const planner = new PlanningService({ storage, provider });
        const plan = await planner.updatePlanStatus(planId, 'approved', session);
        if (!plan) {
          console.log(`${GRAY}  Plan "${planId}" not found.${RESET}`);
        } else {
          console.log(`\n${GREEN}  Plan ${planId} approved.${RESET} Status: draft → approved\n`);
          process.stdout.write(planner.renderPlan(plan));
        }
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('plan ')) {
      const goal = line.slice(5).trim();
      if (!goal) {
        console.log(`${GRAY}  Usage: plan <goal> (e.g., "plan add input validation to provider-runtime")${RESET}`);
        console.log(`${GRAY}  Subcommands: plan list, plan show <id>, plan approve <id>${RESET}`);
        rl.prompt();
        return;
      }

      try {
        const { PlanStorage, PlanningService } = await import('@vestara/workspace');
        const planDb = await getPlanDb();
        const storage = new PlanStorage(planDb);
        const planner = new PlanningService({ storage, provider });

        console.log(`\n${GRAY}  Analyzing workspace...${RESET}`);
        console.log(`${GRAY}  Generating plan...${RESET}`);

        const result = await planner.createPlan(goal, session);
        process.stdout.write(`\n${planner.renderPlan(result.plan)}\n`);
        console.log(`${GRAY}  Source: ${result.source} | Duration: ${result.duration}ms${RESET}`);
        console.log(
          `${GRAY}  Use "plan approve ${result.plan.id}" to approve, "plan show ${result.plan.id}" to view again.${RESET}\n`,
        );

        // Store in memory
        try {
          await session.storeMemory('decision', `Created plan ${result.plan.id}: ${goal.slice(0, 100)}`);
        } catch {
          // best effort
        }
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    // ── Implement commands ─────────────────────────────
    if (input.startsWith('implement show ')) {
      const csId = line.slice(14).trim().toUpperCase();
      if (!csId) {
        console.log(`${GRAY}  Usage: implement show <cs-id> (e.g., "implement show CS-1")${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { ChangeSetStorage, ImplementationService, PlanStorage } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const impl = new ImplementationService({
          planStorage: new PlanStorage(db),
          csStorage: new ChangeSetStorage(db),
          provider,
        });
        const cs = await impl.getChangeSet(csId);
        if (!cs) {
          console.log(`${GRAY}  Change Set "${csId}" not found.${RESET}`);
        } else {
          process.stdout.write(`\n${impl.renderChangeSet(cs)}\n`);
        }
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('implement apply ')) {
      const csId = line.slice(15).trim().toUpperCase();
      if (!csId) {
        console.log(`${GRAY}  Usage: implement apply <cs-id> (e.g., "implement apply CS-1")${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { ChangeSetStorage, ImplementationService, PlanStorage } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const impl = new ImplementationService({
          planStorage: new PlanStorage(db),
          csStorage: new ChangeSetStorage(db),
          provider,
        });
        process.stdout.write(`\n${GRAY}  Applying Change Set ${csId}...${RESET}\n\n`);
        const cs = await impl.apply(csId, session);

        for (const fc of cs.files) {
          const icon = fc.status === 'applied' ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
          process.stdout.write(`  ${icon} ${fc.path}\n`);
        }
        process.stdout.write(`\n${GREEN}  Change Set ${csId} ${cs.status}.${RESET}\n`);
        if (cs.planId) {
          process.stdout.write(`${GRAY}  Plan ${cs.planId} status updated.${RESET}\n\n`);
        }
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('implement decision ')) {
      const decisionId = line.slice(19).trim().toUpperCase();
      try {
        const { ChangeSetStorage, ImplementationService, PlanStorage, DecisionStorage } = await import(
          '@vestara/workspace'
        );
        const db = await getPlanDb();
        const impl = new ImplementationService({
          planStorage: new PlanStorage(db),
          csStorage: new ChangeSetStorage(db),
          decisionStorage: new DecisionStorage(db),
          provider,
        });
        process.stdout.write(`\n${GRAY}  Loading decision ${decisionId}...${RESET}\n`);
        process.stdout.write(`${GRAY}  Generating traceable implementation...${RESET}\n\n`);
        const result = await impl.implementFromDecision(decisionId, session);
        process.stdout.write(`${impl.renderChangeSet(result.changeSet)}\n`);
        process.stdout.write(`${GRAY}  Source: ${result.source} | Duration: ${result.duration}ms${RESET}\n`);
        process.stdout.write(`${GRAY}  Review with: implement show ${result.changeSet.id}${RESET}\n\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('implement plan ') || input.startsWith('implement ')) {
      const planId = input.startsWith('implement plan ')
        ? line.slice(15).trim().toUpperCase()
        : line.slice(11).trim().toUpperCase();
      if (!planId) {
        console.log(
          `${GRAY}  Usage: implement plan <plan-id> | implement decision <id> | implement show <cs-id> | implement apply <cs-id>${RESET}`,
        );
        rl.prompt();
        return;
      }
      try {
        const { ChangeSetStorage, ImplementationService, PlanStorage, DecisionStorage } = await import(
          '@vestara/workspace'
        );
        const db = await getPlanDb();
        const impl = new ImplementationService({
          planStorage: new PlanStorage(db),
          csStorage: new ChangeSetStorage(db),
          decisionStorage: new DecisionStorage(db),
          provider,
        });

        process.stdout.write(`\n${GRAY}  Loading plan ${planId}...${RESET}\n`);
        process.stdout.write(`${GRAY}  Generating changes...${RESET}\n\n`);

        const result = await impl.implement(planId, session);
        process.stdout.write(`${impl.renderChangeSet(result.changeSet)}\n`);
        process.stdout.write(`${GRAY}  Source: ${result.source} | Duration: ${result.duration}ms${RESET}\n`);
        process.stdout.write(`${GRAY}  Review with: implement show ${result.changeSet.id}${RESET}\n`);
        process.stdout.write(`${GRAY}  Apply with:  implement apply ${result.changeSet.id}${RESET}\n\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    // ── Verify commands ────────────────────────────────
    if (input === 'verify accuracy' || input === 'predict accuracy') {
      try {
        const { VerificationStorage, VerificationService, ChangeSetStorage, AccuracyStorage } = await import(
          '@vestara/workspace'
        );
        const db = await getPlanDb();
        const verifier = new VerificationService({
          csStorage: new ChangeSetStorage(db),
          vrStorage: new VerificationStorage(db),
          accuracyStorage: new AccuracyStorage(db),
        });
        const summary = await verifier.getAccuracySummary();
        process.stdout.write(`\n${verifier.renderAccuracy(summary)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'verify trends') {
      try {
        const { VerificationStorage, VerificationService } = await import('@vestara/workspace');
        const { ChangeSetStorage } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const verifier = new VerificationService({
          csStorage: new ChangeSetStorage(db),
          vrStorage: new VerificationStorage(db),
        });
        const trends = await verifier.getTrends(session.fingerprint.id);
        process.stdout.write(`\n${verifier.renderTrends(trends)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('verify show ')) {
      const vrId = line.slice(11).trim().toUpperCase();
      if (!vrId) {
        console.log(`${GRAY}  Usage: verify show <vr-id> (e.g., "verify show VR-1")${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { VerificationStorage, VerificationService } = await import('@vestara/workspace');
        const { ChangeSetStorage } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const verifier = new VerificationService({
          csStorage: new ChangeSetStorage(db),
          vrStorage: new VerificationStorage(db),
        });
        const report = await verifier.getReport(vrId);
        if (!report) {
          console.log(`${GRAY}  Verification report "${vrId}" not found.${RESET}`);
        } else {
          process.stdout.write(`\n${verifier.renderReport(report)}\n`);
        }
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'verify workspace') {
      try {
        const { VerificationStorage, VerificationService, ChangeSetStorage, PlanStorage, AccuracyStorage } =
          await import('@vestara/workspace');
        const db = await getPlanDb();
        const verifier = new VerificationService({
          csStorage: new ChangeSetStorage(db),
          vrStorage: new VerificationStorage(db),
          planStorage: new PlanStorage(db),
          accuracyStorage: new AccuracyStorage(db),
        });
        const output = await verifier.verifyWorkspace(session);
        process.stdout.write(`\n${output}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('verify plan ')) {
      const planId = line.slice(12).trim().toUpperCase();
      try {
        const { VerificationStorage, VerificationService, ChangeSetStorage, PlanStorage, AccuracyStorage } =
          await import('@vestara/workspace');
        const db = await getPlanDb();
        const verifier = new VerificationService({
          csStorage: new ChangeSetStorage(db),
          vrStorage: new VerificationStorage(db),
          planStorage: new PlanStorage(db),
          accuracyStorage: new AccuracyStorage(db),
        });
        const output = await verifier.verifyPlan(planId, session);
        process.stdout.write(`\n${output}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('verify ')) {
      const csId = line.slice(7).trim().toUpperCase();
      if (!csId) {
        console.log(`${GRAY}  Usage: verify <cs-id> (e.g., "verify CS-1")${RESET}`);
        console.log(`${GRAY}  Subcommands: verify show <vr-id>, verify plan <id>, verify workspace${RESET}`);
        rl.prompt();
        return;
      }

      try {
        const { VerificationStorage, VerificationService, ChangeSetStorage, PlanStorage, AccuracyStorage } =
          await import('@vestara/workspace');
        const db = await getPlanDb();
        const verifier = new VerificationService({
          csStorage: new ChangeSetStorage(db),
          vrStorage: new VerificationStorage(db),
          planStorage: new PlanStorage(db),
          accuracyStorage: new AccuracyStorage(db),
        });

        process.stdout.write(`\n${GRAY}  Verification started for Change Set ${csId}...${RESET}\n\n`);

        const result = await verifier.verify(csId, session);
        process.stdout.write(`${verifier.renderReport(result.report)}\n`);
        process.stdout.write(`${GRAY}  Duration: ${result.duration}ms${RESET}\n`);
        process.stdout.write(`${GRAY}  View with: verify show ${result.report.id}${RESET}\n\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    // ── Collaborate commands ──────────────────────────
    if (input.startsWith('collab list') || input === 'collaborate list') {
      try {
        const { CollaborationStorage, CollaborationService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const collab = new CollaborationService({ storage: new CollaborationStorage(db) });
        const records = await collab.listRecords(session.fingerprint.id);
        process.stdout.write(`\n${collab.renderList(records)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('collab status ') || input.startsWith('collaborate status ')) {
      const prefix = input.startsWith('collaborate status ') ? 19 : 14;
      const crId = line.slice(prefix).trim().toUpperCase();
      if (!crId) {
        console.log(`${GRAY}  Usage: collab status <cr-id>${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { CollaborationStorage, CollaborationService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const collab = new CollaborationService({ storage: new CollaborationStorage(db) });
        const record = await collab.getRecord(crId);
        if (!record) {
          console.log(`${GRAY}  Collaboration record "${crId}" not found.${RESET}`);
        } else {
          process.stdout.write(`\n${collab.renderRecord(record)}\n`);
        }
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('collab comment ') || input.startsWith('collaborate comment ')) {
      const prefix = input.startsWith('collaborate comment ') ? 19 : 15;
      const rest = line.slice(prefix).trim();
      const spaceIdx = rest.indexOf(' ');
      const crId = spaceIdx > 0 ? rest.slice(0, spaceIdx).toUpperCase() : '';
      const message = spaceIdx > 0 ? rest.slice(spaceIdx + 1).replace(/^["']|["']$/g, '') : rest;
      if (!crId || !message) {
        console.log(`${GRAY}  Usage: collab comment <cr-id> "<message>"${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { CollaborationStorage, CollaborationService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const collab = new CollaborationService({ storage: new CollaborationStorage(db) });
        const cmt = await collab.comment(crId, 'current-user', message);
        console.log(`\n${GREEN}  Comment added${RESET} (${cmt.id})\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('collab approve ') || input.startsWith('collaborate approve ')) {
      const prefix = input.startsWith('collaborate approve ') ? 19 : 15;
      const crId = line.slice(prefix).trim().toUpperCase();
      if (!crId) {
        console.log(`${GRAY}  Usage: collab approve <cr-id>${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { CollaborationStorage, CollaborationService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const collab = new CollaborationService({ storage: new CollaborationStorage(db) });
        const record = await collab.approve(crId, 'current-user');
        console.log(`\n${GREEN}  Approval recorded.${RESET} Status: ${record.status}\n`);
        process.stdout.write(`${collab.renderRecord(record)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('collab reject ') || input.startsWith('collaborate reject ')) {
      const prefix = input.startsWith('collaborate reject ') ? 18 : 14;
      const rest = line.slice(prefix).trim();
      const spaceIdx = rest.indexOf(' ');
      const crId = spaceIdx > 0 ? rest.slice(0, spaceIdx).toUpperCase() : '';
      const reason = spaceIdx > 0 ? rest.slice(spaceIdx + 1).replace(/^["']|["']$/g, '') : '';
      if (!crId || !reason) {
        console.log(`${GRAY}  Usage: collab reject <cr-id> "<reason>"${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { CollaborationStorage, CollaborationService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const collab = new CollaborationService({ storage: new CollaborationStorage(db) });
        const record = await collab.reject(crId, 'current-user', reason);
        console.log(`\n${RED}  Rejection recorded.${RESET} Status: ${record.status}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('collab submit ') || input.startsWith('collaborate submit ') || input.startsWith('collab ')) {
      const prefix = input.startsWith('collaborate submit ') ? 19 : input.startsWith('collab submit ') ? 14 : 6;
      const csId = line.slice(prefix).trim().toUpperCase();
      if (!csId) {
        console.log(`${GRAY}  Usage: collab submit <cs-id>${RESET}`);
        console.log(`${GRAY}  Subcommands: collab approve/reject/comment/status/list${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { CollaborationStorage, CollaborationService, ChangeSetStorage } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const collab = new CollaborationService({ storage: new CollaborationStorage(db) });
        const csStore = new ChangeSetStorage(db);
        const cs = await csStore.get(csId);
        if (!cs) {
          console.log(`${RED}  Change Set "${csId}" not found.${RESET}`);
          rl.prompt();
          return;
        }
        const record = await collab.submit(csId, cs.planId, session);
        process.stdout.write(`\n${GREEN}  Collaboration record ${record.id} created.${RESET}\n`);
        process.stdout.write(`  Status: ${record.status}\n`);
        process.stdout.write(`  Reviewers: ${record.ownership.reviewers.join(', ')}\n\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    // ── Predict commands ──────────────────────────────
    if (input.startsWith('predict plan ')) {
      const planId = line.slice(13).trim().toUpperCase();
      try {
        const { ImpactStorage, PredictionService, PlanStorage } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new PredictionService({
          storage: new ImpactStorage(db),
          planStorage: new PlanStorage(db),
          provider,
        });
        process.stdout.write(`\n${GRAY}  Analyzing...${RESET}\n\n`);
        const assessment = await svc.predictPlan(planId, session);
        if (!assessment) {
          console.log(`${GRAY}  Plan "${planId}" not found.${RESET}`);
        } else {
          process.stdout.write(`${svc.render(assessment)}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('predict compare ')) {
      const parts = line.slice(16).trim().toUpperCase().split(' ');
      if (parts.length < 2) {
        console.log(`${GRAY}  Usage: predict compare <id1> <id2>${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { ImpactStorage, PredictionService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new PredictionService({ storage: new ImpactStorage(db) });
        const cmp = await svc.compare(parts[0], parts[1]);
        console.log(`\n${cmp}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('predict history')) {
      try {
        const { ImpactStorage, PredictionService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new PredictionService({ storage: new ImpactStorage(db) });
        const history = await svc.list(session.fingerprint.id);
        if (history.length === 0) {
          console.log(`${GRAY}  No predictions yet.${RESET}`);
        } else {
          for (const a of history) {
            console.log(
              `  ${a.id}: ${a.target} (risk: ${a.risk.level}, health: ${a.health.current}→${a.health.predicted})`,
            );
          }
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('predict ')) {
      const goal = line.slice(8).trim();
      if (!goal) {
        console.log(
          `${GRAY}  Usage: predict <goal> | predict plan <id> | predict history | predict compare <id1> <id2>${RESET}`,
        );
        rl.prompt();
        return;
      }
      try {
        const { ImpactStorage, PredictionService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new PredictionService({ storage: new ImpactStorage(db), provider });
        process.stdout.write(`\n${GRAY}  Analyzing...${RESET}\n\n`);
        const assessment = await svc.predict(goal, session);
        process.stdout.write(`${svc.render(assessment)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    // ── Suggest command ───────────────────────────────
    if (input === 'suggest' || input.startsWith('suggest ')) {
      try {
        const { SuggestionService } = await import('@vestara/workspace');
        const suggester = new SuggestionService({ provider });
        process.stdout.write(`\n${GRAY}  Analyzing workspace...${RESET}\n\n`);
        const output = await suggester.aiSuggest(session);
        process.stdout.write(`\n${output}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    // ── Recommend / Decision commands ──────────────────
    if (input.startsWith('recommend accept ')) {
      const decId = line.slice(17).trim().toUpperCase();
      try {
        const { DecisionStorage, DecisionService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new DecisionService({ storage: new DecisionStorage(db) });
        const dec = await svc.accept(decId, 'current-user');
        if (!dec) {
          console.log(`${GRAY}  Decision "${decId}" not found.${RESET}`);
        } else {
          console.log(`\n${GREEN}  Decision ${decId} accepted.${RESET}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'recommend history') {
      try {
        const { DecisionStorage, DecisionService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new DecisionService({ storage: new DecisionStorage(db) });
        const decisions = await svc.list(session.fingerprint.id);
        if (decisions.length === 0) {
          console.log(`${GRAY}  No recommendations yet.${RESET}`);
        } else {
          for (const d of decisions) {
            const icon = d.accepted ? '✓' : '·';
            console.log(`  ${icon} ${d.id}: ${d.recommendation.slice(0, 80)} (${(d.confidence * 100).toFixed(0)}%)`);
          }
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'recommend next' || input === 'recommend') {
      try {
        const { DecisionStorage, DecisionService, PlanStorage, ImpactStorage } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new DecisionService({
          storage: new DecisionStorage(db),
          planStorage: new PlanStorage(db),
          impactStorage: new ImpactStorage(db),
          provider,
        });
        process.stdout.write(`\n${GRAY}  Analyzing...${RESET}\n\n`);
        const dec = input === 'recommend next' ? await svc.recommendNext(session) : await svc.recommend(session);
        process.stdout.write(`${svc.render(dec)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('recommend plan ')) {
      const planId = line.slice(15).trim().toUpperCase();
      try {
        const { DecisionStorage, DecisionService, PlanStorage, ImpactStorage } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new DecisionService({
          storage: new DecisionStorage(db),
          planStorage: new PlanStorage(db),
          impactStorage: new ImpactStorage(db),
          provider,
        });
        process.stdout.write(`\n${GRAY}  Analyzing...${RESET}\n\n`);
        const dec = await svc.recommendPlan(planId, session);
        process.stdout.write(`${svc.render(dec)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    // ── Agent commands ─────────────────────────────────
    if (input === 'agent list' || input === 'agents') {
      try {
        const { AgentStorage, AgentRuntime } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const runtime = new AgentRuntime({ storage: new AgentStorage(db), provider });
        const agents = await runtime.listAgents();
        process.stdout.write(`\n${runtime.renderAgentList(agents)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('agent inspect ')) {
      const agentId = line.slice(14).trim();
      if (!agentId) {
        console.log(`${GRAY}  Usage: agent inspect <agent-id>${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { AgentStorage, AgentRuntime } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const runtime = new AgentRuntime({ storage: new AgentStorage(db), provider });
        const agent = await runtime.getAgent(agentId);
        if (!agent) {
          console.log(`${GRAY}  Agent "${agentId}" not found.${RESET}`);
        } else {
          process.stdout.write(`\n${runtime.renderAgentDetail(agent)}\n`);
        }
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('agent run ')) {
      const rest = line.slice(10).trim();
      const spaceIdx = rest.indexOf(' ');
      const agentId = spaceIdx > 0 ? rest.slice(0, spaceIdx) : rest;
      const task = spaceIdx > 0 ? rest.slice(spaceIdx + 1) : '';

      if (!agentId || !task) {
        console.log(`${GRAY}  Usage: agent run <agent-id> "<task>"${RESET}`);
        console.log(`${GRAY}  Available agents: architect, developer, verifier, documenter${RESET}`);
        rl.prompt();
        return;
      }

      try {
        const { AgentStorage, AgentRuntime } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const runtime = new AgentRuntime({ storage: new AgentStorage(db), provider });

        process.stdout.write(`\n${GRAY}  Running agent "${agentId}"...${RESET}\n\n`);
        const result = await runtime.run(agentId, task, session);
        process.stdout.write(`${runtime.renderExecution(result.execution)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    // ── Workflow commands ────────────────────────────
    if (input === 'workflow list' || input === 'workflows' || input === 'wf list') {
      try {
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        const { PlanStorage, ChangeSetStorage, VerificationStorage, AgentWorkflowService } = await import(
          '@vestara/workspace'
        );
        const svc = new AgentWorkflowService({
          planStorage: new PlanStorage(db),
          csStorage: new ChangeSetStorage(db),
          vrStorage: new VerificationStorage(db),
          provider,
        });
        process.stdout.write(`\n${svc.renderDefinitionList()}\n`);
        console.log(`${GRAY}  Use "workflow start <id> <goal>" to begin${RESET}`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('workflow start ') || input.startsWith('wf start ')) {
      const rest = line.slice(input.startsWith('wf') ? 9 : 15).trim();
      const spaceIdx = rest.indexOf(' ');
      const wfId = spaceIdx > 0 ? rest.slice(0, spaceIdx) : rest;
      const goal = spaceIdx > 0 ? rest.slice(spaceIdx + 1) : '';
      if (!wfId || !goal) {
        console.log(`${GRAY}  Usage: workflow start <id> "<goal>"${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        const { PlanStorage, ChangeSetStorage, VerificationStorage, AgentWorkflowService } = await import(
          '@vestara/workspace'
        );
        const svc = new AgentWorkflowService({
          planStorage: new PlanStorage(db),
          csStorage: new ChangeSetStorage(db),
          vrStorage: new VerificationStorage(db),
          provider,
        });
        const wf = svc.start(wfId, goal);
        console.log(`\n${GRAY}  Running workflow: ${wf.name} (${wf.steps.length} steps)...${RESET}\n`);
        const result = await svc.run(wf.id, session);
        process.stdout.write(`\n${svc.renderInstance(result)}\n`);
        if (result.status === 'completed') {
          console.log(`\n${GREEN}  ✅ Workflow complete${RESET}\n`);
        } else {
          console.log(`\n${RED}  ❌ Workflow failed${RESET}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'workflow status' || input === 'wf status') {
      try {
        const { AgentWorkflowService } = await import('@vestara/workspace');
        const svc = new AgentWorkflowService();
        const instances = svc.listInstances();
        if (instances.length === 0) {
          console.log(`${GRAY}  No workflow instances.${RESET}`);
        } else {
          for (const wf of instances) {
            process.stdout.write(`\n${svc.renderInstance(wf)}\n`);
          }
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    // ── Plugin commands ───────────────────────────────
    if (input.startsWith('plugin exec ')) {
      const hook = line.slice(12).trim();
      if (!hook) {
        console.log(`${GRAY}  Usage: plugin exec <hook>${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { PluginRegistry, PluginRuntime } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const rt = new PluginRuntime({ registry: new PluginRegistry(db) });
        const results = await rt.executeHook(hook, session);
        console.log(`\n  Hook "${hook}" executed on ${results.length} plugin(s):\n`);
        for (const r of results) {
          const icon = r.status === 'success' ? '✓' : '✗';
          console.log(`  ${icon} ${r.pluginId} (${r.duration}ms): ${r.message}`);
        }
        console.log('');
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('plugin info ')) {
      const pluginId = line.slice(12).trim();
      try {
        const { PluginRegistry, PluginRuntime } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const rt = new PluginRuntime({ registry: new PluginRegistry(db) });
        const plugin = await rt.getPlugin(pluginId);
        if (!plugin) {
          console.log(`${GRAY}  Plugin "${pluginId}" not found.${RESET}`);
        } else {
          process.stdout.write(`\n${rt.renderPluginDetail(plugin)}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('plugin toggle ')) {
      const pluginId = line.slice(14).trim();
      try {
        const { PluginRegistry, PluginRuntime } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const rt = new PluginRuntime({ registry: new PluginRegistry(db) });
        const plugin = await rt.togglePlugin(pluginId);
        if (!plugin) {
          console.log(`${GRAY}  Plugin "${pluginId}" not found.${RESET}`);
        } else {
          console.log(`\n${GREEN}  Plugin ${plugin.id} toggled: ${plugin.status}${RESET}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'plugin list' || input === 'plugins') {
      try {
        const { PluginRegistry, PluginRuntime } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const rt = new PluginRuntime({ registry: new PluginRegistry(db) });
        const plugins = await rt.listPlugins();
        process.stdout.write(`\n${rt.renderPluginList(plugins)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    // ── Cloud commands ────────────────────────────────
    if (input === 'cloud status') {
      try {
        const { CloudStorage, CloudService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new CloudService({ storage: new CloudStorage(db) });
        const overview = await svc.getOverview();
        console.log(
          `\n  Cloud: ${overview.activeJobs} active jobs, ${overview.idleWorkers}/${overview.workers} workers idle\n`,
        );
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'cloud workers') {
      try {
        const { CloudStorage, CloudService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new CloudService({ storage: new CloudStorage(db) });
        process.stdout.write(`\n${svc.renderWorkers(await svc.listWorkers())}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'cloud job list' || input === 'cloud jobs') {
      try {
        const { CloudStorage, CloudService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new CloudService({ storage: new CloudStorage(db) });
        process.stdout.write(`\n${svc.renderJobs(await svc.listJobs())}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('cloud job submit ')) {
      const rest = line.slice(17).trim();
      const parts = rest.split(' ');
      const type = parts[0] || '';
      const target = parts.slice(1).join(' ') || '';
      if (!type || !target) {
        console.log(`${GRAY}  Usage: cloud job submit <type> <target>${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { CloudStorage, CloudService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new CloudService({ storage: new CloudStorage(db) });
        const job = await svc.submitJob(type, target);
        console.log(`\n${GREEN}  Job submitted:${RESET} ${job.id}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
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
      return;
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
      return;
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
      return;
    }

    if (input.startsWith('exec ')) {
      const rest = line.slice(5).trim();
      const parts = rest.split(' ');
      const type = parts[0] || '';
      const target = parts.slice(1).join(' ') || '';
      if (!type || !target) {
        console.log(`${GRAY}  Usage: exec <type> <target>${RESET}`);
        rl.prompt();
        return;
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
      return;
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
      return;
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
      return;
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
      return;
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
      return;
    }

    // ── Enterprise commands ───────────────────────────
    if (input === 'enterprise audit') {
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const audit = await svc.getAuditLog();
        process.stdout.write(`\n${svc.renderAuditLog(audit)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'enterprise policy list' || input === 'enterprise policies') {
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const policies = await svc.listPolicies();
        process.stdout.write(`\n${svc.renderPolicies(policies)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'enterprise project list') {
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const projects = await svc.listProjects();
        process.stdout.write(`\n${svc.renderProjects(projects)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('enterprise project create ')) {
      const name = line
        .slice(26)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (!name) {
        console.log(`${GRAY}  Usage: enterprise project create "<name>"${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const proj = await svc.createProject(name, `Project: ${name}`);
        console.log(`\n${GREEN}  Project created:${RESET} ${proj.name} (${proj.id})\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'enterprise team list') {
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const teams = await svc.listTeams();
        process.stdout.write(`\n${svc.renderTeams(teams)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('enterprise team create ')) {
      const name = line
        .slice(23)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (!name) {
        console.log(`${GRAY}  Usage: enterprise team create "<name>"${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const team = await svc.createTeam(name, `Team: ${name}`);
        console.log(`\n${GREEN}  Team created:${RESET} ${team.name} (${team.id})\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'enterprise status' || input === 'enterprise overview') {
      try {
        const { EnterpriseStorage, EnterpriseService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new EnterpriseService({ storage: new EnterpriseStorage(db) });
        const overview = await svc.getOverview();
        process.stdout.write(`\n${svc.renderOverview(overview)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('enterprise ')) {
      console.log(
        `${GRAY}  Enterprise subcommands: status, team create, team list, project create, project list, policy list, audit${RESET}`,
      );
      rl.prompt();
      return;
    }

    // ── Organization / Multi-Repo commands ────────────
    if (input.startsWith('org impact ')) {
      const repoName = line.slice(11).trim();
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new OrganizationService({ storage: new OrganizationStorage(db) });
        const orgs = await svc.listOrganizations();
        if (orgs.length === 0) {
          console.log(`${GRAY}  No organizations. Create one with "org init".${RESET}`);
          rl.prompt();
          return;
        }
        const result = await svc.impactAnalysis(orgs[0].id, repoName);
        process.stdout.write(`\n${svc.renderImpact(result)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'org graph') {
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new OrganizationService({ storage: new OrganizationStorage(db) });
        const orgs = await svc.listOrganizations();
        if (orgs.length === 0) {
          console.log(`${GRAY}  No organizations.${RESET}`);
          rl.prompt();
          return;
        }
        const graph = await svc.getGraph(orgs[0].id);
        process.stdout.write(`\n${svc.renderGraph(graph)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('org search ')) {
      const query = line.slice(11).trim();
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new OrganizationService({ storage: new OrganizationStorage(db) });
        const orgs = await svc.listOrganizations();
        if (orgs.length === 0) {
          console.log(`${GRAY}  No organizations.${RESET}`);
          rl.prompt();
          return;
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
      return;
    }

    if (input === 'org list-repos' || input === 'org repos') {
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new OrganizationService({ storage: new OrganizationStorage(db) });
        const orgs = await svc.listOrganizations();
        if (orgs.length === 0) {
          console.log(`${GRAY}  No organizations.${RESET}`);
          rl.prompt();
          return;
        }
        for (const org of orgs) {
          process.stdout.write(`\n${svc.renderOrg(org)}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'org list') {
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb();
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
      return;
    }

    if (input.startsWith('org add-repo ')) {
      const repoPath = line.slice(13).trim();
      if (!repoPath) {
        console.log(`${GRAY}  Usage: org add-repo <path>${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new OrganizationService({ storage: new OrganizationStorage(db) });
        const orgs = await svc.listOrganizations();
        if (orgs.length === 0) {
          console.log(`${RED}  No organizations. Create one with "org init".${RESET}`);
          rl.prompt();
          return;
        }
        const repo = await svc.addRepository(orgs[0].id, repoPath);
        console.log(`\n${GREEN}  Repository added:${RESET} ${repo.name} at ${repo.path}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('org init ')) {
      const name = line
        .slice(9)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (!name) {
        console.log(`${GRAY}  Usage: org init "<name>"${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { OrganizationStorage, OrganizationService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new OrganizationService({ storage: new OrganizationStorage(db) });
        const org = await svc.createOrganization(name, `Organization: ${name}`);
        console.log(`\n${GREEN}  Organization created:${RESET} ${org.name} (${org.id})\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    // ── Auto-Index commands ────────────────────────────
    if (input === 'auto-index status') {
      try {
        const { KnowledgeGraphStorage, AutoIndex } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const idx = new AutoIndex({ graph: new KnowledgeGraphStorage(db) });
        process.stdout.write(`\n${idx.renderStats(idx.getStats())}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'auto-index run') {
      try {
        const { KnowledgeGraphStorage, AutoIndex, PlanStorage, ChangeSetStorage, CollaborationStorage } = await import(
          '@vestara/workspace'
        );
        const db = await getPlanDb();
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
      return;
    }

    // ── Memory / Knowledge Graph commands ──────────────
    if (input.startsWith('memory graph') || input === 'knowledge graph') {
      try {
        const { KnowledgeGraphStorage, MemoryService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const memory = new MemoryService({ graph: new KnowledgeGraphStorage(db) });
        process.stdout.write(`\n${await memory.getGraph()}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('memory explain ')) {
      const concept = line.slice(15).trim();
      if (!concept) {
        console.log(`${GRAY}  Usage: memory explain <concept>${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { KnowledgeGraphStorage, MemoryService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const memory = new MemoryService({ graph: new KnowledgeGraphStorage(db) });
        process.stdout.write(`\n${await memory.explain(concept)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('memory search ')) {
      const query = line.slice(14).trim();
      if (!query) {
        console.log(`${GRAY}  Usage: memory search <query>${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { KnowledgeGraphStorage, MemoryService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const memory = new MemoryService({ graph: new KnowledgeGraphStorage(db) });
        const results = await memory.search(query);
        process.stdout.write(`\n${memory.renderSearchResults(results)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
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
        const db = await getPlanDb();
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
      return;
    }

    // ── Workspace / Session commands ───────────────────
    if (input.startsWith('workspace events ')) {
      const sesId = line.slice(17).trim().toUpperCase();
      try {
        const { SessionStorage, SessionService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new SessionService({ storage: new SessionStorage(db) });
        const events = await svc.getEvents(sesId);
        process.stdout.write(`\n${svc.renderEvents(events)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input === 'workspace list' || input === 'sessions') {
      try {
        const { SessionStorage, SessionService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new SessionService({ storage: new SessionStorage(db) });
        const sessions = await svc.listSessions();
        process.stdout.write(`\n${svc.renderSessionsList(sessions)}\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('workspace status ')) {
      const sesId = line.slice(17).trim().toUpperCase();
      try {
        const { SessionStorage, SessionService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new SessionService({ storage: new SessionStorage(db) });
        const session = await svc.getSession(sesId);
        if (!session) {
          console.log(`${GRAY}  Session "${sesId}" not found.${RESET}`);
        } else {
          process.stdout.write(`\n${svc.renderSession(session)}\n`);
          const events = await svc.getEvents(sesId);
          process.stdout.write(`${svc.renderEvents(events)}\n`);
        }
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('workspace run ')) {
      const sesId = line.slice(14).trim().toUpperCase();
      try {
        const { SessionStorage, SessionService } = await import('@vestara/workspace');
        const { AgentStorage, AgentRuntime } = await import('@vestara/workspace');
        const { PlanStorage, ChangeSetStorage, CollaborationStorage, VerificationStorage } = await import(
          '@vestara/workspace'
        );
        const db = await getPlanDb();
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
      return;
    }

    if (input.startsWith('workspace create ')) {
      const rest = line.slice(17).trim();
      const title = rest.replace(/^["']|["']$/g, '');
      if (!title) {
        console.log(`${GRAY}  Usage: workspace create "<objective>"${RESET}`);
        rl.prompt();
        return;
      }
      try {
        const { SessionStorage, SessionService } = await import('@vestara/workspace');
        const db = await getPlanDb();
        const svc = new SessionService({ storage: new SessionStorage(db) });
        const session = await svc.createSession(title, title);
        process.stdout.write(`\n${GREEN}  Session ${session.id} created.${RESET}\n`);
        process.stdout.write(`  Objective: ${session.objective}\n`);
        process.stdout.write(`  Status: ${session.status}\n`);
        process.stdout.write(`  Run with: workspace run ${session.id}\n\n`);
      } catch (error: any) {
        console.log(`\n${RED}  Error: ${error.message}${RESET}\n`);
      }
      rl.prompt();
      return;
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
      return;
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
      return;
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
      return;
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
      return;
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
      return;
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
      return;
    }

    if (input.startsWith('memory record ')) {
      const parts = line.slice(14).trim().split(' ');
      const planId = parts[0]?.toUpperCase();
      const outcome = (parts[1] || 'success') as 'success' | 'partial' | 'failed';
      if (!planId) {
        console.log(`${GRAY}  Usage: memory record <plan-id> [success|partial|failed]${RESET}`);
        rl.prompt();
        return;
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
      return;
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
      return;
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
      return;
    }

    if (input.startsWith('pref set ')) {
      const rest = line.slice(9).trim();
      const eqIdx = rest.indexOf('=');
      if (eqIdx < 0) {
        console.log(`${GRAY}  Usage: pref set <key>=<value>${RESET}`);
        rl.prompt();
        return;
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
      return;
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
      return;
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
      return;
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
      return;
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
      return;
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
      return;
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
      return;
    }

    // ── Desktop commands ───────────────────────────────
    if (input === 'desktop status') {
      try {
        const { DesktopService } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const svc = new DesktopService(new SQL.Database());
        const session = await svc.getSession();
        process.stdout.write(`\n${svc.renderDesktop(session)}\n`);
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
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
      return;
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
      return;
    }

    if (input === 'desktop restore') {
      try {
        const { DesktopService } = await import('@vestara/workspace');
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const svc = new DesktopService(new SQL.Database());
        const session = await svc.getSession();
        if (session.lastWorkspacePath) {
          console.log(`\n${GREEN}  Restoring workspace:${RESET} ${session.lastWorkspacePath}\n`);
          // In a real OS, this would trigger vestara open <path>
        } else {
          console.log(`\n${GRAY}  No previous workspace to restore.${RESET}\n`);
        }
      } catch (e: any) {
        console.log(`\n${RED}  Error: ${e.message}${RESET}\n`);
      }
      rl.prompt();
      return;
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
      return;
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
      return;
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
      return;
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
      return;
    }

    // ── General conversation ───────────────────────────
    if (input) {
      const convs = (session.conversation as any).listConversations();
      const convId = convs?.[0]?.id;
      if (convId) {
        process.stdout.write(`\n${GRAY}Vestara is thinking...${RESET}\n\n`);
        try {
          let _fullResponse = '';
          const modelOpt = session.prefs.get('model');
          const model = modelOpt || undefined;
          for await (const chunk of session.conversation.sendMessageStream(convId, line.trim(), { model })) {
            if (chunk.type === 'text' && chunk.content) {
              _fullResponse += chunk.content;
              process.stdout.write(chunk.content);
            } else if (chunk.type === 'reasoning' && chunk.content) {
              process.stdout.write(`${GRAY}${chunk.content}${RESET}`);
            } else if (chunk.type === 'error' && chunk.content) {
              if (isRateLimitError(chunk)) {
                process.stdout.write(`\n${RED}Rate limit exceeded.${RESET}\n\n`);
                process.stdout.write(renderRateLimitHint());
                process.stdout.write('\n');
              } else {
                process.stdout.write(`\n${RED}Error: ${chunk.content}${RESET}`);
              }
            }
          }
          console.log();
          console.log();
        } catch (_e: any) {
          // Fallback to non-streaming
          try {
            const modelOpt = session.prefs.get('model');
            const result = await session.conversation.sendMessage(convId, line.trim(), {
              model: modelOpt || undefined,
            });
            console.log(`\n${result.response.content}\n`);
          } catch (err: any) {
            if (isRateLimitError(err)) {
              console.log(`\n${RED}Rate limit exceeded.${RESET}\n`);
              console.log(renderRateLimitHint());
              console.log();
            } else {
              console.log(`\n${RED}Error: ${err.message}${RESET}\n`);
            }
          }
        }
      } else {
        console.log(`${GRAY}  Conversation service not available.${RESET}`);
      }
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    await cleanup();
    process.exit(0);
  });

  async function cleanup(): Promise<void> {
    // Persist workspace state
    try {
      const { WorkspacePersistence } = await import('@vestara/workspace');
      const persist = new WorkspacePersistence(session);
      await persist.saveAll();
    } catch {
      /* best effort */
    }

    // Persist plan database
    if (_planDb) {
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const data = _planDb.export();
        fs.writeFileSync(path.join(session.workspaceDir, 'plans', 'plans.db'), Buffer.from(data));
      } catch {
        // best effort
      }
    }
    try {
      await runtime.close();
    } catch {
      // best effort
    }
    try {
      await kernel.shutdown();
    } catch {
      // best effort
    }
  }
}
