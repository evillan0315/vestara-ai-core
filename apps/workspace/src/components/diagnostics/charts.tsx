/**
 * Reusable chart primitives for the Diagnostic Center.
 *
 * Built on recharts (already a Workspace dependency) and themed with the
 * same chart tokens used across the app.
 */

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistoryPoint } from './DiagnosticsContext';

const ACCENT = 'var(--vestara-accent, #f59e0b)';

interface SparklineProps {
  points: HistoryPoint[];
  color?: string;
  height?: number;
}

export function Sparkline({ points, color = ACCENT, height = 36 }: SparklineProps) {
  if (points.length < 2) {
    return (
      <div style={{ height }} className="flex items-center text-[10px] text-zinc-600">
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
            <linearGradient id="diagSpark" x1="0" y1="0" x2="0" y2="1">
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
            fill="url(#diagSpark)"
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
  const data = points.map((p) => ({ t: new Date(p.t).toLocaleTimeString(), v: p.value }));
  return (
    <div style={{ height }}>
      {label && <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{label}</div>}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="diagHist" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            tick={{ fontSize: 9, fill: 'var(--color-zinc-500)' }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            domain={yDomain}
            width={30}
            tick={{ fontSize: 9, fill: 'var(--color-zinc-500)' }}
            tickLine={false}
            axisLine={false}
            unit="%"
          />
          <Tooltip
            contentStyle={{
              background: 'var(--chart-tooltip-bg, #18181b)',
              border: '1px solid var(--chart-tooltip-border, #27272a)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--chart-tooltip-text, #d4d4d8)',
            }}
            formatter={(value) => [`${Number(value).toFixed(1)}%`, 'usage']}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill="url(#diagHist)"
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
      ? 'var(--vestara-red, #f87171)'
      : tone === 'warn'
        ? 'var(--vestara-amber, #f59e0b)'
        : pct > 90
          ? 'var(--vestara-red, #f87171)'
          : pct > 75
            ? 'var(--vestara-amber, #f59e0b)'
            : 'var(--vestara-accent, #f59e0b)';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-zinc-400">{label}</span>
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
