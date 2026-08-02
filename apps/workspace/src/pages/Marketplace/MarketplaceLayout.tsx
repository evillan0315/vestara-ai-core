import { NavLink, Route, Routes } from 'react-router-dom';
import AssetDetail from './AssetDetail.js';
import Categories from './Categories.js';
import Discover from './Discover.js';
import Installed from './Installed.js';
import OperationCenter from './OperationCenter.js';
import { muted } from './styles.js';
import Updates from './Updates.js';

const TABS = [
  { to: '/marketplace', label: 'Discover', end: true },
  { to: '/marketplace/categories', label: 'Categories', end: false },
  { to: '/marketplace/installed', label: 'Installed', end: false },
  { to: '/marketplace/updates', label: 'Updates', end: false },
];

export default function MarketplaceLayout() {
  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Marketplace</h1>
        <p className={`text-sm ${muted}`}>Engineering Exchange — discover, install, and update engineering assets.</p>
        <nav className="mt-4 flex gap-2 border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `-mb-px border-b-2 px-3 py-2 text-sm ${isActive ? 'border-sky-500 text-sky-400' : `border-transparent ${muted} hover:text-zinc-200`}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Routes>
        <Route index element={<Discover />} />
        <Route path="categories" element={<Categories />} />
        <Route path="installed" element={<Installed />} />
        <Route path="updates" element={<Updates />} />
        <Route path="assets/:publisher/:name" element={<AssetDetail />} />
      </Routes>
      <OperationCenter />
    </div>
  );
}
