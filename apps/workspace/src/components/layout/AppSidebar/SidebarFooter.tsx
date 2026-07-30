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
        className="flex items-center justify-center rounded-xl border px-2 py-2"
        style={{
          background: 'var(--vestara-accent-bg)',
          borderColor: 'var(--vestara-accent-border)',
        }}
      >
        <KeyboardRounded fontSize="small" className="text-zinc-500" />
        {!collapsed && (
          <span className="ml-2 text-xs text-zinc-500">Shortcuts</span>
        )}
        <kbd
          className={`rounded border px-1.5 py-0.5 text-[10px] text-zinc-300 ${collapsed ? 'ml-0' : 'ml-auto'}`}
          style={{
            background: 'var(--vestara-accent-bg)',
            borderColor: 'var(--vestara-accent-border)',
          }}
        >
          ?
        </kbd>
      </div>

      {!collapsed && (
        <div className="text-center text-[9px] text-accent-700">VESTARA Technology {version}</div>
      )}
    </div>
  );
};

export default SidebarFooter;
