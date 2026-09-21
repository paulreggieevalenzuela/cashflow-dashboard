/**
 * Categorical hues, in fixed order — never reassigned per-render, never
 * cycled past this order. This is the validated default palette from the
 * data-viz skill (CVD Delta E >= 8, normal-vision Delta E >= 15 on adjacent
 * pairs, both light and dark). Fold anything past slot 5 into "Other"
 * rather than adding a 6th hue.
 */
export const CATEGORICAL_PALETTE = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
] as const;

export const CHART_OTHER_COLOR = "#a8a29e"; // neutral, for the "Other" bucket

/** Chart chrome — recessive by design, never competes with the data. */
export const CHART_GRID_COLOR = "#e1e0d9";
export const CHART_MUTED_TEXT = "#898781";

/** Brand primary — used for single-series marks (one line, one bar series). */
export const BRAND_LINE_COLOR = "#d97706"; // Tailwind amber-600
export const BRAND_LINE_FILL = "#d97706"; // paired with ~10% opacity for area washes
