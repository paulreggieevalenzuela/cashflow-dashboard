/**
 * Helpers for turning raw, loosely-formatted clinic data (CSV cells, or
 * form input) into the normalized shapes the cashflow schema expects.
 */

const MONTH_NAME_TO_NUMBER: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

const MONTH_NUMBER_TO_NAME = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLINIC_DATE_PATTERN = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/;

/**
 * Parses a date into YYYY-MM-DD. Accepts both an already-normalized ISO
 * date and the clinic export's "July 1 2026" style. Returns null if the
 * value is blank or not recognized, rather than guessing.
 */
export function parseClinicDate(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }

  if (ISO_DATE_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(CLINIC_DATE_PATTERN);
  if (match) {
    const [, monthName, day, year] = match;
    const month = MONTH_NAME_TO_NUMBER[monthName.toLowerCase()];
    if (month) {
      return `${year}-${month}-${day.padStart(2, "0")}`;
    }
  }

  return null;
}

/** Derives { month, year } from a YYYY-MM-DD date string. */
export function deriveMonthYear(isoDate: string): { month: string; year: number } | null {
  if (!ISO_DATE_PATTERN.test(isoDate)) {
    return null;
  }
  const [year, month] = isoDate.split("-");
  const monthIndex = Number(month) - 1;
  const monthName = MONTH_NUMBER_TO_NAME[monthIndex];
  if (!monthName) {
    return null;
  }
  return { month: monthName, year: Number(year) };
}

/**
 * Parses a currency-ish string ("1,565,686.00", "105.15%", "") into a
 * number. Blank input returns 0 rather than null, since most numeric
 * cashflow fields (fees, VAT, etc.) are legitimately zero.
 */
export function parseAmount(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const trimmed = (value ?? "").toString().trim().replace(/[,%]/g, "");
  if (!trimmed) {
    return 0;
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Net collection = amount paid, less merchant fees and withholding tax.
 * Used as a fallback when a source row doesn't already provide it (e.g.
 * manual entry), never to override a value the CSV explicitly supplied.
 */
export function computeNetCollection(
  amountPaid: number,
  merchantFee: number,
  withholdingTax: number,
): number {
  return Math.max(0, round2(amountPaid - merchantFee - withholdingTax));
}
