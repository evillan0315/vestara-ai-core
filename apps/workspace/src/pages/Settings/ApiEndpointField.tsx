import { useState } from 'react';
import { Button, input, SettingsRow, SettingsSection } from './settings-ui';
import { getStoredApiBase, persistApiBase } from '../../lib/clientConfig';

/**
 * Client-local API endpoint control. This is the address the UI connects to,
 * not a server-backed setting: standalone desktop clients point it at a remote
 * Vestara API (for example `http://127.0.0.1:3001`), while the browser SPA
 * leaves it empty to use the same origin.
 */
export function ApiEndpointField({ onApplied }: { onApplied?: () => void }) {
  const [value, setValue] = useState(getStoredApiBase());
  const [saved, setSaved] = useState(false);

  const apply = () => {
    persistApiBase(value);
    setSaved(true);
    onApplied?.();
  };

  const clear = () => {
    persistApiBase('');
    setValue('');
    setSaved(false);
    onApplied?.();
  };

  return (
    <SettingsSection
      title="API Endpoint"
      description="Base URL of the Vestara API this client connects to. Empty uses the same origin (browser). Standalone clients set this to the API address, e.g. http://127.0.0.1:3001; the WebSocket is derived from the same host."
    >
      <SettingsRow
        label="Endpoint"
        description="HTTP base URL; WebSocket host is derived from it."
        value={
          <span className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
            <input
              aria-label="API endpoint"
              placeholder="http://127.0.0.1:3001"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setSaved(false);
              }}
              className={`${input} w-full sm:w-80`}
            />
          </span>
        }
      />
      <footer className="flex flex-col gap-3 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-xs text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
          {saved ? 'Endpoint applied. Reload to reconnect.' : 'Applies to new requests immediately.'}
        </p>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button onClick={clear}>Clear</Button>
          <Button primary disabled={saved} onClick={apply}>
            Apply endpoint
          </Button>
        </div>
      </footer>
    </SettingsSection>
  );
}
