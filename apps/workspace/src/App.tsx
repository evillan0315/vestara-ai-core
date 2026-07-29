import { Navigate, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./components/Toast";
import ShellLayout from "./layouts/ShellLayout";
import { ThemeProvider } from "./lib/theme";
import Agents from "./pages/Agents";
import ApiBuilder from "./pages/ApiBuilder";
import Artifacts from "./pages/Artifacts";
import ChatPage from "./pages/ChatPage";
import Dashboard from "./pages/Dashboard";
import Docs from "./pages/Docs";
import FeatureRequests from "./pages/FeatureRequests";
import Login from "./pages/Login";
import Logs from "./pages/Logs";
import Memory from "./pages/Memory";
import NotFound from "./pages/NotFound";
import NotificationsPage from "./pages/Notifications";
import OpsCenter from "./pages/OpsCenter";
import Overview from "./pages/Overview";
import ProjectsPage from "./pages/Projects";
import SessionList, { SessionView } from "./pages/SessionList";
import SettingsPage from "./pages/Settings/SettingsPage";
import TerminalPage from "./pages/Terminal";

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
              <Route path="/notifications" element={<NotificationsPage />} />
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
              <Route
                path="/docs"
                element={
                  <ErrorBoundary>
                    <Docs />
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
