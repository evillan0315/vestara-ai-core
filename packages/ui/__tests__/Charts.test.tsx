/**
 * @vestara/ui: Chart Component Tests
 *
 * Comprehensive tests for Bar, Line, and Pie chart components.
 *
 * @see packages/ui/src/components/BarChart.tsx
 * @see packages/ui/src/components/LineChart.tsx
 * @see packages/ui/src/components/PieChart.tsx
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarChart } from '../src/components/BarChart';
import { LineChart } from '../src/components/LineChart';
import { PieChart } from '../src/components/PieChart';

const sampleData = [
  { label: 'Jan', value: 10 },
  { label: 'Feb', value: 20 },
  { label: 'Mar', value: 15 },
];

// ─── BarChart Tests ────────────────────────────────────────────

describe('BarChart', () => {
  it('renders SVG element', () => {
    const { container } = render(<BarChart data={sampleData} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders bars for each data point', () => {
    const { container } = render(<BarChart data={sampleData} />);
    const bars = container.querySelectorAll('rect');
    expect(bars).toHaveLength(3);
  });

  it('renders empty state when no data', () => {
    render(<BarChart data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders labels when showLabels is true', () => {
    const { container } = render(<BarChart data={sampleData} showLabels />);
    const labels = container.querySelectorAll('text');
    expect(labels.length).toBeGreaterThan(0);
  });

  it('renders values when showValues is true', () => {
    const { container } = render(<BarChart data={sampleData} showValues />);
    const values = container.querySelectorAll('text');
    expect(values.length).toBeGreaterThan(0);
  });
});

// ─── LineChart Tests ───────────────────────────────────────────

describe('LineChart', () => {
  it('renders SVG element', () => {
    const { container } = render(<LineChart data={sampleData} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders line path', () => {
    const { container } = render(<LineChart data={sampleData} />);
    const path = container.querySelector('path');
    expect(path).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<LineChart data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(<LineChart data={sampleData} showDots />);
    const dots = container.querySelectorAll('circle');
    expect(dots).toHaveLength(3);
  });

  it('does not render dots when showDots is false', () => {
    const { container } = render(<LineChart data={sampleData} showDots={false} />);
    const dots = container.querySelectorAll('circle');
    expect(dots).toHaveLength(0);
  });
});

// ─── PieChart Tests ────────────────────────────────────────────

describe('PieChart', () => {
  const pieData = [
    { label: 'Active', value: 50, color: '#22c55e' },
    { label: 'Idle', value: 30, color: '#71717a' },
    { label: 'Error', value: 20, color: '#ef4444' },
  ];

  it('renders SVG element', () => {
    const { container } = render(<PieChart data={pieData} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders slices', () => {
    const { container } = render(<PieChart data={pieData} />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
  });

  it('renders empty state when no data', () => {
    render(<PieChart data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders legend when showLegend is true', () => {
    render(<PieChart data={pieData} showLegend />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders percentage labels', () => {
    const { container } = render(<PieChart data={pieData} showLabels />);
    const labels = container.querySelectorAll('text');
    expect(labels.length).toBeGreaterThan(0);
  });
});
