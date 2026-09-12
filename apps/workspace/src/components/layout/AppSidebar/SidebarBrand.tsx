import type { FC } from 'react';
import { Link } from 'react-router-dom';

import Logo from '../../../components/Logo';

interface SidebarBrandProps {
  collapsed: boolean;
}

const SidebarBrand: FC<SidebarBrandProps> = ({ collapsed }) => {
  return (
    <Link
      to="/dashboard"
      className="flex items-center justify-center border-b border-(--vestara-accent-border) px-3 py-2 transition-colors"
    >
      <div className="min-w-0">
        {/* No src → themed inline mark that follows the selected accent */}
        <Logo collapsed={collapsed} showText={!collapsed} orientation="horizontal" size={collapsed ? 32 : 46} />
      </div>
    </Link>
  );
};

export default SidebarBrand;
