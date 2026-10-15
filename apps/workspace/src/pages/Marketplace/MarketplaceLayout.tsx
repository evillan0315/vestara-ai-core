import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import '../../styles/marketplace.css';
import { marketplaceClient } from '../../lib/marketplace.js';
import AssetDetail from './AssetDetail.js';
import Capabilities from './Capabilities.js';
import Categories from './Categories.js';
import Collections from './Collections.js';
import Discover from './Discover.js';
import ExtractorPage from './Extractor/ExtractorPage.js';
import Installed from './Installed.js';
import OperationCenter from './OperationCenter.js';
import Publish from './Publish.js';
import Registries from './Registries.js';
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
    to: '/marketplace/categories',
    label: 'Categories',
    description: 'Browse assets by category to discover what’s available.',
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

function renderTab(
  tab: MarketplaceTab,
  badge: { installedCount: number | null; updateCount: number },
) {
  return (
    <NavLink
      key={tab.to}
      to={tab.to}
      end={tab.end}
      className={({ isActive }) => `mpg-market-tab ${isActive ? 'mpg-market-tab-active' : ''}`}
    >
      {tab.label}
      {tab.label === 'Installed' && badge.installedCount !== null && badge.installedCount > 0 && (
        <span className="mpg-tab-count" aria-label={`${badge.installedCount} installed`}>
          {badge.installedCount}
        </span>
      )}
      {tab.label === 'Updates' && badge.updateCount > 0 && (
        <span className="mpg-tab-count" aria-label={`${badge.updateCount} updates available`}>
          {badge.updateCount}
        </span>
      )}
    </NavLink>
  );
}

export default function MarketplaceLayout() {
  const { pathname } = useLocation();
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
  const badge = { installedCount, updateCount };

  return (
    <div className="mpg-page w-full min-w-0 space-y-3 p-[var(--vestara-spacing-page)]">
      {/* ShellLayout owns the page canvas, gutters, and background. Marketplace
          contributes only its navigation and gallery content, like Overview. */}
      {/* Canonical heading sits above the tab navigation (reference hierarchy);
          Discover hides its own duplicate via MarketplacePage hideHeader. */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--vestara-text-primary)]">Marketplace</h1>
        <p className="mt-1 text-sm text-[var(--vestara-text-muted)]">{description}</p>
      </div>
      <header className="mpg-market-header relative z-[2]">
        <nav className="mpg-market-tabs" aria-label="Marketplace sections">
          {TABS.map((tab) => renderTab(tab, badge))}
        </nav>
      </header>
      <div className="relative z-[2] min-w-0">
        <Routes>
          <Route index element={<Discover />} />
          <Route path="capabilities" element={<Capabilities />} />
          <Route path="publish" element={<Publish />} />
          <Route path="categories" element={<Categories />} />
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
