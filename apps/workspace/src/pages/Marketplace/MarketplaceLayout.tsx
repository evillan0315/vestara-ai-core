import { NavLink, Route, Routes } from 'react-router-dom';
import '../../styles/marketplace.css';
import AssetDetail from './AssetDetail.js';
import Capabilities from './Capabilities.js';
import Categories from './Categories.js';
import Discover from './Discover.js';
import Installed from './Installed.js';
import OperationCenter from './OperationCenter.js';
import Publish from './Publish.js';
import Registries from './Registries.js';
import Updates from './Updates.js';

const TABS = [
  { to: '/marketplace', label: 'Discover', end: true },
  { to: '/marketplace/capabilities', label: 'Capabilities', end: false },
  { to: '/marketplace/publish', label: 'Publish', end: false },
  { to: '/marketplace/categories', label: 'Categories', end: false },
  { to: '/marketplace/installed', label: 'Installed', end: false },
  { to: '/marketplace/updates', label: 'Updates', end: false },
  { to: '/marketplace/registries', label: 'Registries', end: false },
];

export default function MarketplaceLayout() {
  return (
    <div className="mpg-chamber">
      <header className="mpg-market-header relative z-[2] mb-6">
        <h1 className="text-xl font-semibold text-[var(--vestara-text-primary,var(--color-zinc-100))]">
          Marketplace
        </h1>
        <p className="text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">
          Engineering Exchange — discover, install, and update engineering assets.
        </p>
        <nav className="mpg-market-tabs mt-4" aria-label="Marketplace sections">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) => `mpg-market-tab ${isActive ? 'mpg-market-tab-active' : ''}`}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="relative z-[2]">
        <Routes>
          <Route index element={<Discover />} />
          <Route path="capabilities" element={<Capabilities />} />
          <Route path="publish" element={<Publish />} />
          <Route path="categories" element={<Categories />} />
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
