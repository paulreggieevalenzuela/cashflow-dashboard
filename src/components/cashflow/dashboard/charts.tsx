"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CHART_OTHER_COLOR } from "@/lib/cashflow/chart-palette";

/**
 * Small, dependency-free SVG chart primitives. No charting library is
 * installed — these are plain inline SVG so they inherit the app's
 * existing Tailwind light/dark tokens for chrome (grid, axis, text) rather
 * than needing a second theming system. Series colors are fixed hex (see
 * chart-palette.ts) since an SVG presentation attribute can't respond to a
 * `dark:` class the way chrome/text can — see the note in the dashboard
 * write-up about that tradeoff.
 *
 * All three charts below share one hover/focus tooltip layer (`ChartTooltip`
 * + the `TooltipState` it renders) instead of the browser's native SVG
 * `<title>` — a `<title>` only appears after a ~1s hover delay, isn't
 * styled, and offers no keyboard-focus equivalent. Every mark that can be
 * hovered can also be reached with Tab/Shift+Tab and announces the same
 * value via `aria-label`, per the "tooltips enhance, they never gate" rule.
 */

type TrendPoint = { label: string; total: number };

type TooltipRow = { label: string; value: string; color?: string };

type TooltipState = { x: number; y: number; title?: string; rows: TooltipRow[] } | null;

/**
 * Shared hover/focus tooltip overlay for all three charts below — plain
 * HTML positioned over the chart's `relative` wrapper (not SVG), so it can
 * use an ordinary box-shadow/z-index instead of fighting SVG stacking.
 * `x`/`y` are pixel offsets from the wrapper's own top-left corner; the
 * inline `clamp()` on `left` keeps the box from running past the card's
 * edges when the active point is near either end of the chart.
 */
function ChartTooltip({ tooltip }: { tooltip: TooltipState }) {
  if (!tooltip) return null;

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 min-w-[7rem] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      style={{
        left: `clamp(48px, ${tooltip.x}px, calc(100% - 48px))`,
        top: tooltip.y,
        transform: "translate(-50%, calc(-100% - 10px))",
      }}
    >
      {tooltip.title && (
        <p className="mb-1 font-medium text-zinc-500 dark:text-zinc-400">{tooltip.title}</p>
      )}
      <ul className="space-y-1">
        {tooltip.rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            {row.color && (
              <span
                aria-hidden="true"
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="text-zinc-500 dark:text-zinc-400">{row.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendLineChart({
  points,
  color,
  formatValue = (value: number) => value.toString(),
  ariaLabel,
  seriesName = "Value",
}: {
  points: TrendPoint[];
  color: string;
  formatValue?: (value: number) => string;
  ariaLabel: string;
  /** Row label shown in the hover/focus tooltip — defaults to something
   * generic since this chart only ever plots one series. */
  seriesName?: string;
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

  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  function showForIndex(index: number) {
    const point = coords[index];
    const container = containerRef.current;
    if (!point || !container) return;
    const rect = container.getBoundingClientRect();
    const scale = rect.width / width;
    setActiveIndex(index);
    setTooltip({
      x: point.x * scale,
      y: point.y * scale,
      title: point.label,
      rows: [{ label: seriesName, value: formatValue(point.total), color }],
    });
  }

  function clearActive() {
    setActiveIndex(null);
    setTooltip(null);
  }

  // The crosshair snaps to the nearest data position rather than following
  // the raw pointer — readers aim at a date, never at a 2px line (see
  // references/interaction.md in the dataviz skill).
  function handlePointerMove(event: ReactPointerEvent<SVGRectElement>) {
    const container = containerRef.current;
    if (!container || coords.length === 0) return;
    const rect = container.getBoundingClientRect();
    const scale = rect.width / width;
    const svgX = (event.clientX - rect.left) / scale;
    const index =
      stepX > 0
        ? Math.min(coords.length - 1, Math.max(0, Math.round((svgX - paddingX) / stepX)))
        : 0;
    showForIndex(index);
  }

  const active = activeIndex !== null ? coords[activeIndex] : null;

  return (
    <div ref={containerRef} className="relative">
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

        {active && (
          <line
            x1={active.x}
            x2={active.x}
            y1={paddingTop}
            y2={baselineY}
            className="stroke-zinc-300 dark:stroke-zinc-600"
            strokeWidth={1}
          />
        )}

        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={i === activeIndex ? 5 : i === coords.length - 1 ? 4 : 2.5}
            fill={color}
            stroke={i === activeIndex ? "white" : "none"}
            strokeWidth={i === activeIndex ? 2 : 0}
            className={i === activeIndex ? "dark:stroke-zinc-950" : undefined}
            tabIndex={0}
            role="button"
            aria-label={`${c.label}: ${formatValue(c.total)}`}
            style={{ outline: "none" }}
            onFocus={() => showForIndex(i)}
            onBlur={clearActive}
          />
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

        {/* Transparent hit strip spanning the whole plot area, painted last
            so it sits on top and captures the pointer everywhere — not just
            directly over the thin line or 2.5px markers. */}
        <rect
          x={paddingX}
          y={0}
          width={plotWidth}
          height={height}
          fill="transparent"
          onPointerMove={handlePointerMove}
          onPointerLeave={clearActive}
        />
      </svg>
      <ChartTooltip tooltip={tooltip} />
    </div>
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

  const containerRef = useRef<HTMLDivElement>(null);
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  // One tooltip, every series: hovering or focusing anywhere in a group's
  // column surfaces every series' value at that X, not just whichever bar
  // the pointer happens to land on (references/interaction.md).
  function showForGroup(groupIndex: number) {
    const point = points[groupIndex];
    const container = containerRef.current;
    if (!point || !container) return;
    const rect = container.getBoundingClientRect();
    const scale = rect.width / width;
    const groupX = paddingX + groupWidth * groupIndex;
    const tallest = Math.max(...point.values, 0);
    const topY = paddingTop + plotHeight - (tallest / maxValue) * plotHeight;

    setActiveGroup(groupIndex);
    setTooltip({
      x: (groupX + groupWidth / 2) * scale,
      y: topY * scale,
      title: point.label,
      rows: series.map((s, i) => ({
        label: s.name,
        value: formatValue(point.values[i] ?? 0),
        color: s.color,
      })),
    });
  }

  function clearActive() {
    setActiveGroup(null);
    setTooltip(null);
  }

  return (
    <div ref={containerRef} className="relative">
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
          const isActive = activeGroup === groupIndex;
          const isDimmed = activeGroup !== null && !isActive;

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
                    fillOpacity={isDimmed ? 0.35 : 1}
                    className="transition-opacity"
                  />
                );
              })}
              <text
                x={groupX + groupWidth / 2}
                y={height - 6}
                textAnchor="middle"
                className={`text-[10px] font-medium ${
                  isActive ? "fill-zinc-700 dark:fill-zinc-300" : "fill-zinc-400 dark:fill-zinc-500"
                }`}
              >
                {point.label}
              </text>
              {/* One hit target for the whole column — bigger than any
                  single bar, and the reason a hover/focus here can list
                  every series at once. */}
              <rect
                x={groupX}
                y={0}
                width={groupWidth}
                height={height}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${point.label}: ${series
                  .map((s, i) => `${s.name} ${formatValue(point.values[i] ?? 0)}`)
                  .join(", ")}`}
                style={{ outline: "none" }}
                onPointerEnter={() => showForGroup(groupIndex)}
                onPointerMove={() => showForGroup(groupIndex)}
                onPointerLeave={clearActive}
                onFocus={() => showForGroup(groupIndex)}
                onBlur={clearActive}
              />
            </g>
          );
        })}
      </svg>
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

export type DonutSegment = { label: string; value: number; color: string };

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  formatValue,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: string;
  /** When provided, the hover/focus tooltip shows the formatted absolute
   * value alongside the percentage (e.g. "₱12.3K · 34%"). Leave it unset
   * when `segments[].value` isn't a real, formattable amount (the
   * illustrative sample-data cards) — the tooltip then falls back to
   * percentage only, same as the chart's previous native-tooltip text. */
  formatValue?: (value: number) => string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const radius = 60;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;
  const size = 160;
  const center = size / 2;

  // Precompute each segment's starting offset functionally (a running total
  // built via reduce, not a mutated variable inside .map) so the render stays pure.
  const cumulativeStarts = segments.reduce<number[]>((starts, segment, index) => {
    const previousStart = starts[index - 1] ?? 0;
    const previousFraction = index === 0 ? 0 : segments[index - 1].value / total;
    starts.push(previousStart + previousFraction);
    return starts;
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  function rowsFor(index: number): TooltipRow[] {
    const segment = segments[index];
    const pct = `${((segment.value / total) * 100).toFixed(0)}%`;
    return [
      {
        label: segment.label,
        value: formatValue ? `${formatValue(segment.value)} · ${pct}` : pct,
        color: segment.color,
      },
    ];
  }

  function showFromPointer(index: number, event: ReactPointerEvent<SVGCircleElement>) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setActiveIndex(index);
    setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, rows: rowsFor(index) });
  }

  // No pointer position to key off on keyboard focus, so the tooltip is
  // placed at the segment's own midpoint instead — reproducing the chart's
  // -90deg CSS rotation (12 o'clock start instead of SVG's native 3
  // o'clock) so it lands over the actual arc, not where it'd sit pre-rotation.
  function showFromFocus(index: number) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scale = rect.width / size;
    const midFraction = cumulativeStarts[index] + segments[index].value / total / 2;
    const angle = midFraction * 2 * Math.PI;
    const dx = radius * Math.cos(angle);
    const dy = radius * Math.sin(angle);
    setActiveIndex(index);
    setTooltip({
      x: rect.width / 2 + dy * scale,
      y: rect.height / 2 - dx * scale,
      rows: rowsFor(index),
    });
  }

  function clearActive() {
    setActiveIndex(null);
    setTooltip(null);
  }

  return (
    <div ref={containerRef} className="relative mx-auto h-40 w-40">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-40 w-40 -rotate-90" role="img" aria-label="Breakdown chart — see the list beside it for values">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          className="stroke-zinc-100 dark:stroke-zinc-800"
          strokeWidth={strokeWidth}
        />
        {segments.map((segment, index) => {
          const fraction = segment.value / total;
          const dash = Math.max(fraction * circumference - 2, 0);
          const offset = -cumulativeStarts[index] * circumference;
          const isActive = activeIndex === index;
          const isDimmed = activeIndex !== null && !isActive;
          return (
            <circle
              key={segment.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={isActive ? strokeWidth + 3 : strokeWidth}
              strokeOpacity={isDimmed ? 0.4 : 1}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={offset}
              className="cursor-pointer transition-[stroke-width,stroke-opacity]"
              tabIndex={0}
              role="button"
              aria-label={`${segment.label}: ${((segment.value / total) * 100).toFixed(0)}%`}
              style={{ outline: "none" }}
              onPointerEnter={(event) => showFromPointer(index, event)}
              onPointerMove={(event) => showFromPointer(index, event)}
              onPointerLeave={clearActive}
              onFocus={() => showFromFocus(index)}
              onBlur={clearActive}
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{centerValue}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{centerLabel}</span>
      </div>
      <ChartTooltip tooltip={tooltip} />
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
