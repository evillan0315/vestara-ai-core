import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import '../../styles/marketplace.css';
import { marketplaceClient } from '../../lib/marketplace.js';
import AssetDetail from './AssetDetail.js';
import Capabilities from './Capabilities.js';
import Categories from './Categories.js';
import Collections from './Collections.js';
import Discover from './Discover.js';
import Installed from './Installed.js';
import OperationCenter from './OperationCenter.js';
import Publish from './Publish.js';
import Registries from './Registries.js';
import Updates from './Updates.js';

/** Primary tabs mirror the Discover reference (Discover-first gallery). */
const PRIMARY_TABS = [
  { to: '/marketplace', label: 'Discover', end: true },
  { to: '/marketplace/installed', label: 'Installed', end: false },
  { to: '/marketplace/updates', label: 'Updates', end: false },
  { to: '/marketplace/collections', label: 'My Collections', end: false },
];

/** Advanced destinations stay reachable; they are not primary Discover tabs. */
const SECONDARY_LINKS = [
  { to: '/marketplace/capabilities', label: 'Capabilities' },
  { to: '/marketplace/categories', label: 'Categories' },
  { to: '/marketplace/publish', label: 'Publish' },
  { to: '/marketplace/registries', label: 'Registries' },
];

export default function MarketplaceLayout() {
  const [updateCount, setUpdateCount] = useState(0);

  useEffect(() => {
    marketplaceClient
      .updates()
      .then((updates) => setUpdateCount(updates.length))
      .catch(() => {});
  }, []);

  return (
    <div className="mpg-page w-full min-w-0 space-y-3 p-[var(--vestara-spacing-page)]">
      {/* ShellLayout owns the page canvas, gutters, and background. Marketplace
          contributes only its navigation and gallery content, like Overview. */}
      {/* Canonical heading sits above the tab navigation (reference hierarchy);
          Discover hides its own duplicate via MarketplacePage hideHeader. */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--vestara-text-primary)]">Marketplace</h1>
        <p className="mt-1 text-sm text-[var(--vestara-text-muted)]">
          Discover and install modules, agents, templates, and tools to extend your Vestara workspace.
        </p>
      </div>
      <header className="mpg-market-header relative z-[2]">
        <nav className="mpg-market-tabs" aria-label="Marketplace sections">
          {PRIMARY_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) => `mpg-market-tab ${isActive ? 'mpg-market-tab-active' : ''}`}
            >
              {tab.label}
              {tab.label === 'Updates' && updateCount > 0 && (
                <span className="mpg-tab-badge" aria-label={`${updateCount} updates available`}>
                  {updateCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <nav className="mpg-market-advanced" aria-label="Advanced marketplace sections">
          {SECONDARY_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className="mpg-market-advanced-link">
              {link.label}
            </NavLink>
          ))}
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
          <Route path="assets/:publisher/:name" element={<AssetDetail />} />
        </Routes>
      </div>
      <OperationCenter />
    </div>
  );
}
