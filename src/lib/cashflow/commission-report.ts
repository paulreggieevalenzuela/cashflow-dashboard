/**
 * Dentist commission report: every procedure line a dentist did in a period,
 * with the commission it earned, subtotalled per dentist. Pure (no database,
 * no React) so the screen, the CSV and the Excel file share the same numbers.
 * The database side is `src/lib/db/commission-report.ts`.
 *
 * The commission on each line is the amount stored when the line was saved
 * (see `computeCommission` in pricing.ts), so a later rate change never
 * rewrites past commission.
 */

import { isHmoPayment, round2 } from "@/lib/cashflow/pricing";
import { formatSheetDate, isValidIsoDate } from "@/lib/cashflow/day-end";
import type { Cell, SheetInput } from "@/lib/cashflow/xlsx";

export type CommissionRow = {
  /** Visit date, YYYY-MM-DD. */
  date: string;
  visitId: string;
  patientName: string;
  dentist: string;
  branchName: string;
  procedure: string;
  paymentType: string;
  /** What the line netted after card fees and tax: the base for the rate. */
  netCollection: number;
  commission: number;
};

export type CommissionReport = {
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
  branchName: string;
  /** "All dentists" or one dentist's name. */
  dentistLabel: string;
  rows: CommissionRow[];
};

export type DentistCommissionTotal = {
  dentist: string;
  lines: number;
  netCollection: number;
  commission: number;
  /** Lines with money collected but no commission (no rate set, or an HMO
   * procedure with no HMO rate). */
  linesWithoutCommission: number;
};

export function summarizeCommission(rows: CommissionRow[]): {
  perDentist: DentistCommissionTotal[];
  totals: { lines: number; netCollection: number; commission: number };
} {
  const byDentist = new Map<string, DentistCommissionTotal>();
  for (const row of rows) {
    const entry = byDentist.get(row.dentist) ?? {
      dentist: row.dentist,
      lines: 0,
      netCollection: 0,
      commission: 0,
      linesWithoutCommission: 0,
    };
    entry.lines += 1;
    entry.netCollection = round2(entry.netCollection + row.netCollection);
    entry.commission = round2(entry.commission + row.commission);
    if (row.commission === 0 && row.netCollection > 0) {
      entry.linesWithoutCommission += 1;
    }
    byDentist.set(row.dentist, entry);
  }
  const perDentist = [...byDentist.values()].sort((a, b) =>
    a.dentist.localeCompare(b.dentist),
  );
  return {
    perDentist,
    totals: {
      lines: rows.length,
      netCollection: round2(
        perDentist.reduce((sum, item) => sum + item.netCollection, 0),
      ),
      commission: round2(
        perDentist.reduce((sum, item) => sum + item.commission, 0),
      ),
    },
  };
}

/** Commission as a percent of net collection ("" when nothing to compare). */
export function effectivePercent(row: {
  netCollection: number;
  commission: number;
}): string {
  if (!(row.netCollection > 0) || row.commission === 0) return "";
  return `${round2((row.commission / row.netCollection) * 100)}%`;
}

export function commissionFileName(from: string, to: string): string {
  return from === to
    ? `ADT_Commission_${from}`
    : `ADT_Commission_${from}_to_${to}`;
}

export const COMMISSION_HEADERS = [
  "Date",
  "Visit ID",
  "Patient Name",
  "Dentist",
  "Branch",
  "Procedure",
  "Payment Type",
  "Net Collection",
  "Commission",
  "Rate",
] as const;

/** "October 3, 2026" or "October 1, 2026 – October 31, 2026". */
export function formatSheetDateRange(from: string, to: string): string {
  return from === to
    ? formatSheetDate(from, true)
    : `${formatSheetDate(from, true)} – ${formatSheetDate(to, true)}`;
}

function periodLabel(report: CommissionReport): string {
  return formatSheetDateRange(report.from, report.to);
}

/** Detail sheet: lines grouped by dentist, each group followed by its
 * subtotal, then the grand total. */
export function buildCommissionDetailSheet(
  report: CommissionReport,
): SheetInput {
  const rows: Cell[][] = [];
  const boldRows: number[] = [];
  const push = (row: Cell[], bold = false) => {
    if (bold) boldRows.push(rows.length);
    rows.push(row);
  };

  push(
    [`DENTIST COMMISSION REPORT`, "", "", periodLabel(report), report.branchName, report.dentistLabel],
    true,
  );
  push([]);
  push([...COMMISSION_HEADERS], true);

  const { perDentist, totals } = summarizeCommission(report.rows);
  for (const group of perDentist) {
    for (const row of report.rows.filter((r) => r.dentist === group.dentist)) {
      push([
        formatSheetDate(row.date),
        row.visitId,
        row.patientName,
        row.dentist,
        row.branchName,
        row.procedure,
        row.paymentType,
        row.netCollection,
        row.commission,
        isHmoPayment(row.paymentType)
          ? `${effectivePercent(row)}${effectivePercent(row) ? " (HMO)" : "HMO"}`
          : effectivePercent(row),
      ]);
    }
    push(
      [`Total — ${group.dentist}`, "", "", "", "", "", "", group.netCollection, group.commission],
      true,
    );
    push([]);
  }
  if (report.rows.length === 0) {
    push(["No procedures for this period."]);
  } else {
    push(["Grand total", "", "", "", "", "", "", totals.netCollection, totals.commission], true);
  }
  return {
    name: "Detail",
    rows,
    boldRows,
    columnWidths: [16, 18, 26, 18, 16, 36, 22, 15, 14, 12],
  };
}

/** Summary sheet: one line per dentist. */
export function buildCommissionSummarySheet(
  report: CommissionReport,
): SheetInput {
  const { perDentist, totals } = summarizeCommission(report.rows);
  const rows: Cell[][] = [
    [`DENTIST COMMISSION SUMMARY`, periodLabel(report), report.branchName],
    [],
    ["Dentist", "Procedures", "Net Collection", "Commission", "Lines with no commission"],
    ...perDentist.map((item) => [
      item.dentist,
      item.lines,
      item.netCollection,
      item.commission,
      item.linesWithoutCommission,
    ]),
    [],
    ["Total", totals.lines, totals.netCollection, totals.commission],
  ];
  return {
    name: "Summary",
    rows,
    boldRows: [0, 2, rows.length - 1],
    columnWidths: [28, 14, 16, 14, 26],
  };
}

/** CSV rows: the detail lines first, then the per-dentist summary. */
export function buildCommissionCsvRows(report: CommissionReport): Cell[][] {
  return [
    ...buildCommissionDetailSheet(report).rows,
    [],
    ...buildCommissionSummarySheet(report).rows,
  ];
}


export type CommissionFilters = {
  from: string;
  to: string;
  branchId: string | null;
  dentistUserId: string | null;
  branchName: string;
  dentistLabel: string;
};

/**
 * Reads the filters from a page or download link. A bad or missing date
 * falls back to this month so far; "from" is never after "to"; an unknown
 * branch or dentist means "all".
 */
export function parseCommissionFilters(
  raw: {
    from?: string | null;
    to?: string | null;
    branch?: string | null;
    dentist?: string | null;
  },
  context: {
    today: string;
    branches: Array<{ id: string; name: string }>;
    dentists: Array<{ id: string; name: string }>;
  },
): CommissionFilters {
  const monthStart = `${context.today.slice(0, 8)}01`;
  let from = isValidIsoDate(raw.from) ? raw.from : monthStart;
  let to = isValidIsoDate(raw.to) ? raw.to : context.today;
  if (from > to) [from, to] = [to, from];
  const branch = context.branches.find((item) => item.id === raw.branch);
  const dentist = context.dentists.find((item) => item.id === raw.dentist);
  return {
    from,
    to,
    branchId: branch?.id ?? null,
    dentistUserId: dentist?.id ?? null,
    branchName: branch?.name ?? "All branches",
    dentistLabel: dentist?.name ?? "All dentists",
  };
}
