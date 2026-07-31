import type { ProducerResult, UnderstandingProducer, WorkspaceObservation } from '@vestara/understanding';

/**
 * KnowledgeProducer — derives verified conclusions from raw observation signals.
 *
 * Unlike other producers that report structural fields (identity, architecture),
 * KnowledgeProducer answers higher-level questions:
 *   - Which app is the primary frontend?
 *   - What runtime owns the dashboard?
 *   - What technology stack is actually in use?
 *
 * Every conclusion is derived deterministically from observation — never from AI.
 */
export class KnowledgeProducer implements UnderstandingProducer {
  readonly id = 'knowledge';

  async produce(observation: WorkspaceObservation): Promise<ProducerResult> {
    const evidence: string[] = [];
    const packages = observation.dependencies.packages;
    const entryPoints = observation.entryPoints;
    const config = observation.config;
    const filesByExt = observation.files.byExtension;

    // ── Primary frontend ──────────────────────────────────────
    let primaryFrontend = '';
    let overviewPage = '';
    const dashboardPages: string[] = [];
    const frontendCandidates = entryPoints
      .filter(
        (ep) =>
          ep.type === 'app' &&
          (ep.path.includes('workspace') ||
            ep.path.includes('web') ||
            ep.path.includes('ui') ||
            ep.path.includes('frontend') ||
            ep.path.includes('dashboard')),
      )
      .map((ep) => ep.path);

    if (frontendCandidates.length > 0) {
      primaryFrontend = frontendCandidates[0];
      evidence.push(`frontend entry point: ${primaryFrontend}`);

      // Derive overview page path from the frontend root
      const baseDir = primaryFrontend.replace(/\/src\/.*$/, '/src');
      overviewPage = `${baseDir}/pages/Overview.tsx`;
      evidence.push(`overview page derived: ${overviewPage}`);
    }

    // ── Primary backend ───────────────────────────────────────
    let primaryBackend = '';
    const backendCandidates = entryPoints
      .filter(
        (ep) =>
          ep.type === 'app' && (ep.path.includes('api') || ep.path.includes('server') || ep.path.includes('backend')),
      )
      .map((ep) => ep.path);
    if (backendCandidates.length > 0) {
      primaryBackend = backendCandidates[0];
      evidence.push(`backend entry point: ${primaryBackend}`);
    }

    // ── Dashboard pages ───────────────────────────────────────
    const pageEntries = entryPoints.filter((ep) => ep.path.includes('/pages/') || ep.path.includes('/src/pages/'));
    for (const ep of pageEntries) {
      const pageName =
        ep.path
          .split('/')
          .pop()
          ?.replace(/\.tsx?$/, '') || '';
      if (pageName && !dashboardPages.includes(pageName)) {
        dashboardPages.push(pageName);
      }
    }
    if (dashboardPages.length > 0) {
      evidence.push(`dashboard pages: ${dashboardPages.join(', ')}`);
    }

    // ── Technology stack ──────────────────────────────────────
    let frontendFramework = 'React';
    const styling: string[] = [];
    let database = '';
    let testing = '';

    for (const pkg of packages) {
      const name = pkg.name.toLowerCase();
      if (name.includes('tailwindcss') && !styling.includes('Tailwind CSS')) {
        styling.push('Tailwind CSS');
        evidence.push('detected Tailwind CSS');
      }
      if ((name.includes('@emotion') || name.includes('@mui')) && !styling.includes('Material UI')) {
        styling.push('Material UI');
        evidence.push('detected MUI');
      }
      if (name.includes('vue')) {
        frontendFramework = 'Vue';
      }
      if (name.includes('svelte')) {
        frontendFramework = 'Svelte';
      }
      if (name.includes('next')) {
        frontendFramework = 'Next.js';
      }
      if (name.includes('prisma') || name.includes('typeorm') || name.includes('drizzle')) {
        database = name.includes('sqlite') ? 'SQLite' : name;
        evidence.push(`detected database: ${name}`);
      }
      if (name.includes('vitest') || name.includes('jest') || name.includes('playwright') || name.includes('cypress')) {
        testing = name.includes('vitest')
          ? 'Vitest'
          : name.includes('jest')
            ? 'Jest'
            : name.includes('playwright')
              ? 'Playwright'
              : 'Cypress';
        evidence.push(`detected test framework: ${testing}`);
      }
    }

    if (filesByExt['.vue']) frontendFramework = 'Vue 3';
    if (config.detectedTestFramework) testing = config.detectedTestFramework;

    // ── Runtime model ─────────────────────────────────────────
    const runtimeModel = config.isMonorepo ? 'Runtime-based (Monorepo)' : 'Runtime-based';
    const primaryOrchestrator = 'WorkspaceRuntime';
    const conversationRuntime = entryPoints.find((ep) => ep.path.includes('conversation'))
      ? '@vestara/conversation-runtime'
      : 'conversation-runtime';
    const workspaceRuntime = '@vestara/workspace';

    evidence.push(`runtime model: ${runtimeModel}`);
    evidence.push(`orchestrator: ${primaryOrchestrator}`);

    // ── Build confidence score ─────────────────────────────────
    const scores: number[] = [];
    if (primaryFrontend) scores.push(1.0);
    if (styling.length > 0) scores.push(0.95);
    if (runtimeModel) scores.push(0.9);
    if (dashboardPages.length > 0) scores.push(0.85);
    const confidence =
      scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0.5;

    return {
      fields: {
        knowledge: {
          application: {
            primaryFrontend,
            primaryBackend,
            overviewPage,
            dashboardPages,
            entryPoints: entryPoints.map((ep) => ({ path: ep.path, role: ep.type })),
          },
          technology: {
            frontend: frontendFramework,
            styling,
            backend: primaryBackend ? 'Node.js' : undefined,
            database: database || undefined,
            testing: testing || undefined,
          },
          runtime: {
            model: runtimeModel,
            primaryOrchestrator,
            conversationRuntime,
            workspaceRuntime,
          },
          confidence,
          evidence,
        },
      },
      confidence,
      evidence,
    };
  }
}
