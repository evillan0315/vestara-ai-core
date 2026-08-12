// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  getApiBase,
  getStoredApiBase,
  loadApiBaseFromStorage,
  persistApiBase,
  resolveHttpUrl,
  resolveWsUrl,
  setApiBase,
} from '../src/lib/clientConfig';

describe('clientConfig endpoint resolution', () => {
  afterEach(() => setApiBase(''));

  it('defaults to same-origin (empty base)', () => {
    expect(getApiBase()).toBe('');
    expect(resolveHttpUrl('/api/workspace')).toBe('/api/workspace');
    expect(resolveHttpUrl('/notifications')).toBe('/notifications');
  });

  it('composes a custom HTTP base and ensures the /api prefix', () => {
    setApiBase('http://127.0.0.1:3001');
    expect(resolveHttpUrl('/api/workspace')).toBe('http://127.0.0.1:3001/api/workspace');
    expect(resolveHttpUrl('/notifications')).toBe('http://127.0.0.1:3001/api/notifications');
  });

  it('strips trailing slashes from the base', () => {
    setApiBase('https://vestara.example.com/');
    expect(resolveHttpUrl('/api/x')).toBe('https://vestara.example.com/api/x');
  });

  it('resolves WebSocket URLs from a custom base', () => {
    setApiBase('https://vestara.example.com');
    expect(resolveWsUrl('/ws')).toBe('wss://vestara.example.com/ws');
    setApiBase('http://127.0.0.1:3001');
    expect(resolveWsUrl('/ws/activity')).toBe('ws://127.0.0.1:3001/ws/activity');
  });
});

describe('clientConfig endpoint persistence', () => {
  afterEach(() => persistApiBase(''));

  it('persists and reads the endpoint from storage', () => {
    persistApiBase('http://127.0.0.1:3001/');
    expect(getStoredApiBase()).toBe('http://127.0.0.1:3001');
    expect(getApiBase()).toBe('http://127.0.0.1:3001');
    expect(resolveHttpUrl('/api/x')).toBe('http://127.0.0.1:3001/api/x');
  });

  it('loadApiBaseFromStorage applies a stored value', () => {
    persistApiBase('https://h.example.com');
    setApiBase('');
    loadApiBaseFromStorage();
    expect(getApiBase()).toBe('https://h.example.com');
  });

  it('clearing removes the stored value and falls back to same-origin', () => {
    persistApiBase('http://x:1');
    persistApiBase('');
    expect(getStoredApiBase()).toBe('');
    expect(getApiBase()).toBe('');
  });
});
