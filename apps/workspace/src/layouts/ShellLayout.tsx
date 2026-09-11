import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
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
import { NAV_CATEGORIES, getDogfoodNavigation } from './navigation';

/**
 * Determine navigation based on runtime profile.
 * Dogfood profile filters out parked capabilities from sidebar.
 */
function useNavigation() {
  const [navigation, setNavigation] = useState(NAV_CATEGORIES);

  useEffect(() => {
    // Fetch the runtime profile from the API to determine filtering
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: Record<string, unknown>) => {
        // The health endpoint doesn't expose profile directly.
        // Check if the runtime profile env var was set on the server.
        // For now, use a simple heuristic: if Boot Runtime is absent,
        // we're in dogfood mode. This is determined at server boot.
        // A cleaner approach would be a /api/config endpoint.
        // For this milestone, we check the catalog endpoint which is
        // only available when the catalog route is registered.
        return fetch('/api/catalog');
      })
      .then((res) => {
        if (res.ok) {
          // Catalog endpoint exists — we're in a profile that has catalog support
          // Check if we should filter for dogfood
          return res.json();
        }
        throw new Error('no catalog');
      })
      .then((data: Record<string, unknown>) => {
        const profileId = data.profileId as string | undefined;
        if (profileId === 'dogfood') {
          setNavigation(getDogfoodNavigation());
        }
      })
      .catch(() => {
        // Catalog not available or error — use full navigation
      });
  }, []);

  return navigation;
}

export default function ShellLayout() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('vestara-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const navigation = useNavigation();

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('vestara-sidebar-collapsed', String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const check = () => {
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        setShowShortcuts((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <GraphProvider>
      <SurfaceContextProvider>
        <div className="flex h-screen overflow-hidden bg-primary-950">
          <AppSidebar navigation={navigation} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />

          <div className="flex min-w-0 flex-1 flex-col min-h-0">
            <AppHeader onMenuClick={toggleSidebar} />
            <PageContainer>
              <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-8 w-full h-full">
                <Outlet />
              </div>
            </PageContainer>
          </div>

          <CommandPalette />
          <KeyboardShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
        </div>
        <Inspector />
        <GraphSearch />
        <GlobalAssistant />
      </SurfaceContextProvider>
    </GraphProvider>
  );
}
