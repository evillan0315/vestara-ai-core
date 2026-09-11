/**
 * VES-UI-E12: Bar Chart Component
 *
 * Simple bar chart component using SVG.
 * Domain-independent, uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-E: Charts, Testing, Lab (phases 12-14)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-012
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Types ─────────────────────────────────────────────────────

export interface BarChartDataPoint {
  /** Label for the bar */
  label: string;

  /** Numeric value */
  value: number;

  /** Optional color override */
  color?: string;
}

export interface BarChartProps {
  /** Data points */
  data: readonly BarChartDataPoint[];

  /** Chart width */
  width?: number;

  /** Chart height */
  height?: number;

  /** Bar color (default: accent primary) */
  barColor?: string;

  /** Whether to show labels */
  showLabels?: boolean;

  /** Whether to show values */
  showValues?: boolean;

  /** Custom class name */
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────

export function BarChart({
  data,
  width = 400,
  height = 200,
  barColor = 'var(--vestara-accent-primary)',
  showLabels = true,
  showValues = true,
  className = '',
}: BarChartProps) {
  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center text-sm text-[var(--vestara-text-muted)] ${className}`}>
        No data available
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value));
  const barWidth = Math.min(40, (width - 40) / data.length - 8);
  const chartHeight = height - (showLabels ? 40 : 20);
  const chartWidth = width - 40;

  return (
    <svg width={width} height={height} className={className} role="img" aria-label="Bar chart">
      <title>Bar chart</title>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
        <line
          key={ratio}
          x1={40}
          y1={20 + chartHeight * (1 - ratio)}
          x2={width - 10}
          y2={20 + chartHeight * (1 - ratio)}
          stroke="var(--vestara-border-subtle)"
          strokeWidth={1}
        />
      ))}

      {/* Bars */}
      {data.map((d, i) => {
        const barHeight = maxValue > 0 ? (d.value / maxValue) * chartHeight : 0;
        const x = 40 + i * (chartWidth / data.length) + (chartWidth / data.length - barWidth) / 2;
        const y = 20 + chartHeight - barHeight;
        const color = d.color ?? barColor;

        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={color}
              rx={4}
              className="transition-all duration-300"
            />

            {/* Value label */}
            {showValues && (
              <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fill="var(--vestara-text-muted)" fontSize={10}>
                {d.value}
              </text>
            )}

            {/* Bottom label */}
            {showLabels && (
              <text
                x={x + barWidth / 2}
                y={height - 8}
                textAnchor="middle"
                fill="var(--vestara-text-muted)"
                fontSize={10}
              >
                {d.label.length > 8 ? `${d.label.slice(0, 8)}…` : d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
