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
        <ShellRoot
          sidebar={
            <AppSidebar
              navigation={navigation}
              collapsed={desktopSidebarCollapsed}
              mobileOpen={mobileSidebarOpen}
              onToggleCollapse={toggleDesktopSidebar}
              onShortcuts={() => setShowShortcuts(true)}
            />
          }
          header={<AppHeader mobileSidebarOpen={mobileSidebarOpen} onMenuClick={toggleMobileSidebar} />}
          mobileSidebarOpen={mobileSidebarOpen}
          onCloseMobileSidebar={closeMobileSidebar}
        >
          {/* Global breadcrumb presentation hidden: page content begins
              directly below the top bar. Route metadata, titles, navigation,
              and the useBreadcrumbs resolver are untouched — only the shared
              visual surface is removed. Pages keep their own heroes/headers. */}
          <PageContainer fluid>
            <Outlet />
          </PageContainer>
        </ShellRoot>

        <CommandPalette />
        <KeyboardShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
        <Inspector />
        <GraphSearch />
        <GlobalAssistant />
      </SurfaceContextProvider>
    </GraphProvider>
  );
}
