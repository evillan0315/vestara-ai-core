import type { PropsWithChildren } from 'react';

export interface PageContainerProps extends PropsWithChildren {
  fluid?: boolean;
}

export default function PageContainer({ children, fluid = false }: PageContainerProps) {
  return (
    <main className="shell-canvas flex-1 overflow-auto bg-(--vestara-shell-bg)">
      <div className={['h-full mx-auto w-full', fluid ? 'max-w-none' : 'max-w-[1800px]'].join(' ')}>{children}</div>
    </main>
  );
}
