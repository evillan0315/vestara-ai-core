import type { TuiRenderer } from '@vestara/tui-renderer';
import type { ReactNode } from 'react';

/**
 * Mount a React tree on a TuiRenderer and keep the process alive until the
 * renderer is destroyed or a termination signal arrives. Guarantees the
 * terminal is restored even on SIGINT/SIGTERM/SIGHUP.
 */
export async function renderRoot(renderer: TuiRenderer, app: ReactNode): Promise<void> {
  await renderer.start();

  let settled = false;
  let resolveExit!: () => void;
  const exitPromise = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  const destroy = () => {
    if (settled) return;
    settled = true;
    void renderer.stop().then(resolveExit, resolveExit);
  };

  const unsubscribeDestroy = renderer.onDestroy(() => destroy());

  const onSignal = () => destroy();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  process.once('SIGHUP', onSignal);

  try {
    renderer.render(app);
    await exitPromise;
  } finally {
    unsubscribeDestroy();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    process.off('SIGHUP', onSignal);
  }
}
