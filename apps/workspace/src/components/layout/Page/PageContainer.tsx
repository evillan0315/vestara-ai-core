import type { PropsWithChildren } from 'react';

export interface PageContainerProps extends PropsWithChildren {
  fluid?: boolean;
}

export default function PageContainer({ children, fluid = false }: PageContainerProps) {
  return (
    <main className="shell-canvas flex-1 overflow-auto bg-(--vestara-shell-bg)">
       <div className={['flex h-full min-h-0 min-w-0 flex-col mx-auto w-full', fluid ? 'max-w-none' : 'max-w-[var(--vestara-page-max-width)]'].join(' ')}>{children}</div>
    </main>
  );
}
