/**
 * AI Providers Settings — Manages AI provider connections.
 *
 * Architecture Traceability:
 *   Settings Framework: 01-Overview.md → Purpose
 *   Natural Law: Intelligence exists in many forms
 *   Purpose: Let's Change the World
 */

import type { SettingsValue } from '@vestara/settings-framework';
import { useEffect, useState } from 'react';

interface Provider {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  models: string[];
}

const PROVIDERS: Provider[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    status: 'connected',
    models: ['default', 'fast', 'creative'],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    status: 'disconnected',
    models: [],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    status: 'disconnected',
    models: [],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    status: 'disconnected',
    models: [],
  },
];

export default function AIProvidersSettings() {
  const [providers, setProviders] = useState<Provider[]>(PROVIDERS);
  const [selectedProvider, setSelectedProvider] = useState<string>('opencode');

  const handleConnect = (providerId: string) => {
    setProviders((prev) => prev.map((p) => (p.id === providerId ? { ...p, status: 'connected' as const } : p)));
  };

  const handleDisconnect = (providerId: string) => {
    setProviders((prev) => prev.map((p) => (p.id === providerId ? { ...p, status: 'disconnected' as const } : p)));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--vestara-text)] mb-2">AI Providers</h1>
      <p className="text-[var(--vestara-text-2)] mb-6">
        Manage connections to AI providers. OpenCode is the default and works without API keys.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Provider List */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold text-[var(--vestara-text)] mb-4">Providers</h2>
          <div className="space-y-2">
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => setSelectedProvider(provider.id)}
                className={`
                  w-full text-left p-4 rounded-lg border transition-colors
                  ${
                    selectedProvider === provider.id
                      ? 'border-[var(--vestara-accent)] bg-[var(--color-zinc-800)]'
                      : 'border-[var(--vestara-accent-border)] bg-[var(--color-zinc-900)] hover:border-[var(--vestara-accent-border-hover)]'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--vestara-text)]">{provider.name}</span>
                  <span
                    className={`
                      px-2 py-1 text-xs rounded-full
                      ${
                        provider.status === 'connected'
                          ? 'bg-green-100 text-green-800'
                          : provider.status === 'error'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                      }
                    `}
                  >
                    {provider.status}
                  </span>
                </div>
                {provider.models.length > 0 && (
                  <p className="text-sm text-[var(--vestara-text-2)] mt-1">
                    {provider.models.length} model{provider.models.length !== 1 ? 's' : ''} available
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Provider Details */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-[var(--vestara-text)] mb-4">
            {providers.find((p) => p.id === selectedProvider)?.name || 'Select a Provider'}
          </h2>
          <div className="bg-[var(--color-zinc-900)] rounded-lg border border-[var(--vestara-accent-border)] p-6">
            {selectedProvider === 'opencode' ? (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Default Provider</span>
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">No API Key Required</span>
                </div>
                <p className="text-[var(--vestara-text-2)] mb-4">
                  OpenCode is the default provider for Vestara. It works without API keys and provides access to
                  multiple models for different use cases.
                </p>
                <div className="space-y-2">
                  <h3 className="font-medium text-[var(--vestara-text)]">Available Models</h3>
                  <ul className="list-disc list-inside text-[var(--vestara-text-2)]">
                    <li>default — General purpose</li>
                    <li>fast — Quick responses</li>
                    <li>creative — Enhanced creativity</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[var(--vestara-text-2)] mb-4">
                  To connect to this provider, you'll need to configure your API key.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--vestara-text)] mb-1">API Key</label>
                    <input
                      type="password"
                      placeholder="Enter your API key"
                      className="w-full px-3 py-2 border border-[var(--vestara-accent-border)] rounded-md bg-[var(--color-zinc-950)] text-[var(--vestara-text)]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleConnect(selectedProvider)}
                      className="px-4 py-2 bg-[var(--vestara-accent)] text-white rounded-md hover:opacity-90 transition-opacity"
                    >
                      Connect
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(selectedProvider)}
                      className="px-4 py-2 border border-[var(--vestara-accent-border)] text-[var(--vestara-text)] rounded-md hover:bg-[var(--color-zinc-800)] transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
