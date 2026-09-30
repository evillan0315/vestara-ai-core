import type { CodexTransport, ResolvedConfiguration } from '@vestara/configuration';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { navIcon } from '../../layouts/workspace-navigation.js';
import Drawer from '../../components/ui/Drawer';
import { Button, ReferenceCard, SettingsRow, input } from './settings-ui.js';
import { settingsClient } from './settings-client.js';

const CODEX_TRANSPORT_SETTING = 'runtime.codexTransport';

function currentTransport(configuration: ResolvedConfiguration): CodexTransport {
  const value = configuration.settings.find((setting) => setting.key === CODEX_TRANSPORT_SETTING)?.value;
  return value === 'sdk' ? 'sdk' : 'app-server';
}

function transportLabel(transport: CodexTransport): string {
  return transport === 'app-server' ? 'App Server' : 'SDK / CLI';
}

function DocumentationSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
        {title}
      </h3>
      <div className="space-y-2 text-[var(--vestara-font-size-sm)] leading-relaxed text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
        {children}
      </div>
    </section>
  );
}

function DocumentationReference({ path, label = path }: { path: string; label?: string }) {
  return (
    <li>
      <a
        className="text-[var(--vestara-accent-text)] underline decoration-[var(--vestara-accent-border)] underline-offset-2 hover:text-[var(--vestara-accent)]"
        href={`/docs?path=${encodeURIComponent(path)}`}
      >
        {label}
      </a>
      <code className="ml-2 text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
        {path}
      </code>
    </li>
  );
}

function SourceReference({ path, label }: { path: string; label: string }) {
  return (
    <li>
      <span>{label}</span>
      <code className="ml-2 text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
        {path}
      </code>
    </li>
  );
}

function CodexDocumentationDrawer({
  open,
  onClose,
  configuration,
  transport,
}: {
  open: boolean;
  onClose: () => void;
  configuration: ResolvedConfiguration;
  transport: CodexTransport;
}) {
  const setting = configuration.settings.find((candidate) => candidate.key === CODEX_TRANSPORT_SETTING);

  return (
    <Drawer open={open} onClose={onClose} title="Codex documentation" position="right" defaultSize="large" portal>
      <div className="space-y-6 p-4 sm:p-5">
        <DocumentationSection title="Overview">
          <p>
            This panel selects Vestara&apos;s configured Codex transport for new Codex executions. It is configuration, not
            a live execution status or a retroactive change to an existing execution.
          </p>
        </DocumentationSection>

        <DocumentationSection title="Current configuration">
          <SettingsRow
            label="Runtime transport"
            description={setting?.source === 'default' ? 'Resolved from the App Server default.' : 'Resolved from the saved workspace setting.'}
            value={transportLabel(transport)}
          />
          <p>
            Stored key: <code>runtime.codexTransport</code>. Current value: <code>{transport}</code>.
          </p>
        </DocumentationSection>

        <DocumentationSection title="Configuration">
          <p>
            <strong>App Server</strong> is the default/preferred full-capability transport. <strong>SDK / CLI</strong> is
            the bounded compatibility transport. The selection is persisted through the existing Settings API and
            resolves to App Server when no explicit value is present.
          </p>
          <p>
            The current setting does not automatically migrate the Global Assistant execution path, and no automatic
            transport fallback is configured here.
          </p>
        </DocumentationSection>

        <DocumentationSection title="How to">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Choose App Server or SDK / CLI from Runtime transport.</li>
            <li>Wait for the saved confirmation.</li>
            <li>Leave and return to Settings to read the persisted selection.</li>
          </ol>
          <p>Changing this setting affects the configured default for future executions only.</p>
        </DocumentationSection>

        <DocumentationSection title="Architecture">
          <p>
            Vestara owns the Codex runtime configuration boundary. The selected transport is distinct from a Codex
            execution identity, runtime session, thread, or turn. Consumers should use the runtime boundary rather than
            branching on transport implementation details.
          </p>
          <p>
            The App Server integration uses a server-side WebSocket configuration. Its current URL remains environment
            configuration rather than a browser-editable Setting in this panel.
          </p>
        </DocumentationSection>

        <DocumentationSection title="Source">
          <ul className="list-disc space-y-1 pl-5">
            <SourceReference path="packages/configuration/src/workspace-settings.ts" label="Settings contract and default" />
            <SourceReference path="apps/workspace/src/pages/Settings/CodexTransportPanel.tsx" label="This panel and persistence call" />
            <SourceReference path="apps/workspace/src/pages/Settings/settings-client.ts" label="Settings API client" />
            <SourceReference path="packages/codex-runtime/src/config.ts" label="App Server runtime configuration" />
            <SourceReference path="apps/api/src/routes/codex.ts" label="Vestara App Server API facade" />
            <SourceReference path="apps/api/src/assistant-codex-adapter.ts" label="Current Global Assistant SDK adapter" />
          </ul>
        </DocumentationSection>

        <DocumentationSection title="Related documentation">
          <ul className="list-disc space-y-1 pl-5">
            <DocumentationReference path="docs/CODEX-APP-SERVER-RUNBOOK.md" label="Codex App Server runbook" />
            <DocumentationReference path="docs/architecture/AR-GA-CORE-004-RUNTIME-EXECUTION-BOUNDARY.md" label="Runtime execution boundary" />
            <DocumentationReference path="docs/architecture/AR-GA-CORE-003-EXECUTION-CONTRACT-BASELINE.md" label="Execution contract baseline" />
            <DocumentationReference path="docs/blueprint/AR-005-global-assistant-architecture.md" label="Global Assistant architecture" />
          </ul>
        </DocumentationSection>
      </div>
    </Drawer>
  );
}

export function CodexTransportPanel({
  configuration,
  onChanged,
  className = '',
}: {
  configuration: ResolvedConfiguration;
  onChanged: (next: ResolvedConfiguration) => void;
  className?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [documentationOpen, setDocumentationOpen] = useState(false);
  const transport = currentTransport(configuration);

  const saveTransport = async (next: CodexTransport) => {
    if (next === transport) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await settingsClient.save(configuration, 'runtime', {
        [CODEX_TRANSPORT_SETTING]: next,
      });
      onChanged(result.configuration);
      setMessage('Codex transport setting saved. Applies to new executions.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Codex transport setting could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ReferenceCard
      icon={navIcon('activity')}
      title="Codex"
      description="Choose the Vestara transport policy for new Codex executions. Current Global Assistant execution remains unchanged."
      className={className}
      actions={<Button onClick={() => setDocumentationOpen(true)}>Documentation</Button>}
    >
      <SettingsRow
        label="Runtime transport"
        description="App Server is the default full-capability path. SDK / CLI is a bounded compatibility option."
        value={
          <select
            aria-label="Codex runtime transport"
            className={`${input} min-w-40`}
            disabled={saving}
            value={transport}
            onChange={(event) => void saveTransport(event.target.value as CodexTransport)}
          >
            <option value="app-server">{transportLabel('app-server')}</option>
            <option value="sdk">{transportLabel('sdk')}</option>
          </select>
        }
      />
      <SettingsRow
        label={transportLabel(transport)}
        description={
          transport === 'app-server'
            ? 'Default/preferred transport for future full-capability Codex work.'
            : 'Compatibility transport with bounded runtime capabilities; not recovery-equivalent to App Server.'
        }
      />
      {message && (
        <div className="border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
          {message}
        </div>
      )}
      {saving && (
        <div className="flex justify-end border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3">
          <Button disabled>Saving…</Button>
        </div>
      )}
      <CodexDocumentationDrawer
        open={documentationOpen}
        onClose={() => setDocumentationOpen(false)}
        configuration={configuration}
        transport={transport}
      />
    </ReferenceCard>
  );
}
