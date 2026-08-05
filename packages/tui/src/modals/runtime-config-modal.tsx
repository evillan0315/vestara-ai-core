import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { KeyboardRouter } from '../hooks/use-keyboard-router.js';
import { handled } from '../hooks/use-keyboard-router.js';
import type { ModalDefinition, ModalFrameContentProps } from '../modals/modal-provider.js';
import { buildRuntimeConfigViewModel } from '../state/runtime-config-model.js';
import type { RoutingSelection } from '../types.js';

export type { RuntimeConfigViewModel } from '../state/runtime-config-model.js';
export { buildRuntimeConfigViewModel } from '../state/runtime-config-model.js';

export interface RuntimeConfigModalProps {
  readonly palette: TuiSemanticPalette;
  readonly routing?: RoutingSelection;
  readonly onSave: (selection: { providerId: string; modelId: string; apiKey?: string }) => Promise<void> | void;
  readonly close: () => void;
  readonly router: KeyboardRouter;
}

export function RuntimeConfigContent(props: RuntimeConfigModalProps): ReactNode {
  const viewModel = buildRuntimeConfigViewModel(props.routing);
  const initialProvider = viewModel.providers[0]?.providerId ?? '';
  const [provider, setProvider] = useState(initialProvider);
  const initialModels = viewModel.modelsByProvider[initialProvider] ?? [];
  const [model, setModel] = useState(initialModels[0]?.modelId ?? '');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [providerIndex, setProviderIndex] = useState(0);
  const [modelIndex, setModelIndex] = useState(0);
  const [focusField, setFocusField] = useState<'provider' | 'model' | 'api-key'>('provider');

  const switchProvider = (value: string) => {
    setProvider(value);
    setModel(viewModel.modelsByProvider[value]?.[0]?.modelId ?? '');
    setModelIndex(0);
    setApiKey('');
    setError(undefined);
  };

  const configured = viewModel.configuredProviders[provider] === true;

  const save = async () => {
    if (!provider || !model) return;
    setSaving(true);
    setError(undefined);
    try {
      await props.onSave({ providerId: provider, modelId: model, apiKey: apiKey || undefined });
      props.close();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    return props.router.register('modal', (key) => {
      if (key.ctrl && key.name === 'c') return 'unhandled';
      if (focusField === 'api-key') {
        if (key.name === 'return' || key.name === 'enter') {
          void save();
          return handled();
        }
        return 'unhandled';
      }
      if (key.name === 'down') {
        if (focusField === 'provider') {
          const next = Math.min(viewModel.providers.length - 1, providerIndex + 1);
          setProviderIndex(next);
          switchProvider(viewModel.providers[next]?.providerId ?? provider);
        } else if (focusField === 'model') {
          const models = viewModel.modelsByProvider[provider] ?? [];
          const next = Math.min(models.length - 1, modelIndex + 1);
          setModelIndex(next);
          setModel(models[next]?.modelId ?? model);
        }
        return handled();
      }
      if (key.name === 'up') {
        if (focusField === 'provider') {
          const next = Math.max(0, providerIndex - 1);
          setProviderIndex(next);
          switchProvider(viewModel.providers[next]?.providerId ?? provider);
        } else if (focusField === 'model') {
          const models = viewModel.modelsByProvider[provider] ?? [];
          const next = Math.max(0, modelIndex - 1);
          setModelIndex(next);
          setModel(models[next]?.modelId ?? model);
        }
        return handled();
      }
      if (key.name === 'tab') {
        if (focusField === 'provider') setFocusField('model');
        else if (focusField === 'model') setFocusField(configured ? 'provider' : 'api-key');
        else if (focusField === 'api-key') setFocusField('provider');
        return handled();
      }
      if (key.name === 'return' || key.name === 'enter') {
        if (focusField === 'model' && configured) void save();
        return handled();
      }
      return 'unhandled';
    });
  });

  return (
    <box flexDirection="column">
      <box flexDirection="column" paddingBottom={1}>
        <text fg={focusField === 'provider' ? props.palette.accent : props.palette.textMuted}>Provider</text>
        <box flexDirection="row">
          {viewModel.providers.map((item, index) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: terminal mouse affordance; keyboard selection is primary.
            <box
              key={item.providerId}
              paddingLeft={1}
              paddingRight={1}
              marginRight={1}
              backgroundColor={item.providerId === provider ? props.palette.backgroundElement : undefined}
              onMouseDown={() => {
                setProviderIndex(index);
                switchProvider(item.providerId);
              }}
            >
              <text fg={item.providerId === provider ? props.palette.accent : props.palette.text}>
                {item.providerName}
              </text>
              <text fg={viewModel.configuredProviders[item.providerId] ? props.palette.success : props.palette.warning}>
                {' '}
                {viewModel.configuredProviders[item.providerId] ? 'configured' : 'key required'}
              </text>
            </box>
          ))}
          {viewModel.providers.length === 0 ? (
            <text fg={props.palette.textDim}>No provider catalog available</text>
          ) : null}
        </box>
      </box>
      <box flexDirection="column" paddingBottom={1}>
        <text fg={focusField === 'model' ? props.palette.accent : props.palette.textMuted}>Model</text>
        {(viewModel.modelsByProvider[provider] ?? []).map((item, index) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: terminal mouse affordance; keyboard selection is primary.
          <box
            key={item.modelId}
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={item.modelId === model ? props.palette.backgroundElement : undefined}
            onMouseDown={() => {
              setModelIndex(index);
              setModel(item.modelId);
            }}
          >
            <text fg={item.modelId === model ? props.palette.accent : props.palette.text}>{item.modelId}</text>
            {!item.available ? <text fg={props.palette.textDim}> (unavailable)</text> : null}
          </box>
        ))}
      </box>
      {!configured ? (
        <box flexDirection="column" paddingBottom={1}>
          <text fg={focusField === 'api-key' ? props.palette.accent : props.palette.textMuted}>API Key</text>
          <text fg={props.palette.textDim}>Credential not configured for this provider.</text>
          <input
            value={apiKey}
            placeholder="Enter API key (masked)"
            onInput={(value: string) => setApiKey(value)}
            onKeyDown={(key) => {
              if (focusField === 'api-key') setFocusField('provider');
              if (key.name === 'return' || key.name === 'enter') void save();
            }}
          />
        </box>
      ) : (
        <text fg={props.palette.success} paddingBottom={1}>
          Credential configured. No API key required.
        </text>
      )}
      {error ? (
        <text fg={props.palette.error} paddingBottom={1}>
          {error}
        </text>
      ) : null}
      <box flexDirection="row" justifyContent="space-between" paddingTop={1}>
        <text fg={props.palette.textDim}>Esc Cancel</text>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: terminal mouse affordance; keyboard selection is primary. */}
        <text fg={saving ? props.palette.textDim : props.palette.accent} onMouseDown={() => void save()}>
          {saving ? 'Saving…' : 'Enter Save'}
        </text>
      </box>
    </box>
  );
}

export function createRuntimeConfigModal(
  palette: TuiSemanticPalette,
  routing: RoutingSelection | undefined,
  onSave: (selection: { providerId: string; modelId: string; apiKey?: string }) => Promise<void> | void,
): ModalDefinition {
  return {
    id: 'runtime-config',
    title: 'Provider / Model / API Key',
    shortcut: 'Ctrl+R',
    width: 'standard',
    renderContent: (frame: ModalFrameContentProps) => (
      <RuntimeConfigContent
        palette={palette}
        routing={routing}
        onSave={onSave}
        close={frame.close}
        router={frame.router}
      />
    ),
  };
}
