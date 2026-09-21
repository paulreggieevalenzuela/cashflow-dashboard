import { CHART_OTHER_COLOR } from "@/lib/cashflow/chart-palette";

/**
 * Small, dependency-free SVG chart primitives. No charting library is
 * installed — these are plain inline SVG so they inherit the app's
 * existing Tailwind light/dark tokens for chrome (grid, axis, text) rather
 * than needing a second theming system. Series colors are fixed hex (see
 * chart-palette.ts) since an SVG presentation attribute can't respond to a
 * `dark:` class the way chrome/text can — see the note in the dashboard
 * write-up about that tradeoff.
 */

type TrendPoint = { label: string; total: number };

export function TrendLineChart({
  points,
  color,
  formatValue = (value: number) => value.toString(),
  ariaLabel,
}: {
  points: TrendPoint[];
  color: string;
  formatValue?: (value: number) => string;
  ariaLabel: string;
}) {
  const width = 600;
  const height = 220;
  const paddingX = 8;
  const paddingTop = 28;
  const paddingBottom = 24;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingTop - paddingBottom;

  const maxValue = Math.max(...points.map((point) => point.total), 1);
  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const coords = points.map((point, index) => ({
    ...point,
    x: paddingX + stepX * index,
    y: paddingTop + plotHeight - (point.total / maxValue) * plotHeight,
  }));

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const baselineY = paddingTop + plotHeight;
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords.at(-1)!.x.toFixed(1)} ${baselineY} L ${coords[0].x.toFixed(1)} ${baselineY} Z`
      : "";

  const last = coords.at(-1);
  const labelEvery = Math.max(1, Math.ceil(coords.length / 6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = paddingTop + plotHeight * t;
        return (
          <line
            key={t}
            x1={paddingX}
            x2={width - paddingX}
            y1={y}
            y2={y}
            className="stroke-zinc-100 dark:stroke-zinc-800"
            strokeWidth={1}
          />
        );
      })}

      {areaPath && <path d={areaPath} fill={color} fillOpacity={0.1} stroke="none" />}
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 4 : 2.5} fill={color}>
          <title>{`${c.label}: ${formatValue(c.total)}`}</title>
        </circle>
      ))}

      {last && (
        <text
          x={Math.min(last.x, width - 60)}
          y={Math.max(last.y - 10, 14)}
          textAnchor="end"
          className="fill-zinc-900 text-[13px] font-semibold dark:fill-zinc-50"
        >
          {formatValue(last.total)}
        </text>
      )}

      {coords.map((c, i) => {
        const showLabel = i === 0 || i === coords.length - 1 || i % labelEvery === 0;
        if (!showLabel) return null;
        return (
          <text
            key={i}
            x={c.x}
            y={height - 6}
            textAnchor="middle"
            className="fill-zinc-400 text-[10px] font-medium dark:fill-zinc-500"
          >
            {c.label.split(" ")[0]}
          </text>
        );
      })}
    </svg>
  );
}

export function GroupedBarChart({
  points,
  series,
  formatValue = (value: number) => value.toString(),
  ariaLabel,
}: {
  points: Array<{ label: string; values: number[] }>;
  series: Array<{ name: string; color: string }>;
  formatValue?: (value: number) => string;
  ariaLabel: string;
}) {
  const width = 600;
  const height = 220;
  const paddingX = 8;
  const paddingTop = 16;
  const paddingBottom = 24;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingTop - paddingBottom;

  const maxValue = Math.max(...points.flatMap((point) => point.values), 1);
  const groupWidth = points.length > 0 ? plotWidth / points.length : plotWidth;
  const barGap = 3;
  const barWidth = Math.max(
    4,
    Math.min(20, (groupWidth - barGap * (series.length + 1)) / Math.max(series.length, 1)),
  );

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = paddingTop + plotHeight * t;
        return (
          <line
            key={t}
            x1={paddingX}
            x2={width - paddingX}
            y1={y}
            y2={y}
            className="stroke-zinc-100 dark:stroke-zinc-800"
            strokeWidth={1}
          />
        );
      })}

      {points.map((point, groupIndex) => {
        const groupX = paddingX + groupWidth * groupIndex;
        const barsTotalWidth = barWidth * series.length + barGap * (series.length - 1);
        const startX = groupX + (groupWidth - barsTotalWidth) / 2;

        return (
          <g key={`${point.label}-${groupIndex}`}>
            {point.values.map((value, seriesIndex) => {
              const barHeight = (value / maxValue) * plotHeight;
              const x = startX + seriesIndex * (barWidth + barGap);
              const y = paddingTop + plotHeight - barHeight;
              return (
                <rect
                  key={series[seriesIndex]?.name ?? seriesIndex}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, 1)}
                  rx={2}
                  fill={series[seriesIndex]?.color}
                >
                  <title>{`${series[seriesIndex]?.name} · ${point.label}: ${formatValue(value)}`}</title>
                </rect>
              );
            })}
            <text
              x={groupX + groupWidth / 2}
              y={height - 6}
              textAnchor="middle"
              className="fill-zinc-400 text-[10px] font-medium dark:fill-zinc-500"
            >
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export type DonutSegment = { label: string; value: number; color: string };

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const radius = 60;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  // Precompute each segment's starting offset functionally (a running total
  // built via reduce, not a mutated variable inside .map) so the render stays pure.
  const cumulativeStarts = segments.reduce<number[]>((starts, segment, index) => {
    const previousStart = starts[index - 1] ?? 0;
    const previousFraction = index === 0 ? 0 : segments[index - 1].value / total;
    starts.push(previousStart + previousFraction);
    return starts;
  }, []);

  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90" role="img" aria-hidden="true">
        <circle
          cx={80}
          cy={80}
          r={radius}
          fill="none"
          className="stroke-zinc-100 dark:stroke-zinc-800"
          strokeWidth={strokeWidth}
        />
        {segments.map((segment, index) => {
          const fraction = segment.value / total;
          const dash = Math.max(fraction * circumference - 2, 0);
          const offset = -cumulativeStarts[index] * circumference;
          return (
            <circle
              key={segment.label}
              cx={80}
              cy={80}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={offset}
            >
              <title>{`${segment.label}: ${((segment.value / total) * 100).toFixed(0)}%`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{centerValue}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{centerLabel}</span>
      </div>
    </div>
  );
}

export function DonutLegend({ segments, total }: { segments: DonutSegment[]; total?: number }) {
  const sum = total ?? segments.reduce((s, seg) => s + seg.value, 0) ?? 1;
  return (
    <ul className="space-y-2 text-sm">
      {segments.map((segment) => (
        <li key={segment.label} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: segment.color }}
              aria-hidden="true"
            />
            {segment.label}
          </span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">
            {sum === 0 ? "0%" : `${Math.round((segment.value / sum) * 100)}%`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export { CHART_OTHER_COLOR };
