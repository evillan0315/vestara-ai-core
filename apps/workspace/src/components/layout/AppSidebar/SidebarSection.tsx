import type { FC, PropsWithChildren } from 'react';

export interface SidebarSectionProps extends PropsWithChildren {
  title: string;
  collapsed?: boolean;
}

const SidebarSection: FC<SidebarSectionProps> = ({ title, collapsed, children }) => {
  return (
    <section className="space-y-2">
      {/* Unlabeled (curated flat) sections render no header — matches the
          mock sidebar: one list with a divider, no group chrome. */}
      {!collapsed && title !== '' && (
        <div className="px-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
            {title}
          </h2>
        </div>
      )}
      <div className={collapsed ? 'space-y-1 px-1' : 'space-y-1'}>{children}</div>
    </section>
  );
};

export default SidebarSection;
