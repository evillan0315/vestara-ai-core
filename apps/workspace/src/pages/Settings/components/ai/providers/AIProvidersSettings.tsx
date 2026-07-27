/**
 * AI Providers Settings — Manages AI provider connections.
 *
 * Architecture Traceability:
 *   Settings Framework: 01-Overview.md → Purpose
 *   Natural Law: Intelligence exists in many forms
 *   Purpose: Let's Change the World
 */

import { useState, useEffect } from 'react';
import type { SettingsValue } from '@vestara/settings-framework';

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
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">AI Providers</h1>
      <p className="text-[var(--text-secondary)] mb-6">
        Manage connections to AI providers. OpenCode is the default and works without API keys.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Provider List */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Providers</h2>
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
                      ? 'border-[var(--accent-primary)] bg-[var(--bg-tertiary)]'
                      : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--border-secondary)]'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--text-primary)]">{provider.name}</span>
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
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    {provider.models.length} model{provider.models.length !== 1 ? 's' : ''} available
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Provider Details */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            {providers.find((p) => p.id === selectedProvider)?.name || 'Select a Provider'}
          </h2>
          <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] p-6">
            {selectedProvider === 'opencode' ? (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Default Provider</span>
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">No API Key Required</span>
                </div>
                <p className="text-[var(--text-secondary)] mb-4">
                  OpenCode is the default provider for Vestara. It works without API keys and provides access to
                  multiple models for different use cases.
                </p>
                <div className="space-y-2">
                  <h3 className="font-medium text-[var(--text-primary)]">Available Models</h3>
                  <ul className="list-disc list-inside text-[var(--text-secondary)]">
                    <li>default — General purpose</li>
                    <li>fast — Quick responses</li>
                    <li>creative — Enhanced creativity</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[var(--text-secondary)] mb-4">
                  To connect to this provider, you'll need to configure your API key.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">API Key</label>
                    <input
                      type="password"
                      placeholder="Enter your API key"
                      className="w-full px-3 py-2 border border-[var(--border-primary)] rounded-md bg-[var(--bg-primary)] text-[var(--text-primary)]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleConnect(selectedProvider)}
                      className="px-4 py-2 bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-md hover:opacity-90 transition-opacity"
                    >
                      Connect
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(selectedProvider)}
                      className="px-4 py-2 border border-[var(--border-primary)] text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
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
