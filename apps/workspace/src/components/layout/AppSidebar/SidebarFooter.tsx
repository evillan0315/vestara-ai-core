import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';

import KeyboardRounded from '@mui/icons-material/KeyboardRounded';
import type { FC } from 'react';

export interface SidebarFooterProps {
  version: string;
  onCollapse?: () => void;
}

const SidebarFooter: FC<SidebarFooterProps> = ({ version, onCollapse }) => {
  return (
    <div className="space-y-3 border-t border-(--vestara-accent-border) px-2 py-3">
      <div
        className="
          flex
          items-center
          justify-between
          rounded-xl
 
          px-3
          py-2
          border

        "
        style={{
          //color: "var(--vestara-accent)",
          background: 'var(--vestara-accent-bg)',
          borderColor: 'var(--vestara-accent-border)',
        }}
      >
        <div className="flex items-center gap-2 text-xs text-zinc-500   border-color-(--vestara-accent-border)">
          <KeyboardRounded fontSize="small" />
          Shortcuts
        </div>

        <kbd
          className="
            rounded
            border
     
            px-1.5
            py-0.5
            text-[10px]
            text-zinc-300
          "
          style={{
            //color: "var(--vestara-accent)",
            background: 'var(--vestara-accent-bg)',
            borderColor: 'var(--vestara-accent-border)',
          }}
        >
          ?
        </kbd>
      </div>

      <div className="text-center text-[9px] text-accent-700">VESTARA Technology {version}</div>
    </div>
  );
};

export default SidebarFooter;
