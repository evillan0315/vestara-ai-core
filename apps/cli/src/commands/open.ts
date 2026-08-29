/**
 * `vestara open` command handler.
 *
 * Thin CLI wrapper over WorkspaceRuntime. Imports only the runtime —
 * not knowledge, memory, or reasoning directly. Subscribes to workspace
 * events to render progressive status output.
 *
 * Architecture Traceability:
 *   Epic: EPIC-001 — Repository Comprehension
 *   Blueprint: Book 3 — AI Architecture
 *   Runtime: Kernel Lifecycle
 */

import fs from 'node:fs';
import path from 'node:path';
import { DefaultKernel } from '@vestara/kernel';
import { OpenCodeProvider } from '@vestara/provider-opencode';
import { DefaultProviderManager } from '@vestara/provider-runtime';
import { WorkspaceRuntime } from '@vestara/workspace';
import { BOLD, GOLD, GRAY, RED, RESET, renderStep } from '../output/format.js';

export async function runOpen(openPath: string, force = false): Promise<void> {
  // If workspace already exists and --force was not passed, warn and exit
  const wsManifestPath = path.join(openPath, '.vestara', 'workspace.json');
  if (!force && fs.existsSync(wsManifestPath)) {
    console.log();
    console.log(`${GOLD}Workspace already open at: ${openPath}${RESET}`);
    console.log(`${GRAY}Use ${BOLD}--force${RESET}${GRAY} to re-open and re-index the repository.${RESET}`);
    console.log();
    return;
  }

  console.log();
  console.log(`${BOLD}${GOLD}Opening repository...${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();

  const startTime = Date.now();

  try {
    // Boot kernel
    const kernel = new DefaultKernel();
    const providerManager = new DefaultProviderManager();
    const opencode = new OpenCodeProvider();
    await providerManager.register(opencode);
    await kernel.boot({
      providers: [{ manager: providerManager, providerId: 'opencode' }],
      logLevel: 'warn',
    });

    // Create workspace runtime with the OpenCode provider
    const runtime = new WorkspaceRuntime({
      logger: kernel.logger,
      eventBus: kernel.eventBus,
      provider: opencode,
    });

    // Subscribe to progress events
    const disposers: Array<() => void> = [];

    disposers.push(
      kernel.eventBus.subscribe('workspace:discover.completed', async (event: any) => {
        renderStep(true, 'Repository discovered', `${event.payload.fileCount} files`);
      }),
    );
    disposers.push(
      kernel.eventBus.subscribe('workspace:fingerprint.completed', async (event: any) => {
        renderStep(true, 'Repository identified', event.payload.name);
      }),
    );
    disposers.push(
      kernel.eventBus.subscribe('workspace:analysis.completed', async (event: any) => {
        renderStep(true, 'Repository analyzed', event.payload.language);
      }),
    );
    disposers.push(
      kernel.eventBus.subscribe('workspace:manifest.created', async () => {
        renderStep(true, 'Workspace created');
      }),
    );
    disposers.push(
      kernel.eventBus.subscribe('workspace:index.completed', async (event: any) => {
        renderStep(true, 'Knowledge indexed', `${event.payload.documents} documents`);
      }),
    );
    disposers.push(
      kernel.eventBus.subscribe('workspace:present.completed', async () => {
        renderStep(true, 'Repository understood');
      }),
    );

    // Run the pipeline
    const result = await runtime.open(openPath);
    const duration = Date.now() - startTime;

    // Print the summary
    console.log();
    if (result.workspace.presentation) {
      const { RepositoryPresenter } = await import('@vestara/workspace');
      const presenter = new RepositoryPresenter();
      process.stdout.write(presenter.renderCli(result.workspace.presentation));
    }
    console.log(`${GRAY}Ready in ${duration}ms${RESET}`);
    console.log();

    // Show top suggestions and next action
    try {
      const session = runtime.getSession();
      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs();

      // Suggestions
      const { SuggestionService, PlanStorage } = await import('@vestara/workspace');
      const sugDb = new SQL.Database();
      const sugSvc = new SuggestionService({ planStorage: new PlanStorage(sugDb) });
      const suggestions = await sugSvc.generate(session);
      const highPri = suggestions.filter((s: any) => s.priority === 'high').slice(0, 2);
      if (highPri.length > 0) {
        console.log(`${GRAY}Top Suggestions:${RESET}`);
        for (const s of highPri) {
          console.log(`  ⚠ ${s.title}`);
        }
        console.log();
      }

      // Next action
      const { WorkflowService } = await import('@vestara/workspace');
      const wfSvc = new WorkflowService();
      const ctx = wfSvc.recommend(session);
      console.log(`${GRAY}Next:${RESET} ${ctx.command}`);
      console.log(`${GRAY}${ctx.reason}${RESET}`);
      console.log();

      // Past patterns
      const { EngineeringMemory } = await import('@vestara/workspace');
      const memDb = new SQL.Database();
      const engMem = new EngineeringMemory({ db: memDb });
      const matches = engMem.recall(session.profile.name, 2);
      if (matches.length > 0) {
        console.log(`${GRAY}Similar past work:${RESET}`);
        for (const m of matches) {
          console.log(`  ${m.pattern.goal.slice(0, 70)}`);
        }
        console.log();
      }
    } catch {
      // enrichment is optional
    }

    // Start events server for the Workspace UI
    let eventsServer: any = null;
    let unsubscribeEvents: (() => void) | null = null;
    try {
      const { startServer, registerSession, subscribeToEventBus } = await import('@vestara/events-server');
      eventsServer = startServer(3001);
      registerSession(runtime.getSession());
      unsubscribeEvents = subscribeToEventBus(kernel.eventBus);
      console.log(`${GRAY}  UI:         http://127.0.0.1:5173 (run: pnpm --filter @vestara/workspace-ui dev)${RESET}`);
      console.log(`${GRAY}  Events:    http://127.0.0.1:3001/api/events${RESET}`);
    } catch (e: any) {
      console.log(`${GRAY}  (Events server unavailable: ${e.message})${RESET}`);
    }

    // Record desktop session
    try {
      const { DesktopService } = await import('@vestara/workspace');
      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs();
      const desktop = new DesktopService(new SQL.Database());
      await desktop.setLastWorkspace(path.resolve(openPath));
    } catch {
      /* desktop is optional */
    }

    // Start file system monitor (if supported)
    try {
      const ws = runtime.getSession();
      const { MonitorService, KnowledgeGraphStorage } = await import('@vestara/workspace');
      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs();
      const planDb = new SQL.Database();
      const graph = new KnowledgeGraphStorage(planDb);
      const monitor = new MonitorService(ws, graph);
      await monitor.start((event: any) => {
        if (event.type === 'file-changed' || event.type === 'file-added') {
          // File changed — event logged but no action needed in CLI mode
        }
      });
      (globalThis as any).__vestara_monitor = monitor;
    } catch {
      // Monitor is optional — works without file watching
    }

    // Interactive work continues in the canonical TUI. `open` remains a
    // finite workspace command and never takes ownership of terminal input.
    if (unsubscribeEvents) {
      unsubscribeEvents();
    }
    if (eventsServer) {
      eventsServer.close();
    }
    for (const dispose of disposers) {
      dispose();
    }
    await runtime.close();
    await kernel.shutdown();
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    renderStep(false, 'Failed to open repository');
    console.log(`  ${RED}${msg}${RESET}`);
    console.log();
    process.exit(1);
  }
}
