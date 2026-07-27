import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '◈' },
  { to: '/sessions', label: 'Sessions', icon: '▸' },
  { to: '/artifacts', label: 'Artifacts', icon: '◇' },
  { to: '/agents', label: 'Agents', icon: '☰' },
  { to: '/memory', label: 'Memory', icon: '◎' },
];

export default function Sidebar() {
  return (
    <nav className="w-56 border-r border-zinc-800 bg-zinc-950 p-4 flex flex-col gap-1">
      <div className="text-vestara-gold font-bold text-lg mb-6 px-2">Vestara</div>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`
          }
        >
          <span>{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
