import { type ComponentType, createElement, lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { TelemetryProvider } from './contexts/TelemetryContext';
import ShellLayout from './layouts/ShellLayout';
import { ThemeProvider } from './lib/theme';
import { APP_ROUTES } from './routes';

const Login = lazy(() => import('./pages/Login'));
const Overview = lazy(() => import('./pages/Overview'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SessionList = lazy(() => import('./pages/SessionList'));
const SessionView = lazy(() => import('./pages/Sessions/SessionView'));
const Artifacts = lazy(() => import('./pages/Artifacts'));
const Agents = lazy(() => import('./pages/Agents'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const Memory = lazy(() => import('./pages/Memory'));
const TerminalPage = lazy(() => import('./pages/Terminal'));
const OpsCenter = lazy(() => import('./pages/OpsCenter'));
const OrchestrationPage = lazy(() => import('./pages/Orchestration'));
const EvidencePage = lazy(() => import('./pages/Evidence'));
const ProjectsPage = lazy(() => import('./pages/Projects'));
const FeatureRequests = lazy(() => import('./pages/FeatureRequests'));
const Activities = lazy(() => import('./pages/Activities'));
const ApiBuilder = lazy(() => import('./pages/ApiBuilder'));
const Docs = lazy(() => import('./pages/Docs'));
const Diagnostics = lazy(() => import('./pages/Diagnostics'));
const Execution = lazy(() => import('./pages/Execution'));
const Graph = lazy(() => import('./pages/Graph'));
const Marketplace = lazy(() => import('./pages/Marketplace/MarketplaceLayout'));
const ExternalRuntimes = lazy(() => import('./pages/ExternalRuntimes'));
const Workforce = lazy(() => import('./pages/Workforce'));
const NotFound = lazy(() => import('./pages/NotFound'));
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage'));
const RoutingPage = lazy(() => import('./pages/Routing'));

/** Route id → lazy page component. Keys match APP_ROUTES ids. */
const PAGES: Record<string, ComponentType> = {
  login: Login,
  overview: Overview,
  dashboard: Dashboard,
  sessions: SessionList,
  'session-detail': SessionView,
  artifacts: Artifacts,
  agents: Agents,
  chat: ChatPage,
  memory: Memory,
  terminal: TerminalPage,
  ops: OpsCenter,
  orchestration: OrchestrationPage,
  evidence: EvidencePage,
  projects: ProjectsPage,
  requests: FeatureRequests,
  activities: Activities,
  'api-builder': ApiBuilder,
  docs: Docs,
  diagnostics: Diagnostics,
  execution: Execution,
  graph: Graph,
  marketplace: Marketplace,
  'external-runtimes': ExternalRuntimes,
  workforce: Workforce,
  settings: SettingsPage,
  routing: RoutingPage,
  'not-found': NotFound,
};

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={<div className="w-full py-16 text-center text-(--vestara-text-muted) animate-pulse">Loading...</div>}
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

function pageFor(routeId: string) {
  const Page = PAGES[routeId];
  return Page ? <LazyPage>{createElement(Page)}</LazyPage> : null;
}

export default function App() {
  const publicRoutes = APP_ROUTES.filter((r) => r.layout === 'public');
  const shellRoutes = APP_ROUTES.filter((r) => r.layout === 'shell');

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TelemetryProvider>
          <ToastProvider>
            <Routes>
              {publicRoutes.map((r) => (
                <Route key={r.id} path={r.path} element={pageFor(r.id)} />
              ))}
              <Route element={<ShellLayout />}>
                {shellRoutes
                  .filter((r) => !r.catchAll)
                  .map((r) =>
                    r.redirect ? (
                      <Route key={r.id} path={r.path} element={<Navigate to={r.redirect} replace />} />
                    ) : (
                      <Route key={r.id} path={r.path} element={pageFor(r.id)} />
                    ),
                  )}
                <Route
                  path="*"
                  element={
                    <LazyPage>
                      <NotFound />
                    </LazyPage>
                  }
                />
              </Route>
            </Routes>
          </ToastProvider>
        </TelemetryProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
