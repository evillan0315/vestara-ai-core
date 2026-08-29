import type { TuiSemanticPalette } from '@vestara/design-system';
import { useTerminalDimensions } from '@vestara/tui-renderer';
import type { ReactNode } from 'react';
import type { KeyboardRouter } from '../hooks/use-keyboard-router.js';
import { computeShellLayout } from '../layout/responsive-layout.js';
import { type ModalDefinition, useModal } from './modal-provider.js';

export interface ModalLayerProps {
  readonly palette: TuiSemanticPalette;
  readonly onClose: () => void;
  readonly router: KeyboardRouter;
}

export function ModalLayer(props: ModalLayerProps): ReactNode {
  const { modals } = useModal();
  const dimensions = useTerminalDimensions();
  const layout = computeShellLayout({ columns: dimensions.width, rows: dimensions.height });
  if (!modals.length) return null;
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      flexDirection="row"
      justifyContent="center"
      alignItems="center"
    >
      <box position="absolute" top={0} left={0} right={0} bottom={0} backgroundColor={props.palette.background} />
      {modals.map((modal) => (
        <ModalFrame
          key={modal.id}
          modal={modal}
          palette={props.palette}
          onClose={props.onClose}
          maxWidth={layout.modalWidth}
          router={props.router}
        />
      ))}
    </box>
  );
}

interface ModalFrameProps {
  readonly modal: ModalDefinition;
  readonly palette: TuiSemanticPalette;
  readonly onClose: () => void;
  readonly maxWidth: number;
  readonly router: KeyboardRouter;
}

const WIDTH: Record<string, number> = { narrow: 52, standard: 72, wide: 96 };

function ModalFrame(props: ModalFrameProps): ReactNode {
  const preferred = WIDTH[props.modal.width ?? 'standard'];
  const width = Math.min(preferred, props.maxWidth);
  const contentProps = { palette: props.palette, close: props.onClose, router: props.router };
  return (
    <box
      width={width}
      borderStyle="rounded"
      borderColor={props.palette.borderActive}
      backgroundColor={props.palette.backgroundPanel}
      flexDirection="column"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
    >
      <box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
        <text fg={props.palette.accent}>{props.modal.title}</text>
        <text fg={props.palette.textDim}>{props.modal.shortcut ?? 'esc close'}</text>
      </box>
      <box flexDirection="column" paddingTop={1} paddingLeft={1} paddingRight={1} flexGrow={1}>
        {props.modal.renderContent(contentProps)}
      </box>
      {props.modal.renderFooter ? (
        <box flexDirection="row" justifyContent="space-between" paddingTop={1} paddingLeft={1} paddingRight={1}>
          {props.modal.renderFooter(contentProps)}
        </box>
      ) : null}
    </box>
  );
}
