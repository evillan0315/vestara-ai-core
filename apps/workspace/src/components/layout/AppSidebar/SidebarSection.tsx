import type { FC, PropsWithChildren } from 'react';

export interface SidebarSectionProps extends PropsWithChildren {
  title: string;
}

const SidebarSection: FC<SidebarSectionProps> = ({ title, children }) => {
  return (
    <section className="space-y-2">
      <div className="px-4">
        <h2
          className="
            text-[10px]
            font-semibold
            uppercase
            tracking-[0.18em]
            text-zinc-600
          "
        >
          {title}
        </h2>
      </div>

      <div className="space-y-1">{children}</div>
    </section>
  );
};

export default SidebarSection;
