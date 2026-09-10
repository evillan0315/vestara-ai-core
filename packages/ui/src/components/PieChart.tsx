/**
 * VES-UI-E12: Pie Chart Component
 *
 * Simple pie/donut chart component using SVG.
 * Domain-independent, uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-E: Charts, Testing, Lab (phases 12-14)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-012
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Types ─────────────────────────────────────────────────────

export interface PieChartDataPoint {
  /** Label for the slice */
  label: string;

  /** Numeric value */
  value: number;

  /** Slice color */
  color: string;
}

export interface PieChartProps {
  /** Data points */
  data: readonly PieChartDataPoint[];

  /** Chart size (width/height) */
  size?: number;

  /** Inner radius for donut chart (0 for pie) */
  innerRadius?: number;

  /** Whether to show labels */
  showLabels?: boolean;

  /** Whether to show legend */
  showLegend?: boolean;

  /** Custom class name */
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────

export function PieChart({
  data,
  size = 200,
  innerRadius = 0,
  showLabels = true,
  showLegend = true,
  className = '',
}: PieChartProps) {
  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center text-sm text-[var(--vestara-text-muted)] ${className}`}>
        No data available
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - 20) / 2;

  // Calculate slices
  let currentAngle = -Math.PI / 2; // Start from top
  const slices = data.map((d) => {
    const angle = total > 0 ? (d.value / total) * Math.PI * 2 : 0;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    // Calculate arc path
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);

    const largeArc = angle > Math.PI ? 1 : 0;

    let pathD: string;
    if (innerRadius > 0) {
      // Donut
      const ix1 = cx + innerRadius * Math.cos(startAngle);
      const iy1 = cy + innerRadius * Math.sin(startAngle);
      const ix2 = cx + innerRadius * Math.cos(endAngle);
      const iy2 = cy + innerRadius * Math.sin(endAngle);

      pathD = [
        `M ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${ix2} ${iy2}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1}`,
        'Z',
      ].join(' ');
    } else {
      // Pie
      pathD = [`M ${cx} ${cy}`, `L ${x1} ${y1}`, `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`, 'Z'].join(' ');
    }

    // Label position (middle of arc)
    const midAngle = startAngle + angle / 2;
    const labelRadius = innerRadius > 0 ? (radius + innerRadius) / 2 : radius * 0.6;
    const labelX = cx + labelRadius * Math.cos(midAngle);
    const labelY = cy + labelRadius * Math.sin(midAngle);

    return {
      ...d,
      pathD,
      labelX,
      labelY,
      percentage: total > 0 ? Math.round((d.value / total) * 100) : 0,
    };
  });

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <svg width={size} height={size}>
        {/* Slices */}
        {slices.map((slice, i) => (
          <path key={i} d={slice.pathD} fill={slice.color} className="transition-all duration-300 hover:opacity-80" />
        ))}

        {/* Labels */}
        {showLabels &&
          slices.map((slice, i) => (
            <text
              key={i}
              x={slice.labelX}
              y={slice.labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize={12}
              fontWeight="bold"
            >
              {slice.percentage}%
            </text>
          ))}
      </svg>

      {/* Legend */}
      {showLegend && (
        <div className="space-y-1">
          {slices.map((slice, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: slice.color }} />
              <span className="text-[var(--vestara-text-secondary)]">{slice.label}</span>
              <span className="text-[var(--vestara-text-muted)]">({slice.percentage}%)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
