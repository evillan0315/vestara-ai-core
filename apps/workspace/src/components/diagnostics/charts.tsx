/**
 * Reusable chart primitives for the Diagnostic Center.
 *
 * Built on recharts (already a Workspace dependency) and themed with the
 * same chart tokens used across the app.
 */

import { useId } from 'react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistoryPoint } from './DiagnosticsContext';

const ACCENT = 'var(--vestara-accent)';

interface SparklineProps {
  points: HistoryPoint[];
  color?: string;
  height?: number;
}

export function Sparkline({ points, color = ACCENT, height = 36 }: SparklineProps) {
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  if (points.length < 2) {
    return (
      <div style={{ height }} className="flex items-center text-[10px] text-[var(--vestara-text-muted)]">
        collecting…
      </div>
    );
  }
  const data = points.map((p) => ({ t: p.t, v: p.value }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, 100]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface HistoryChartProps {
  points: HistoryPoint[];
  color?: string;
  height?: number;
  yDomain?: [number, number];
  label?: string;
}

export function HistoryChart({ points, color = ACCENT, height = 160, yDomain = [0, 100], label }: HistoryChartProps) {
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const data = points.map((p) => ({ t: new Date(p.t).toLocaleTimeString(), v: p.value }));
  return (
    <div style={{ height }}>
      {label && <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--vestara-text-muted)]">{label}</div>}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            tick={{ fontSize: 9, fill: 'var(--vestara-text-muted)' }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            domain={yDomain}
            width={30}
            tick={{ fontSize: 9, fill: 'var(--vestara-text-muted)' }}
            tickLine={false}
            axisLine={false}
            unit="%"
          />
          <Tooltip
            contentStyle={{
              background: 'var(--vestara-surface-overlay)',
              border: '1px solid var(--vestara-border-subtle)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--vestara-text-primary)',
            }}
            formatter={(value) => [`${Number(value).toFixed(1)}%`, 'usage']}
          />
          <ReferenceLine
            y={75}
            stroke="var(--vestara-status-warning)"
            strokeDasharray="4 4"
            strokeOpacity={0.45}
          />
          <ReferenceLine y={90} stroke="var(--vestara-status-error)" strokeDasharray="4 4" strokeOpacity={0.45} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface MeterProps {
  label: string;
  value: number;
  display?: string;
  tone?: 'pass' | 'warn' | 'fail';
}

export function Meter({ label, value, display, tone }: MeterProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const color =
    tone === 'fail'
      ? 'var(--vestara-status-error)'
      : tone === 'warn'
        ? 'var(--vestara-status-warning)'
        : pct > 90
          ? 'var(--vestara-status-error)'
          : pct > 75
            ? 'var(--vestara-status-warning)'
            : 'var(--vestara-accent)';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-[var(--vestara-text-muted)]">{label}</span>
        <span className="text-[11px] font-medium tabular-nums" style={{ color }}>
          {display ?? `${pct.toFixed(1)}%`}
        </span>
      </div>
      <div className="diag-meter-track">
        <div className="diag-meter-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
