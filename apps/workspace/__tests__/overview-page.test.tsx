import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Overview from '../src/pages/Overview';
import type { UnderstandingData } from '../src/pages/Overview/useUnderstanding';

// Mock the useUnderstanding hook
vi.mock('../src/pages/Overview/useUnderstanding', () => ({
  useUnderstanding: vi.fn(),
}));

const mockData: UnderstandingData = {
  id: 'test-snapshot-id-12345678901234567890',
  identity: {
    name: 'Test Workspace',
    primaryLanguage: 'typescript',
    languageConfidence: 0.95,
    framework: 'React',
    architecture: 'monorepo',
  },
  architecture: {
    kind: 'monorepo',
    entryPoints: [
      { path: 'packages/core/src/index.ts', role: 'app', confidence: 0.9 },
      { path: 'packages/utils/src/index.ts', role: 'tool', confidence: 0.85 },
    ],
    dependencyCycles: [],
    layers: [
      { packageName: 'core', layer: 'services', confidence: 0.9 },
      { packageName: 'utils', layer: 'tools', confidence: 0.85 },
    ],
  },
  maturity: {
    level: 'good',
    healthScore: 7.5,
    testCoverage: 'high',
    documentationLevel: 'medium',
    codeQuality: 'good',
    risks: [
      { category: 'dependency', severity: 'low', reason: 'Outdated package' },
    ],
  },
  activity: {
    currentMilestone: 'v1.0 Release',
    recentChanges: [
      { description: 'feat: add new component', author: 'developer', timestamp: new Date().toISOString() },
    ],
    activeBranches: ['main', 'feature/test'],
    uncommittedWork: false,
    stalledSince: null,
  },
  memory: {
    recentDecisions: [
      { title: 'Use TypeScript', summary: 'For type safety', timestamp: new Date().toISOString() },
    ],
    keyFacts: ['Built with React 19', 'Uses Tailwind CSS'],
    memoryCount: 42,
  },
  state: {
    status: 'ready',
    isIndexed: true,
    indexFreshness: 'fresh',
    isCached: true,
  },
  summary: 'A modern workspace built with TypeScript and React.',
};

describe('Overview Page', () => {
  it('renders loading state', () => {
    const { useUnderstanding } = require('../src/pages/Overview/useUnderstanding');
    useUnderstanding.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() });

    render(<Overview />);
    expect(screen.getByText(/Building understanding/)).toBeTruthy();
  });

  it('renders error state', () => {
    const { useUnderstanding } = require('../src/pages/Overview/useUnderstanding');
    useUnderstanding.mockReturnValue({ data: null, loading: false, error: 'API error: 503', refetch: vi.fn() });

    render(<Overview />);
    expect(screen.getByText(/Failed to load workspace understanding/)).toBeTruthy();
  });

  it('renders overview with data', () => {
    const { useUnderstanding } = require('../src/pages/Overview/useUnderstanding');
    useUnderstanding.mockReturnValue({ data: mockData, loading: false, error: null, refetch: vi.fn() });

    render(<Overview />);
    expect(screen.getByText('Workspace Overview')).toBeTruthy();
    expect(screen.getByText('Test Workspace')).toBeTruthy();
    expect(screen.getByText(/TypeScript/)).toBeTruthy();
  });

  it('renders quick action buttons', () => {
    const { useUnderstanding } = require('../src/pages/Overview/useUnderstanding');
    useUnderstanding.mockReturnValue({ data: mockData, loading: false, error: null, refetch: vi.fn() });

    render(<Overview />);
    expect(screen.getByText(/Chat/)).toBeTruthy();
    expect(screen.getByText(/Dashboard/)).toBeTruthy();
    expect(screen.getByText(/Terminal/)).toBeTruthy();
    expect(screen.getByText(/Knowledge/)).toBeTruthy();
  });

  it('renders health card', () => {
    const { useUnderstanding } = require('../src/pages/Overview/useUnderstanding');
    useUnderstanding.mockReturnValue({ data: mockData, loading: false, error: null, refetch: vi.fn() });

    render(<Overview />);
    expect(screen.getByText('Health')).toBeTruthy();
    expect(screen.getByText('7.5')).toBeTruthy();
  });

  it('renders state card', () => {
    const { useUnderstanding } = require('../src/pages/Overview/useUnderstanding');
    useUnderstanding.mockReturnValue({ data: mockData, loading: false, error: null, refetch: vi.fn() });

    render(<Overview />);
    expect(screen.getByText('State')).toBeTruthy();
    expect(screen.getByText('ready')).toBeTruthy();
  });

  it('renders activity card', () => {
    const { useUnderstanding } = require('../src/pages/Overview/useUnderstanding');
    useUnderstanding.mockReturnValue({ data: mockData, loading: false, error: null, refetch: vi.fn() });

    render(<Overview />);
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getByText('v1.0 Release')).toBeTruthy();
  });

  it('renders architecture card', () => {
    const { useUnderstanding } = require('../src/pages/Overview/useUnderstanding');
    useUnderstanding.mockReturnValue({ data: mockData, loading: false, error: null, refetch: vi.fn() });

    render(<Overview />);
    expect(screen.getByText('Architecture')).toBeTruthy();
    expect(screen.getByText('Monorepo')).toBeTruthy();
  });

  it('renders decisions card', () => {
    const { useUnderstanding } = require('../src/pages/Overview/useUnderstanding');
    useUnderstanding.mockReturnValue({ data: mockData, loading: false, error: null, refetch: vi.fn() });

    render(<Overview />);
    expect(screen.getByText('Decisions & Knowledge')).toBeTruthy();
    expect(screen.getByText('Use TypeScript')).toBeTruthy();
  });

  it('renders charts section', () => {
    const { useUnderstanding } = require('../src/pages/Overview/useUnderstanding');
    useUnderstanding.mockReturnValue({ data: mockData, loading: false, error: null, refetch: vi.fn() });

    render(<Overview />);
    expect(screen.getByText('Health Metrics')).toBeTruthy();
    expect(screen.getByText('Layer Distribution')).toBeTruthy();
    expect(screen.getByText('Entry Point Confidence')).toBeTruthy();
  });
});
