import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { GraphProvider } from '../components/graph/GraphContext';
import { GraphSearch } from '../components/graph/GraphSearch';
import { Inspector } from '../components/graph/Inspector';
import { GlobalAssistant } from '../components/assistant/GlobalAssistant';
import { SurfaceContextProvider } from '../contexts/SurfaceContext';
import AppHeader from '../components/layout/AppHeader/AppHeader';
import AppSidebar from '../components/layout/AppSidebar/AppSidebar';
import CommandPalette from '../components/layout/CommandPalette/CommandPalette';
import KeyboardShortcutsModal from '../components/layout/KeyboardShortcutsModal';
import PageContainer from '../components/layout/Page/PageContainer';

import { useWorkspaceNavigation } from '../lib/navigation-store.js';
import ShellRoot from './ShellRoot';
import GlobalDrawerHost from './GlobalDrawerHost';
import { GlobalDrawerProvider } from '../contexts/GlobalDrawerContext';
import { DesktopShell } from '../features/desktop-shell/DesktopShell';

/**
 * Workspace navigation comes from the canonical registry
 * (layouts/workspace-navigation.ts) + user CRUD (lib/navigation-store.ts).
 * Dogfood capability filtering lives inside the store hook.
 */
function useNavigation() {
  return useWorkspaceNavigation();
}

export default function ShellLayout() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('vestara-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const navigation = useNavigation();
  const location = useLocation();

  /**
   * VES-UI-001 T4: DesktopShell gate. `?shell=desktop` runs the routed page
   * inside the boot → login → desktop state machine (`DesktopShell`);
   * without it the shell renders directly (existing behavior unchanged).
   */
  const desktopShellEnabled = new URLSearchParams(location.search).get('shell') === 'desktop';

  const toggleDesktopSidebar = () => {
    setDesktopSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('vestara-sidebar-collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const toggleMobileSidebar = () => {
    setMobileSidebarOpen((prev) => !prev);
  };

  const closeMobileSidebar = () => {
    setMobileSidebarOpen(false);
  };

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileSidebarOpen) {
        setMobileSidebarOpen(false);
        return;
      }

      if (e.key === '?' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        setShowShortcuts((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mobileSidebarOpen]);

  return (
    <GraphProvider>
      <SurfaceContextProvider>
        <GlobalDrawerProvider>
        <ShellRoot
          sidebar={
            <AppSidebar
              navigation={navigation}
              collapsed={desktopSidebarCollapsed}
              mobileOpen={mobileSidebarOpen}
              onToggleCollapse={toggleDesktopSidebar}
              onShortcuts={() => setShowShortcuts(true)}
              onNavigate={closeMobileSidebar}
            />
          }
          header={<AppHeader mobileSidebarOpen={mobileSidebarOpen} onMenuClick={toggleMobileSidebar} version="v1.0.0" />}
          mobileSidebarOpen={mobileSidebarOpen}
          onCloseMobileSidebar={closeMobileSidebar}
        >
          {/* Global breadcrumb presentation hidden: page content begins
              directly below the top bar. Route metadata, titles, navigation,
              and the useBreadcrumbs resolver are untouched — only the shared
              visual surface is removed. Pages keep their own heroes/headers. */}
          {desktopShellEnabled ? (
            <DesktopShell>
              <PageContainer fluid>
                <Outlet />
              </PageContainer>
            </DesktopShell>
          ) : (
            <PageContainer fluid>
              <Outlet />
            </PageContainer>
          )}
        </ShellRoot>

        <CommandPalette />
        <KeyboardShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
        <Inspector />
        <GraphSearch />
        <GlobalDrawerHost />
        <GlobalAssistant />
        </GlobalDrawerProvider>
      </SurfaceContextProvider>
    </GraphProvider>
  );
}
