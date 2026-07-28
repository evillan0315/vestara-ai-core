import { useState, useCallback } from 'react';

const STORAGE_KEY = 'vestara-provider-settings';

export interface ProviderSettings {
  provider: string;
  model: string;
}

const DEFAULTS: ProviderSettings = {
  provider: 'opencode',
  model: 'nemotron-3-ultra-free',
};

function load(): ProviderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { provider: parsed.provider || DEFAULTS.provider, model: parsed.model || DEFAULTS.model };
    }
  } catch {}
  return { ...DEFAULTS };
}

function save(settings: ProviderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export function useProviderSettings() {
  const [settings, setSettings] = useState<ProviderSettings>(load);

  const updateSettings = useCallback((partial: Partial<ProviderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      save(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
