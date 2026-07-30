import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

import AppHeader from '../components/layout/AppHeader/AppHeader';
import AppSidebar from '../components/layout/AppSidebar/AppSidebar';
import CommandPalette from '../components/layout/CommandPalette/CommandPalette';
import KeyboardShortcutsModal from '../components/layout/KeyboardShortcutsModal';
import PageContainer from '../components/layout/Page/PageContainer';
import { NAV_CATEGORIES } from './navigation';

export default function ShellLayout() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('vestara-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

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
    <div className="flex h-screen overflow-hidden bg-primary-950">
      <AppSidebar navigation={NAV_CATEGORIES} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />

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
  );
}
