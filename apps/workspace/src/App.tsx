import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import ShellLayout from './layouts/ShellLayout';
import { ThemeProvider } from './lib/theme';
import { TelemetryProvider } from './contexts/TelemetryContext';

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
const ProjectsPage = lazy(() => import('./pages/Projects'));
const FeatureRequests = lazy(() => import('./pages/FeatureRequests'));
const Activities = lazy(() => import('./pages/Activities'));
const ApiBuilder = lazy(() => import('./pages/ApiBuilder'));
const Docs = lazy(() => import('./pages/Docs'));
const NotFound = lazy(() => import('./pages/NotFound'));
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage'));

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="w-full py-16 text-center text-(--vestara-text-muted) animate-pulse">Loading...</div>}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TelemetryProvider>
          <ToastProvider>
          <Routes>
            <Route path="/login" element={<LazyPage><Login /></LazyPage>} />
            <Route element={<ShellLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/overview" element={<LazyPage><Overview /></LazyPage>} />
              <Route path="/dashboard" element={<LazyPage><Dashboard /></LazyPage>} />
              <Route path="/sessions" element={<LazyPage><SessionList /></LazyPage>} />
              <Route path="/sessions/:id" element={<LazyPage><SessionView /></LazyPage>} />
              <Route path="/artifacts" element={<LazyPage><Artifacts /></LazyPage>} />
              <Route path="/agents" element={<LazyPage><Agents /></LazyPage>} />
              <Route path="/chat" element={<LazyPage><ChatPage /></LazyPage>} />
              <Route path="/memory" element={<LazyPage><Memory /></LazyPage>} />
              <Route path="/terminal" element={<LazyPage><TerminalPage /></LazyPage>} />
              <Route path="/ops" element={<LazyPage><OpsCenter /></LazyPage>} />
              <Route path="/projects" element={<LazyPage><ProjectsPage /></LazyPage>} />
              <Route path="/requests" element={<LazyPage><FeatureRequests /></LazyPage>} />
              <Route path="/activities" element={<LazyPage><Activities /></LazyPage>} />
              <Route path="/api-builder" element={<LazyPage><ApiBuilder /></LazyPage>} />
              <Route path="/docs" element={<LazyPage><Docs /></LazyPage>} />
              <Route path="/settings/*" element={<LazyPage><SettingsPage /></LazyPage>} />
              <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
            </Route>
          </Routes>
        </ToastProvider>
        </TelemetryProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
