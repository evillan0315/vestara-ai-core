/**
 * Application route manifest — the single source of truth for routes.
 *
 * Rendered by App.tsx and consumed by the screenshot framework's route
 * discovery (`tests/visual/routes`). Adding a page here is all that is needed
 * to get it covered by visual regression tests.
 */

export interface AppRoute {
  id: string;
  path: string;
  title: string;
  requiresAuth: boolean;
  /** Whether the route is captured by the screenshot framework. */
  enabled: boolean;
  layout: 'public' | 'shell';
  hideFromNav?: boolean;
  /** Redirect target (redirect routes are not captured). */
  redirect?: string;
  /** Catch-all route (not captured). */
  catchAll?: boolean;
  /** Example values for dynamic path params (e.g. /sessions/:id). */
  sampleParams?: Record<string, string>;
}

export const APP_ROUTES: AppRoute[] = [
  { id: 'login', path: '/login', title: 'Login', requiresAuth: false, enabled: true, layout: 'public' },

  {
    id: 'redirect-root',
    path: '/',
    title: 'Home',
    requiresAuth: false,
    enabled: false,
    layout: 'shell',
    redirect: '/dashboard',
  },

  { id: 'overview', path: '/overview', title: 'Overview', requiresAuth: false, enabled: true, layout: 'shell' },
  { id: 'dashboard', path: '/dashboard', title: 'Dashboard', requiresAuth: false, enabled: true, layout: 'shell' },
  { id: 'sessions', path: '/sessions', title: 'Sessions', requiresAuth: true, enabled: true, layout: 'shell' },
  {
    id: 'session-detail',
    path: '/sessions/:id',
    title: 'Session Detail',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
    sampleParams: { id: 'session-sample' },
  },
  { id: 'artifacts', path: '/artifacts', title: 'Artifacts', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'agents', path: '/agents', title: 'Agent Control', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'routing', path: '/routing', title: 'Engineering Routing', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'chat', path: '/chat', title: 'Chat', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'memory', path: '/memory', title: 'Knowledge', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'terminal', path: '/terminal', title: 'Terminal', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'ops', path: '/ops', title: 'Operations', requiresAuth: true, enabled: true, layout: 'shell' },
  {
    id: 'orchestration',
    path: '/orchestration',
    title: 'Orchestration',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
  },
  { id: 'evidence', path: '/evidence', title: 'Evidence', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'verifier', path: '/verifier', title: 'Verifier', requiresAuth: true, enabled: true, layout: 'shell' },
  {
    id: 'qualification',
    path: '/qualification',
    title: 'Engineering Qualification',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
  },
  {
    id: 'qualification-detail',
    path: '/qualification/:profileId',
    title: 'Qualification Trial',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
    sampleParams: { profileId: 'deepseekV4FlashOpenCodeGo' },
  },
  {
    id: 'qualification-activity',
    path: '/qualification/:profileId/activity',
    title: 'Qualification Activity',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
    sampleParams: { profileId: 'deepseekV4FlashOpenCodeGo' },
  },
  { id: 'workers', path: '/workers', title: 'Workers', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'projects', path: '/projects', title: 'Projects', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'requests', path: '/requests', title: 'Requests', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'activities', path: '/activities', title: 'Activities', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'activity', path: '/activity', title: 'Activity Room', requiresAuth: true, enabled: true, layout: 'shell' },
  {
    id: 'activity-v2',
    path: '/activity-v2',
    title: 'Activity Room (M11C)',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
  },
  { id: 'api-builder', path: '/api-builder', title: 'API Builder', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'docs', path: '/docs', title: 'Documentation', requiresAuth: false, enabled: true, layout: 'shell' },
  { id: 'diagnostics', path: '/diagnostics', title: 'Diagnostics', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'execution', path: '/execution', title: 'Execution', requiresAuth: true, enabled: true, layout: 'shell' },
  { id: 'graph', path: '/graph', title: 'Engineering Graph', requiresAuth: true, enabled: true, layout: 'shell' },
  {
    id: 'marketplace',
    path: '/marketplace/*',
    title: 'Marketplace',
    requiresAuth: true,
    enabled: false,
    layout: 'shell',
    sampleParams: { '*': 'categories' },
  },
  {
    id: 'external-runtimes',
    path: '/external-runtimes',
    title: 'External Runtimes',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
  },
  {
    id: 'opencode',
    path: '/opencode',
    title: 'OpenCode',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
  },
  {
    id: 'opencode-sessions',
    path: '/opencode/sessions',
    title: 'OpenCode Sessions',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
  },
  {
    id: 'opencode-new-session',
    path: '/opencode/sessions/new',
    title: 'New OpenCode Session',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
  },
  {
    id: 'opencode-session-detail',
    path: '/opencode/sessions/:sessionId',
    title: 'OpenCode Session',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
    sampleParams: { sessionId: 'session-sample' },
  },
  {
    id: 'opencode-permissions',
    path: '/opencode/permissions',
    title: 'OpenCode Permissions',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
  },
  {
    id: 'workforce',
    path: '/workforce',
    title: 'Engineering Workforce',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
  },
  {
    id: 'settings',
    path: '/settings/*',
    title: 'Settings',
    requiresAuth: true,
    enabled: true,
    layout: 'shell',
    sampleParams: { '*': 'appearance' },
  },

  {
    id: 'not-found',
    path: '*',
    title: 'Not Found',
    requiresAuth: false,
    enabled: false,
    layout: 'shell',
    catchAll: true,
  },
];

/** Resolve a route pattern to a concrete URL, substituting sample params. */
export function resolveRouteUrl(route: AppRoute): string {
  if (route.redirect) return route.redirect;
  let url = route.path;
  const params = route.sampleParams ?? {};
  for (const [key, value] of Object.entries(params)) {
    url = url.replaceAll(`:${key}`, value);
  }
  return url;
}
