import { type MouseEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { WorkspaceTabs, type WorkspaceTabItem } from '@vestara/ui-components';
import '../../styles/marketplace.css';
import { marketplaceClient } from '../../lib/marketplace.js';
import AssetDetail from './AssetDetail.js';
import Capabilities from './Capabilities.js';
import Categories from './Categories.js';
import Components from './Components.js';
import Collections from './Collections.js';
import Discover from './Discover.js';
import ExtractorPage from './Extractor/ExtractorPage.js';
import Installed from './Installed.js';
import OperationCenter from './OperationCenter.js';
import Publish from './Publish.js';
import Registries from './Registries.js';
import Templates from './Templates.js';
import Updates from './Updates.js';

interface MarketplaceTab {
  to: string;
  label: string;
  end?: boolean;
  description: string;
}

/** Single underline tab row — every destination is a first-class tab. */
const TABS: MarketplaceTab[] = [
  {
    to: '/marketplace',
    label: 'Discover',
    end: true,
    description: 'Discover and install modules, agents, templates, and tools to extend your Vestara workspace.',
  },
  {
    to: '/marketplace/templates',
    label: 'Templates',
    description:
      'Theme templates merging the extracted Shell Foundation palette with accent color, font family, and font weight.',
  },
  {
    to: '/marketplace/components',
    label: 'UI Components',
    description: 'The Vestara OS component library plus the shared UI, tokens, and primitives packages.',
  },
  {
    to: '/marketplace/capabilities',
    label: 'Capabilities',
    description: 'Inspect Vestara’s capability inventory — what’s active, parked, and available.',
  },
  {
    to: '/marketplace/installed',
    label: 'Installed',
    description: 'Manage installed packages — verify, update, enable, or remove.',
  },
  {
    to: '/marketplace/updates',
    label: 'Updates',
    description: 'Review and apply available package updates.',
  },
  {
    to: '/marketplace/collections',
    label: 'My Collections',
    description: 'Curate installed modules, agents, templates, and tools into your own collections.',
  },
  {
    to: '/marketplace/publish',
    label: 'Publish',
    description: 'Publish a package directory into the marketplace — validated, content-addressed, and indexed.',
  },
  {
    to: '/marketplace/registries',
    label: 'Registries',
    description: 'Monitor registry health and manage package sources.',
  },
  {
    to: '/marketplace/extractor',
    label: 'Extractor',
    description: 'Drop a single-file React artifact and inspect it as an editable component library.',
  },
];

const ASSET_DETAIL_DESCRIPTION = 'Inspect asset details, versions, and install options.';

export default function MarketplaceLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [updateCount, setUpdateCount] = useState(0);
  const [installedCount, setInstalledCount] = useState<number | null>(null);

  useEffect(() => {
    marketplaceClient
      .updates()
      .then((updates) => setUpdateCount(updates.length))
      .catch(() => {});
    marketplaceClient
      .installed()
      .then((installed) => setInstalledCount(installed.length))
      .catch(() => {});
  }, []);

  const activeTab = TABS.find((tab) =>
    tab.end ? pathname === tab.to : pathname === tab.to || pathname.startsWith(`${tab.to}/`),
  );
  const description = activeTab?.description ?? ASSET_DETAIL_DESCRIPTION;

  // Section tabs render through the reusable @vestara/ui-components tab bar,
  // extended with router-agnostic href/onNavigate + count badges.
  const tabItems = useMemo<WorkspaceTabItem[]>(
    () =>
      TABS.map((tab) => ({
        id: tab.to,
        label: tab.label,
        href: tab.to,
        badge:
          tab.label === 'Installed' && installedCount !== null && installedCount > 0
            ? installedCount
            : tab.label === 'Updates' && updateCount > 0
              ? updateCount
              : undefined,
      })),
    [installedCount, updateCount],
  );

  const handleNavigate = useCallback(
    (href: string, event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      navigate(href);
    },
    [navigate],
  );

  return (
    <div className="mpg-page w-full min-w-0 space-y-3">
      {/* ShellLayout owns the page canvas, gutters, and background. Marketplace
          contributes only its navigation and gallery content, like Overview. */}
      {/* Canonical heading sits above the tab navigation (reference hierarchy);
          Discover hides its own duplicate via MarketplacePage hideHeader. */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--vestara-text-primary)]">Marketplace</h1>
        <p className="mt-1 text-sm text-[var(--vestara-text-muted)]">{description}</p>
      </div>
      <header className="mpg-market-header relative z-[2]">
        <WorkspaceTabs
          active={activeTab?.to ?? ''}
          tabs={tabItems}
          onActive={(id) => navigate(id)}
          onNavigate={handleNavigate}
          ariaLabel="Marketplace sections"
        />
      </header>
      <div className="relative z-[2] min-w-0">
        <Routes>
          <Route index element={<Discover />} />
          <Route path="capabilities" element={<Capabilities />} />
          <Route path="publish" element={<Publish />} />
          {/* Categories route kept routable (Discover deep-links) but its tab
              is hidden in favour of Templates. */}
          <Route path="categories" element={<Categories />} />
          <Route path="templates" element={<Templates />} />
          <Route path="components" element={<Components />} />
          <Route path="collections" element={<Collections />} />
          <Route path="installed" element={<Installed />} />
          <Route path="updates" element={<Updates />} />
          <Route path="registries" element={<Registries />} />
          <Route path="extractor" element={<ExtractorPage />} />
          <Route path="assets/:publisher/:name" element={<AssetDetail />} />
        </Routes>
      </div>
      <OperationCenter />
    </div>
  );
}
