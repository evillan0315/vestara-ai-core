import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import { type FC, useRef } from 'react';
import { Link } from 'react-router-dom';

const DEFAULT_LOGO = '/logo.svg';

import Logo from '../../../components/Logo';

const SidebarBrand: FC = () => {
  return (
    <Link
      to="/dashboard"
      className="
        flex
        items-center
        gap-3
        px-3
        py-2
        border-b
       border-(--vestara-accent-border) 
    
        transition-colors
      "
    >
      <div className="min-w-0">
        <Logo src={DEFAULT_LOGO} collapsed={true} showText={true} orientation="horizontal" size={46} />
      </div>
    </Link>
  );
};

export default SidebarBrand;
