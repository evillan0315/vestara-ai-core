import type { TuiSemanticPalette } from '@vestara/design-system';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
import type { KeyboardRouter } from '../hooks/use-keyboard-router.js';

export interface ModalFrameContentProps {
  palette: TuiSemanticPalette;
  close: () => void;
  router: KeyboardRouter;
}

export interface ModalDefinition {
  readonly id: string;
  readonly title: string;
  readonly shortcut?: string;
  readonly renderContent: (props: ModalFrameContentProps) => ReactNode;
  readonly renderFooter?: (props: ModalFrameContentProps) => ReactNode;
  readonly width?: 'narrow' | 'standard' | 'wide';
}

export interface ModalContextValue {
  readonly modals: readonly ModalDefinition[];
  readonly open: (definition: ModalDefinition) => string;
  readonly close: () => void;
  readonly closeAll: () => void;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export function useModal(): ModalContextValue {
  const value = useContext(ModalContext);
  if (!value) throw new Error('useModal must be used inside ModalProvider');
  return value;
}

export interface ModalProviderProps {
  readonly children: ReactNode;
}

export function ModalProvider(props: ModalProviderProps): ReactNode {
  const [modals, setModals] = useState<readonly ModalDefinition[]>([]);

  const open = useCallback((definition: ModalDefinition) => {
    setModals((current) => [...current, definition]);
    return definition.id;
  }, []);

  const close = useCallback(() => {
    setModals((current) => (current.length ? current.slice(0, -1) : current));
  }, []);

  const closeAll = useCallback(() => {
    setModals([]);
  }, []);

  const value: ModalContextValue = { modals, open, close, closeAll };
  return <ModalContext.Provider value={value}>{props.children}</ModalContext.Provider>;
}
