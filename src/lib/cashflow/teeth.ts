/**
 * Teeth on a procedure line, in FDI two-digit numbering.
 *
 *   Permanent: 11–18, 21–28, 31–38, 41–48
 *   Primary:   51–55, 61–65, 71–75, 81–85
 *
 * plus the whole-mouth words `upper arch`, `lower arch` and `full mouth`.
 * Pure functions, no imports — shared by the form (live checking and the
 * suggested quantity) and the server (what is actually saved).
 */

const PERMANENT_QUADRANTS = [1, 2, 3, 4];
const PRIMARY_QUADRANTS = [5, 6, 7, 8];

function isValidFdi(value: number): boolean {
  const quadrant = Math.floor(value / 10);
  const position = value % 10;
  if (PERMANENT_QUADRANTS.includes(quadrant)) {
    return position >= 1 && position <= 8;
  }
  if (PRIMARY_QUADRANTS.includes(quadrant)) {
    return position >= 1 && position <= 5;
  }
  return false;
}

export const ARCH_WORDS = ["upper arch", "lower arch", "full mouth"] as const;
export type ArchWord = (typeof ARCH_WORDS)[number];

export type ParsedTeeth = {
  /** Valid tooth numbers, in the order typed, without duplicates. */
  teeth: number[];
  /** Whole-mouth words used, without duplicates. */
  arches: ArchWord[];
  /** Pieces that are not a valid tooth number or arch word. */
  invalid: string[];
  /** The cleaned-up text to save, e.g. "11, 12, upper arch". */
  normalized: string;
};

/**
 * Reads what staff typed: numbers and arch words separated by commas,
 * spaces, semicolons, slashes or "and". Anything else is reported in
 * `invalid` rather than silently dropped.
 */
export function parseTeeth(input: string | null | undefined): ParsedTeeth {
  let text = (input ?? "").toLowerCase();
  const arches: ArchWord[] = [];
  for (const word of ARCH_WORDS) {
    if (text.includes(word)) {
      arches.push(word);
      text = text.split(word).join(" ");
    }
  }

  const teeth: number[] = [];
  const invalid: string[] = [];
  const pieces = text
    .split(/[\s,;/&+]+|\band\b/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  for (const piece of pieces) {
    if (/^\d{2}$/.test(piece) && isValidFdi(Number(piece))) {
      const tooth = Number(piece);
      if (!teeth.includes(tooth)) {
        teeth.push(tooth);
      }
    } else {
      invalid.push(piece);
    }
  }

  const normalized = [...teeth.map(String), ...arches].join(", ");
  return { teeth, arches, invalid, normalized };
}

/** An error message for the field, or null when it reads fine (or is blank). */
export function teethError(input: string | null | undefined): string | null {
  const { invalid } = parseTeeth(input);
  if (invalid.length === 0) {
    return null;
  }
  const shown = invalid.slice(0, 3).join(", ");
  return `${shown} ${invalid.length === 1 ? "isn't" : "aren't"} a valid tooth. Use FDI numbers (11–48 permanent, 51–85 primary) or upper arch / lower arch / full mouth.`;
}

/** How many teeth were entered (arch words are not counted as teeth). */
export function countTeeth(input: string | null | undefined): number {
  return parseTeeth(input).teeth.length;
}

/** How many arches were entered: upper = 1, lower = 1, full mouth = 2. */
export function countArches(input: string | null | undefined): number {
  const { arches } = parseTeeth(input);
  if (arches.includes("full mouth")) {
    return 2;
  }
  return arches.length;
}
