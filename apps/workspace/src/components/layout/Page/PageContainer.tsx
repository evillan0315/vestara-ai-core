import type { PropsWithChildren } from 'react';

export interface PageContainerProps extends PropsWithChildren {
  fluid?: boolean;
}

export default function PageContainer({ children, fluid = false }: PageContainerProps) {
  return (
    <main className="flex-1 overflow-auto bg-zinc-950">
      <div className={['mx-auto w-full px-6 py-6', fluid ? 'max-w-none' : 'max-w-[1800px]'].join(' ')}>{children}</div>
    </main>
  );
}
