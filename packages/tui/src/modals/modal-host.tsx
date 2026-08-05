import type { TuiSemanticPalette } from '@vestara/design-system';
import { type ReactNode, useEffect } from 'react';
import type { KeyboardRouter } from '../hooks/use-keyboard-router.js';
import { ModalLayer } from './modal-layer.js';
import { useModal } from './modal-provider.js';

export interface ModalHostProps {
  readonly palette: TuiSemanticPalette;
  readonly onRequestOpen: (kind: 'command-palette' | 'runtime-config') => void;
  readonly router: KeyboardRouter;
  readonly children: ReactNode;
}

export function ModalHost(props: ModalHostProps): ReactNode {
  const { modals, close } = useModal();

  useEffect(() => {
    return props.router.register('modal', (key) => {
      if (!modals.length) return 'unhandled';
      if (key.name === 'escape') {
        close();
        return 'handled';
      }
      return 'unhandled';
    });
  }, [props.router, modals.length, close]);

  return (
    <>
      {props.children}
      {modals.length ? <ModalLayer palette={props.palette} onClose={() => close()} router={props.router} /> : null}
    </>
  );
}

export function useTopModal(): { title: string | undefined; count: number } {
  const { modals } = useModal();
  const top = modals.at(-1);
  return { title: top?.title, count: modals.length };
}
