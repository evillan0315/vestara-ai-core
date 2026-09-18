import type { FC } from 'react';
import KeyboardRounded from '@mui/icons-material/KeyboardRounded';

export interface SidebarFooterProps {
  version: string;
  collapsed?: boolean;
}

const SidebarFooter: FC<SidebarFooterProps> = ({ version, collapsed }) => {
  return (
    <div className="space-y-3 border-t border-(--vestara-accent-border) px-2 py-3">
      <div
        className="flex items-center justify-center rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-2 py-2"
      >
        <KeyboardRounded fontSize="small" className="text-(--vestara-text-secondary)" />
        {!collapsed && (
          <span className="ml-2 text-xs text-(--vestara-text-secondary)">Shortcuts</span>
        )}
        <kbd
          className={`rounded border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-1.5 py-0.5 text-[10px] text-(--vestara-text) ${collapsed ? 'ml-0' : 'ml-auto'}`}
        >
          ?
        </kbd>
      </div>

      {!collapsed && (
        <div className="text-center text-[9px] text-(--vestara-accent-text)">VESTARA Technology {version}</div>
      )}
    </div>
  );
};

export default SidebarFooter;
