import { Outlet } from 'react-router-dom';

import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ViewTimelineRoundedIcon from '@mui/icons-material/ViewTimelineRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import ApiRoundedIcon from '@mui/icons-material/ApiRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';

import AppHeader from '../components/layout/AppHeader/AppHeader';
import AppSidebar from '../components/layout/AppSidebar/AppSidebar';
import PageContainer from '../components/layout/Page/PageContainer';
import CommandPalette from '../components/layout/CommandPalette/CommandPalette';

import type { NavigationSection } from '../components/layout/AppSidebar/SidebarNavigation';

export const NAV_CATEGORIES: NavigationSection[] = [
  {
    title: 'Workspace',
    items: [
      {
        to: '/overview',
        title: 'Overview',
        icon: <DashboardRoundedIcon fontSize="small" />,
      },
      {
        to: '/dashboard',
        title: 'Dashboard',
        icon: <DashboardRoundedIcon fontSize="small" />,
      },
      {
        to: '/ops',
        title: 'Operations',
        icon: <TuneRoundedIcon fontSize="small" />,
      },
    ],
    icon: undefined,
  },
  {
    title: 'Engineering',
    items: [
      {
        to: '/sessions',
        title: 'Sessions',
        icon: <ViewTimelineRoundedIcon fontSize="small" />,
      },
      {
        to: '/artifacts',
        title: 'Artifacts',
        icon: <DescriptionRoundedIcon fontSize="small" />,
      },
      {
        to: '/projects',
        title: 'Projects',
        icon: <FolderRoundedIcon fontSize="small" />,
      },
      {
        to: '/requests',
        title: 'Requests',
        icon: <LightbulbRoundedIcon fontSize="small" />,
      },
      {
        to: '/logs',
        title: 'Logs',
        icon: <ReceiptLongRoundedIcon fontSize="small" />,
      },
    ],
    icon: undefined,
  },
  {
    title: 'Agents',
    items: [
      {
        to: '/agents',
        title: 'Agent Control',
        icon: <SmartToyRoundedIcon fontSize="small" />,
      },
      {
        to: '/memory',
        title: 'Knowledge',
        icon: <MemoryRoundedIcon fontSize="small" />,
      },
    ],
    icon: undefined,
  },
  {
    title: 'Tools',
    items: [
      {
        to: '/chat',
        title: 'Chat',
        icon: <ChatRoundedIcon fontSize="small" />,
      },
      {
        to: '/terminal',
        title: 'Terminal',
        icon: <TerminalRoundedIcon fontSize="small" />,
      },
      {
        to: '/api-builder',
        title: 'API Builder',
        icon: <ApiRoundedIcon fontSize="small" />,
      },
    ],
    icon: undefined,
  },
  {
    title: 'System',
    items: [
      {
        to: '/settings',
        title: 'Settings',
        icon: <SettingsRoundedIcon fontSize="small" />,
      },
    ],
    icon: undefined,
  },
];

export default function ShellLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-primary-950">
      <AppSidebar navigation={NAV_CATEGORIES} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />

        <PageContainer>
          <Outlet />
        </PageContainer>
      </div>

      <CommandPalette />
    </div>
  );
}
