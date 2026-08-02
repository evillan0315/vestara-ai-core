import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import ApiRoundedIcon from '@mui/icons-material/ApiRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import DnsRoundedIcon from '@mui/icons-material/DnsRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import HubRoundedIcon from '@mui/icons-material/HubRounded';
import ImportContactsRoundedIcon from '@mui/icons-material/ImportContactsRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ViewTimelineRoundedIcon from '@mui/icons-material/ViewTimelineRounded';
import type { ReactNode } from 'react';

export interface NavigationItem {
  to: string;
  title: string;
  icon: ReactNode;
  description?: string;
  badge?: string | number;
}

export interface NavigationSection {
  title: string;
  icon?: ReactNode;
  items: NavigationItem[];
}

export const NAV_CATEGORIES: NavigationSection[] = [
  {
    title: 'Workspace',
    items: [
      { to: '/overview', title: 'Overview', icon: <DashboardRoundedIcon fontSize="small" /> },
      { to: '/dashboard', title: 'Dashboard', icon: <DashboardRoundedIcon fontSize="small" /> },
      { to: '/graph', title: 'Engineering Graph', icon: <AccountTreeRoundedIcon fontSize="small" /> },
      { to: '/marketplace', title: 'Marketplace', icon: <StorefrontRoundedIcon fontSize="small" /> },
      { to: '/external-runtimes', title: 'External Runtimes', icon: <DnsRoundedIcon fontSize="small" /> },
      { to: '/execution', title: 'Execution', icon: <HubRoundedIcon fontSize="small" /> },
      { to: '/diagnostics', title: 'Diagnostics', icon: <InsightsRoundedIcon fontSize="small" /> },
      { to: '/activities', title: 'Activities', icon: <ReceiptLongRoundedIcon fontSize="small" /> },
      { to: '/ops', title: 'Operations', icon: <TuneRoundedIcon fontSize="small" /> },
    ],
  },
  {
    title: 'Engineering',
    items: [
      { to: '/sessions', title: 'Sessions', icon: <ViewTimelineRoundedIcon fontSize="small" /> },
      { to: '/artifacts', title: 'Artifacts', icon: <DescriptionRoundedIcon fontSize="small" /> },
      { to: '/projects', title: 'Projects', icon: <FolderRoundedIcon fontSize="small" /> },
      { to: '/orchestration', title: 'Orchestration', icon: <AccountTreeRoundedIcon fontSize="small" /> },
      { to: '/evidence', title: 'Evidence', icon: <DescriptionRoundedIcon fontSize="small" /> },
      { to: '/workers', title: 'Workers', icon: <DnsRoundedIcon fontSize="small" /> },
      { to: '/requests', title: 'Requests', icon: <LightbulbRoundedIcon fontSize="small" /> },
    ],
  },
  {
    title: 'Agents',
    items: [
      { to: '/workforce', title: 'Workforce', icon: <GroupsRoundedIcon fontSize="small" /> },
      { to: '/agents', title: 'Agent Control', icon: <SmartToyRoundedIcon fontSize="small" /> },
      { to: '/routing', title: 'Routing', icon: <RouteRoundedIcon fontSize="small" /> },
      { to: '/memory', title: 'Knowledge', icon: <MemoryRoundedIcon fontSize="small" /> },
    ],
  },
  {
    title: 'Tools',
    items: [
      { to: '/chat', title: 'Chat', icon: <ChatRoundedIcon fontSize="small" /> },
      { to: '/terminal', title: 'Terminal', icon: <TerminalRoundedIcon fontSize="small" /> },
      { to: '/api-builder', title: 'API Builder', icon: <ApiRoundedIcon fontSize="small" /> },
      { to: '/docs', title: 'Docs', icon: <ImportContactsRoundedIcon fontSize="small" /> },
    ],
  },
  {
    title: 'System',
    items: [{ to: '/settings', title: 'Settings', icon: <SettingsRoundedIcon fontSize="small" /> }],
  },
];
