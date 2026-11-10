/**
 * HMO billing: the rows, totals, billing number and download sheet.
 *
 * Pure (no database, no React) so the HMO billing tab, the print page, the
 * Excel / CSV files and the Day end report all build from the same rows and
 * cannot disagree. The database side is `src/lib/db/hmo-billing.ts`.
 *
 * A billing is one HMO + one branch + one cut-off range (From and To, clinic
 * dates, both days included). It has one row per procedure line.
 */

import { branchCode } from "@/lib/cashflow/transaction-number";
import { round2 } from "@/lib/cashflow/pricing";
import { formatSheetDate } from "@/lib/cashflow/day-end";
import type { Cell, SheetInput } from "@/lib/cashflow/xlsx";

/** One procedure line billed to an HMO. */
export type HmoBillingLine = {
  /** The procedure line it was made from (transactions.id). */
  transactionId: string;
  /** YYYY-MM-DD */
  visitDate: string;
  visitId: string;
  /** The HMO's name as used for the payment method, e.g. "Maxicare". */
  hmo: string;
  patientName: string;
  /** The patient's account (member) number with the HMO. */
  hmoAccountNumber: string;
  /** The procedure line's own LOA; blank = "LOA pending". */
  loaNumber: string;
  /** The visit's LOE (optional text). */
  loeNumber: string;
  procedure: string;
  /** FDI tooth numbers / arch words as entered, e.g. "11, 12". */
  teeth: string;
  /** What the line is billed to the HMO. */
  amount: number;
  /** The saved billing this line is already on ("" = not billed yet). */
  billedOn: string;
};

export const LOA_PENDING_TEXT = "LOA pending";

/** Rows go by visit date, then patient, then visit, keeping each visit's
 * own order of procedures. */
export function sortHmoLines(lines: HmoBillingLine[]): HmoBillingLine[] {
  return lines
    .map((line, index) => ({ line, index }))
    .sort(
      (a, b) =>
        a.line.visitDate.localeCompare(b.line.visitDate) ||
        a.line.patientName.localeCompare(b.line.patientName) ||
        a.line.visitId.localeCompare(b.line.visitId) ||
        a.index - b.index,
    )
    .map((entry) => entry.line);
}

export type HmoBillingTotals = {
  /** Total amount of billing. */
  total: number;
  lineCount: number;
  /** Different patients on the billing. */
  patientCount: number;
  /** Lines that have no LOA yet. */
  pendingLoaCount: number;
};

export function summarizeHmoLines(lines: HmoBillingLine[]): HmoBillingTotals {
  const patients = new Set<string>();
  let total = 0;
  let pending = 0;
  for (const line of lines) {
    patients.add(line.patientName.trim().toLowerCase());
    total = round2(total + line.amount);
    if (!line.loaNumber.trim()) pending += 1;
  }
  return {
    total,
    lineCount: lines.length,
    patientCount: patients.size,
    pendingLoaCount: pending,
  };
}

// ── The cut-off range ────────────────────────────────────────────────

export const MAX_RANGE_DAYS = 366;

/** A real calendar date typed as YYYY-MM-DD. */
function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function dayNumber(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** A cut-off range is valid when both dates are real, From is not after To,
 * and it covers at most a year. Returns the problem, or null. */
export function rangeProblem(
  from: string | null | undefined,
  to: string | null | undefined,
): string | null {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return "Pick a From date and a To date.";
  }
  if (from > to) return "The From date cannot be after the To date.";
  if (dayNumber(to) - dayNumber(from) + 1 > MAX_RANGE_DAYS) {
    return "A billing can cover at most one year.";
  }
  return null;
}

/** "November 1 – 15, 2026", "October 25 – November 9, 2026" or a single day. */
export function formatRange(from: string, to: string): string {
  if (from === to) return formatSheetDate(from, true);
  const [fromYear, fromMonth] = from.split("-");
  const [toYear, toMonth] = to.split("-");
  if (fromYear === toYear && fromMonth === toMonth) {
    const day = Number(from.split("-")[2]);
    return `${formatSheetDate(to, true).replace(/ (\d+),/, ` ${day} – $1,`)}`;
  }
  return `${formatSheetDate(from, true)} – ${formatSheetDate(to, true)}`;
}

// ── The billing number ───────────────────────────────────────────────

/** The branch part of the number (and the key of its running number). */
export function billingPrefix(branchName: string | null | undefined): string {
  return branchCode(branchName);
}

/** HMO-MAR-26-0001: branch code, 2-digit year, running number (at least 4
 * digits). The running number counts per branch per year. */
export function formatBillingNumber(
  prefix: string,
  year: number,
  sequence: number,
): string {
  const yy = String(year % 100).padStart(2, "0");
  return `HMO-${prefix}-${yy}-${String(sequence).padStart(4, "0")}`;
}

/** The clinic year (Manila time) a billing made at `now` belongs to. */
export function billingYear(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
  }).format(now);
  return Number(parts);
}

/** File name for the downloads: the billing number plus the HMO, e.g.
 * "HMO-MAR-26-0001_Maxicare". */
export function billingFileName(number: string, hmo: string): string {
  const safe = hmo.replace(/[^A-Za-z0-9]+/g, " ").trim().replace(/ /g, "-");
  return safe ? `${number}_${safe}` : number;
}

// ── The saved billing ────────────────────────────────────────────────

export type HmoBilling = {
  id: string;
  billingNumber: string;
  hmo: string;
  branchName: string;
  periodFrom: string;
  periodTo: string;
  totalAmount: number;
  lineCount: number;
  patientCount: number;
  pendingLoaCount: number;
  status: "Active" | "Void";
  createdByName: string;
  /** ISO */
  createdAt: string;
  voidedByName: string;
  voidedAt: string | null;
};

// ── Download sheet (Excel and CSV) ───────────────────────────────────

export const HMO_BILLING_HEADERS = [
  "No.",
  "Visit date",
  "Patient",
  "HMO account #",
  "LOA #",
  "LOE #",
  "Procedure",
  "Tooth #",
  "Amount",
] as const;

/**
 * The billing as rows of cells: a header block (billing number, HMO, branch,
 * cut-off range, total amount of billing), a blank row, the table, then the
 * total. Used for both Excel and CSV.
 */
export function buildHmoBillingSheet(
  billing: Pick<
    HmoBilling,
    | "billingNumber"
    | "hmo"
    | "branchName"
    | "periodFrom"
    | "periodTo"
    | "totalAmount"
    | "pendingLoaCount"
    | "status"
  >,
  lines: HmoBillingLine[],
): SheetInput {
  const rows: Cell[][] = [];
  const boldRows: number[] = [];
  const push = (row: Cell[], bold = false) => {
    if (bold) boldRows.push(rows.length);
    rows.push(row);
  };

  push(["HMO BILLING"], true);
  push(["Billing number", billing.billingNumber]);
  push(["HMO", billing.hmo]);
  push(["Branch", billing.branchName]);
  push(["Cut-off date", formatRange(billing.periodFrom, billing.periodTo)]);
  push(["Total amount of billing", billing.totalAmount], true);
  if (billing.status === "Void") push(["Status", "VOID"], true);
  push([]);
  push([...HMO_BILLING_HEADERS], true);
  lines.forEach((line, index) => {
    push([
      String(index + 1),
      formatSheetDate(line.visitDate),
      line.patientName,
      line.hmoAccountNumber,
      line.loaNumber.trim() || LOA_PENDING_TEXT,
      line.loeNumber,
      line.procedure,
      line.teeth,
      line.amount,
    ]);
  });
  push(["", "", "", "", "", "", "", "Total", billing.totalAmount], true);

  return {
    name: "HMO Billing",
    rows,
    boldRows,
    columnWidths: [16, 16, 28, 18, 18, 14, 40, 14, 14],
  };
}
