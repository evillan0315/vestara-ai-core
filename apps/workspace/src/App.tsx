import { Navigate, Route, Routes } from 'react-router-dom';
import ShellLayout from './layouts/ShellLayout';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './lib/theme';
import ErrorBoundary from './components/ErrorBoundary';
import Agents from './pages/Agents';
import Artifacts from './pages/Artifacts';
import Dashboard from './pages/Dashboard';
import Overview from './pages/Overview';
import Login from './pages/Login';
import Memory from './pages/Memory';
import SessionList, { SessionView } from './pages/SessionList';
import TerminalPage from './pages/Terminal';
import ChatPage from './pages/ChatPage';
import ProjectsPage from './pages/Projects';
import OpsCenter from './pages/OpsCenter';
import SettingsPage from './pages/Settings/SettingsPage';
import FeatureRequests from './pages/FeatureRequests';
import Logs from './pages/Logs';
import ApiBuilder from './pages/ApiBuilder';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ShellLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/overview"
                element={
                  <ErrorBoundary>
                    <Overview />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ErrorBoundary>
                    <Dashboard />
                  </ErrorBoundary>
                }
              />
              <Route path="/sessions" element={<SessionList />} />
              <Route path="/sessions/:id" element={<SessionView />} />
              <Route path="/artifacts" element={<Artifacts />} />
              <Route
                path="/agents"
                element={
                  <ErrorBoundary>
                    <Agents />
                  </ErrorBoundary>
                }
              />
              <Route path="/memory" element={<Memory />} />
              <Route path="/terminal" element={<TerminalPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route
                path="/projects"
                element={
                  <ErrorBoundary>
                    <ProjectsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/ops"
                element={
                  <ErrorBoundary>
                    <OpsCenter />
                  </ErrorBoundary>
                }
              />
              <Route path="/settings/*" element={<SettingsPage />} />
              <Route
                path="/requests"
                element={
                  <ErrorBoundary>
                    <FeatureRequests />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/logs"
                element={
                  <ErrorBoundary>
                    <Logs />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/api-builder"
                element={
                  <ErrorBoundary>
                    <ApiBuilder />
                  </ErrorBoundary>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
