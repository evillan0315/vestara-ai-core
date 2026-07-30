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
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">AI Providers</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">Manage AI provider connections</p>
        </div>
      </div>

      {/* Connection status bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-2 bg-(--vestara-accent-bg) rounded-full overflow-hidden flex">
          {(() => {
            const connected = providers.filter((p) => p.status === 'connected').length;
            const total = providers.length;
            const connectedPct = (connected / total) * 100;
            return (
              <>
                <div className="h-full bg-(--vestara-green) transition-all" style={{ width: `${connectedPct}%` }} />
                <div className="h-full bg-(--vestara-accent-bg) transition-all" style={{ width: `${100 - connectedPct}%` }} />
              </>
            );
          })()}
        </div>
        <div className="flex items-center gap-3 text-[9px] text-(--vestara-text-2)">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-(--vestara-green)" /> {providers.filter((p) => p.status === 'connected').length} connected</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-(--vestara-text-dim)" /> {providers.filter((p) => p.status !== 'connected').length} offline</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Provider List */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold text-(--vestara-text) mb-4">Providers</h2>
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
                      ? 'border-(--vestara-accent) bg-(--vestara-accent-bg)'
                      : 'border-(--vestara-accent-border) bg-(--vestara-accent-bg) hover:border-(--vestara-accent-border-hover)'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-(--vestara-text)">{provider.name}</span>
                  <span
                    className={`
                      px-2 py-1 text-xs rounded-full
                      ${
                        provider.status === 'connected'
                          ? 'bg-green-500/10 text-green-400'
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
                  <p className="text-sm text-(--vestara-text-2) mt-1">
                    {provider.models.length} model{provider.models.length !== 1 ? 's' : ''} available
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Provider Details */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-(--vestara-text) mb-4">
            {providers.find((p) => p.id === selectedProvider)?.name || 'Select a Provider'}
          </h2>
          <div className="bg-(--vestara-accent-bg) rounded-lg border border-(--vestara-accent-border) p-6">
            {selectedProvider === 'opencode' ? (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-2 py-1 text-xs rounded-full bg-green-500/10 text-green-400">Default Provider</span>
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400">No API Key Required</span>
                </div>
                <p className="text-(--vestara-text-2) mb-4">
                  OpenCode is the default provider for Vestara. It works without API keys and provides access to
                  multiple models for different use cases.
                </p>
                <div className="space-y-2">
                  <h3 className="font-medium text-(--vestara-text)">Available Models</h3>
                  <ul className="list-disc list-inside text-(--vestara-text-2)">
                    <li>default — General purpose</li>
                    <li>fast — Quick responses</li>
                    <li>creative — Enhanced creativity</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-(--vestara-text-2) mb-4">
                  To connect to this provider, you'll need to configure your API key.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-(--vestara-text) mb-1">API Key</label>
                    <input
                      type="password"
                      placeholder="Enter your API key"
                      className="w-full px-3 py-2 border border-(--vestara-accent-border) rounded-md bg-(--vestara-accent-bg) text-(--vestara-text)"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleConnect(selectedProvider)}
                      className="px-4 py-2 bg-(--vestara-accent) text-white rounded-md hover:opacity-90 transition-opacity"
                    >
                      Connect
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(selectedProvider)}
                      className="px-4 py-2 border border-(--vestara-accent-border) text-(--vestara-text) rounded-md hover:bg-(--vestara-accent-bg) transition-colors"
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
