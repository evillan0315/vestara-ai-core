/**
 * VES-UI-E12: Line Chart Component
 *
 * Simple line chart component using SVG.
 * Domain-independent, uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-E: Charts, Testing, Lab (phases 12-14)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-012
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Types ─────────────────────────────────────────────────────

export interface LineChartDataPoint {
  /** X label */
  label: string;

  /** Y value */
  value: number;
}

export interface LineChartProps {
  /** Data points */
  data: readonly LineChartDataPoint[];

  /** Chart width */
  width?: number;

  /** Chart height */
  height?: number;

  /** Line color */
  lineColor?: string;

  /** Fill color (area under line) */
  fillColor?: string;

  /** Whether to show dots */
  showDots?: boolean;

  /** Whether to show labels */
  showLabels?: boolean;

  /** Custom class name */
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────

export function LineChart({
  data,
  width = 400,
  height = 200,
  lineColor = 'var(--vestara-accent-primary)',
  fillColor,
  showDots = true,
  showLabels = true,
  className = '',
}: LineChartProps) {
  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center text-sm text-[var(--vestara-text-muted)] ${className}`}>
        No data available
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value));
  const minValue = Math.min(...data.map((d) => d.value));
  const range = maxValue - minValue || 1;
  const chartHeight = height - (showLabels ? 40 : 20);
  const chartWidth = width - 40;

  // Generate path points
  const points = data.map((d, i) => ({
    x: 40 + (i / (data.length - 1 || 1)) * chartWidth,
    y: 20 + chartHeight - ((d.value - minValue) / range) * chartHeight,
  }));

  // Create path string
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Create area path (for fill)
  const areaD = `${pathD} L ${points[points.length - 1].x} ${20 + chartHeight} L ${points[0].x} ${20 + chartHeight} Z`;

  return (
    <svg width={width} height={height} className={className}>
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

      {/* Fill area */}
      {fillColor && (
        <path
          d={areaD}
          fill={fillColor}
          opacity={0.2}
        />
      )}

      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots */}
      {showDots && points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={3}
          fill={lineColor}
          stroke="var(--vestara-surface-panel)"
          strokeWidth={2}
        />
      ))}

      {/* Labels */}
      {showLabels && data.map((d, i) => (
        <text
          key={i}
          x={points[i].x}
          y={height - 8}
          textAnchor="middle"
          fill="var(--vestara-text-muted)"
          fontSize={10}
        >
          {d.label.length > 6 ? d.label.slice(0, 6) + '…' : d.label}
        </text>
      ))}
    </svg>
  );
}
