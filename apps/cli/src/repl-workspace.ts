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
import { PlanningService, PlanStorage } from '@vestara/workspace';
import {
  handleAgent,
  handleCollab,
  handleImplement,
  handlePlugin,
  handlePredict,
  handleRecommend,
  handleSuggest,
  handleVerify,
  handleWorkflow,
} from './commands/repl-advanced.js';
import {
  handleExplain,
  handleHistory,
  handleRead,
  handleRisks,
  handleSearch,
  handleSummary,
} from './commands/repl-basic.js';
import { handleConfigList, handleConfigReset, handleConfigSet } from './commands/repl-config.js';
import { handleRemaining } from './commands/repl-remaining.js';
import { BOLD, GOLD, GRAY, GREEN, RED, RESET } from './output/format.js';

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

    if (await handleSearch(input, line, session, rl)) return;
    if (await handleRead(input, line, rl)) return;
    if (input === 'risks') {
      await handleRisks(session, rl);
      return;
    }
    if (input === 'summary') {
      await handleSummary(runtime, rl);
      return;
    }
    if (input === 'history') {
      await handleHistory(session, rl);
      return;
    } // replaced above
    if (await handleConfigSet(input, line, session, rl)) return;
    if (await handleConfigList(input, session, rl)) return;
    if (await handleConfigReset(input, line, session, rl)) return;
    if (await handleExplain(input, line, session, provider, rl)) return;
    if (await handleImplement(input, line, session, provider, rl)) return;
    if (await handleVerify(input, line, session, rl)) return;
    if (await handleCollab(input, line, session, rl)) return;
    if (await handlePredict(input, line, session, provider, rl)) return;
    if (await handleSuggest(input, session, provider, rl)) return;
    if (await handleRecommend(input, line, session, provider, rl)) return;
    if (await handleAgent(input, line, session, provider, rl)) return;
    if (await handleWorkflow(input, line, session, provider, rl)) return;
    if (await handlePlugin(input, line, session, rl)) return;

    // ── Plan commands ─────────────────────────────────
    if (input === 'plan list' || input === 'plans') {
      try {
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
    if (await handleRemaining(input, line, session, provider, runtime, rl)) return;
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
