/**
 * Settings → Telegram (TG-023)
 *
 * Integration settings surface for the Telegram channel: runtime/profile
 * status, user-configurable notification preferences (TG-018), quiet hours,
 * and the message simulator. The event catalog is served by the API so no
 * notification type is hardcoded here.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  type NotificationPreferences,
  type NotificationSeverity,
  type TelegramSettings as TelegramSettingsDto,
  type TelegramTunnel,
  type TunnelProviderKind,
  telegramApi,
} from '../../lib/telegram.js';
import { TelegramSimulator } from './TelegramSimulator.js';
import { Button, FactRow, SettingsSection, Status, Segmented, Toggle, input } from './settings-ui.js';

const SEVERITIES: readonly NotificationSeverity[] = ['info', 'warning', 'error', 'critical'];
const TUNNEL_PROVIDERS: readonly TunnelProviderKind[] = ['manual', 'cloudflared', 'ngrok'];

export function TelegramSettings() {
  const [settings, setSettings] = useState<TelegramSettingsDto | null>(null);
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    telegramApi
      .settings()
      .then((result) => {
        setSettings(result);
        setDraft(result.notifications);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load Telegram settings'));
  }, []);

  const updateDraft = useCallback((patch: Partial<NotificationPreferences>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setStatus('idle');
  }, []);

  const toggleEvent = useCallback((type: string, value: boolean) => {
    setDraft((current) =>
      current ? { ...current, enabled: { ...current.enabled, [type]: value } } : current,
    );
    setStatus('idle');
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setStatus('saving');
    try {
      const result = await telegramApi.updateSettings(draft);
      setDraft(result.notifications);
      setSettings((current) => (current ? { ...current, notifications: result.notifications } : current));
      setStatus('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Telegram settings');
      setStatus('error');
    }
  }, [draft]);

  return (
    <div className="space-y-4">
      <SettingsSection
        title="Telegram Integration"
        description="Notification policy and runtime status for the Telegram channel. Telegram is a projection surface — it never owns conversations, executions, or permissions."
      >
        {settings ? (
          <div className="px-4 pb-4 sm:px-5">
            <FactRow label="Runtime profile" value={settings.integration.runtimeProfile} />
            <FactRow label="Integration" value={settings.integration.enabled ? 'Active' : 'Parked'} isStatus />
            <FactRow label="Bot" value={settings.integration.configured ? 'Configured' : 'Not configured'} isStatus />
            <FactRow
              label="Persistent store"
              value={settings.integration.persistentStore ? 'Connected' : 'In-memory'}
              isStatus
            />
          </div>
        ) : (
          <p className="px-4 pb-4 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] sm:px-5">
            {error ?? 'Loading integration status…'}
          </p>
        )}
      </SettingsSection>

      <SettingsSection
        title="Notifications"
        description="Choose which events reach Telegram, the minimum severity, and quiet hours."
        actions={
          <div className="flex items-center gap-3">
            {status === 'saved' && <span className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-green)]">Saved</span>}
            <Button primary onClick={() => void handleSave()} disabled={!draft || status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Save'}
            </Button>
          </div>
        }
      >
        {draft && settings ? (
          <div className="px-4 pb-4 sm:px-5">
            <div className="divide-y divide-[var(--vestara-color-border-subtle,var(--color-zinc-800))]">
              {settings.eventCatalog.map((descriptor) => (
                <div key={descriptor.type} className="flex items-center justify-between gap-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-[var(--vestara-font-size-base)] font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                      {descriptor.label}
                    </span>
                    <span className="mt-0.5 block text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                      {descriptor.description}
                    </span>
                  </span>
                  <Toggle
                    label={descriptor.label}
                    checked={draft.enabled[descriptor.type] ?? descriptor.defaultEnabled}
                    onChange={(value) => toggleEvent(descriptor.type, value)}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] pt-4">
              <span className="mb-2 block text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
                Minimum severity
              </span>
              <Segmented
                label="Minimum severity"
                value={draft.minSeverity}
                options={SEVERITIES}
                onChange={(value) => updateDraft({ minSeverity: value })}
              />
            </div>

            <div className="mt-4 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] pt-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
                  Quiet hours
                </span>
                <Toggle
                  label="Quiet hours"
                  checked={draft.quietHours.enabled}
                  onChange={(value) => updateDraft({ quietHours: { ...draft.quietHours, enabled: value } })}
                />
              </div>
              {draft.quietHours.enabled && (
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]" htmlFor="tg-quiet-start">
                    From
                  </label>
                  <input
                    id="tg-quiet-start"
                    type="number"
                    min={0}
                    max={23}
                    value={draft.quietHours.startHour}
                    onChange={(e) => updateDraft({ quietHours: { ...draft.quietHours, startHour: Number(e.target.value) } })}
                    className={`${input} w-20`}
                  />
                  <label className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]" htmlFor="tg-quiet-end">
                    to
                  </label>
                  <input
                    id="tg-quiet-end"
                    type="number"
                    min={0}
                    max={23}
                    value={draft.quietHours.endHour}
                    onChange={(e) => updateDraft({ quietHours: { ...draft.quietHours, endHour: Number(e.target.value) } })}
                    className={`${input} w-20`}
                  />
                  <span className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                    (24h, local time)
                  </span>
                </div>
              )}
            </div>

            {status === 'error' && error && (
              <p className="mt-4 text-[var(--vestara-font-size-sm)] text-[var(--vestara-red)]">{error}</p>
            )}
          </div>
        ) : (
          <p className="px-4 pb-4 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] sm:px-5">
            Notification preferences are unavailable. {error}
          </p>
        )}
      </SettingsSection>

      {settings && <TunnelSection initial={settings.tunnel} />}

      <TelegramSimulator />

      {settings && (
        <SettingsSection
          title="Channel"
          description="Delivery is origin-only by default; Telegram never mirrors activity it was not asked to receive."
        >
          <div className="px-4 pb-4 sm:px-5">
            <span className="flex items-center gap-2 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
              <Status value={settings.integration.enabled ? 'Available' : 'Unavailable'} />
            </span>
          </div>
        </SettingsSection>
      )}
    </div>
  );
}

function tunnelStatusLabel(status: TelegramTunnel['state']['status']): string {
  switch (status) {
    case 'active':
      return 'Connected';
    case 'error':
      return 'Failed';
    case 'starting':
      return 'Starting';
    default:
      return 'Disabled';
  }
}

/**
 * Webhook tunnel control (TG-030). Telegram delivers updates to a public
 * HTTPS URL, so the loopback API must be exposed through a tunnel. Enabling
 * is an explicit action: nothing is spawned by configuration alone.
 */
function TunnelSection({ initial }: { initial: TelegramTunnel }) {
  const [tunnel, setTunnel] = useState<TelegramTunnel>(initial);
  const [provider, setProvider] = useState<TunnelProviderKind>(initial.config.provider);
  const [publicUrl, setPublicUrl] = useState(initial.config.publicUrl ?? '');
  const [localPort, setLocalPort] = useState(initial.config.localPort);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(async (patch: Parameters<typeof telegramApi.updateTunnel>[0]) => {
    setBusy(true);
    setError(null);
    try {
      const result = await telegramApi.updateTunnel(patch);
      setTunnel(result);
      setProvider(result.config.provider);
      setPublicUrl(result.config.publicUrl ?? '');
      setLocalPort(result.config.localPort);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tunnel request failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const { config, state, availability } = tunnel;
  const active = state.status === 'active';
  const selectedUnavailable = provider !== 'manual' && !availability[provider];

  return (
    <SettingsSection
      title="Webhook Tunnel"
      description="Expose the local webhook endpoint to Telegram through a public HTTPS tunnel. Telegram cannot reach loopback addresses."
    >
      <div className="px-4 pb-4 sm:px-5">
        <FactRow label="Status" value={tunnelStatusLabel(state.status)} isStatus />
        <FactRow label="Local target" value={`http://127.0.0.1:${config.localPort}`} />
        {state.publicUrl && <FactRow label="Public URL" value={state.publicUrl} />}
        {state.webhookUrl && <FactRow label="Webhook URL" value={state.webhookUrl} />}
        <FactRow label="Webhook registered" value={state.webhookRegistered ? 'Yes' : 'No'} isStatus />

        <div className="mt-4 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] pt-4">
          <span className="mb-2 block text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
            Provider
          </span>
          <Segmented label="Tunnel provider" value={provider} options={TUNNEL_PROVIDERS} onChange={setProvider} />
          {provider !== 'manual' && (
            <p
              className={`mt-2 text-[var(--vestara-font-size-xs)] ${
                availability[provider]
                  ? 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]'
                  : 'text-[var(--vestara-red)]'
              }`}
            >
              {availability[provider]
                ? `${provider} is available on this host.`
                : `${provider} is not installed on this host. Install it, set VESTARA_TELEGRAM_TUNNEL_COMMAND, or use the manual provider.`}
            </p>
          )}
        </div>

        <div className="mt-4">
          <label
            className="mb-1 block text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]"
            htmlFor="tg-tunnel-url"
          >
            Public URL
          </label>
          <input
            id="tg-tunnel-url"
            type="text"
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
            placeholder="https://your-tunnel.example.com"
            className={`${input} w-full`}
          />
          <p className="mt-1 text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            Required for the manual provider; an override for process providers. Telegram requires HTTPS.
          </p>
        </div>

        <div className="mt-4">
          <label
            className="mb-1 block text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]"
            htmlFor="tg-tunnel-port"
          >
            Local API port
          </label>
          <input
            id="tg-tunnel-port"
            type="number"
            min={1}
            max={65535}
            value={localPort}
            onChange={(e) => setLocalPort(Number(e.target.value))}
            className={`${input} w-28`}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            disabled={busy}
            onClick={() => void apply({ provider, publicUrl, localPort })}
          >
            Apply
          </Button>
          {active ? (
            <>
              {!state.webhookRegistered && (
                <Button primary disabled={busy} onClick={() => void apply({ enabled: true })}>
                  {busy ? 'Registering…' : 'Retry registration'}
                </Button>
              )}
              <Button disabled={busy} onClick={() => void apply({ enabled: false })}>
                {busy ? 'Stopping…' : 'Disable tunnel'}
              </Button>
            </>
          ) : (
            <Button
              primary
              disabled={busy || selectedUnavailable}
              onClick={() => void apply({ enabled: true, provider, publicUrl, localPort })}
            >
              {busy ? 'Starting…' : 'Enable tunnel'}
            </Button>
          )}
        </div>

        {state.lastError && (
          <p className="mt-3 text-[var(--vestara-font-size-sm)] text-[var(--vestara-red)]">{state.lastError}</p>
        )}
        {error && <p className="mt-3 text-[var(--vestara-font-size-sm)] text-[var(--vestara-red)]">{error}</p>}

        <p className="mt-3 text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
          Enabling starts the selected provider and registers the resulting URL with Telegram for this session; configuration
          persists, runtime state does not.
        </p>
      </div>
    </SettingsSection>
  );
}
