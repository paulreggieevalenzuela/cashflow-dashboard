/**
 * End-of-day (Day End) report: one row per payment received on the day for a
 * branch, laid out like the clinic's own "Day End Report" sheet, plus a
 * breakdown by payment method and the totals.
 *
 * Pure (no database, no React) so the screen, the CSV and the Excel file all
 * come from the same numbers, and so the arithmetic can be checked on its
 * own. The database side is `src/lib/db/day-end.ts`.
 */

import { isHmoPayment, round2 } from "@/lib/cashflow/pricing";
import type { Cell, SheetInput } from "@/lib/cashflow/xlsx";

export type DayEndRow = {
  /** A payment received that day, or a visit of that day with no payment. */
  kind: "payment" | "unpaid";
  /** YYYY-MM-DD */
  date: string;
  visitId: string;
  patientName: string;
  dentist: string;
  procedure: string;
  paymentType: string;
  /** What was received (card payments include their merchant fee). */
  amountPaid: number;
  vatExclusive: number;
  vatAmount: number;
  invoiceNumber: string;
  remarks: string;
  merchantFee: number;
  withholdingTax: number;
  netCollection: number;
  isReservation: boolean;
};

export type DayEndExpense = {
  category: string;
  description: string;
  paymentMethod: string;
  amount: number;
};

export type DayEndReport = {
  /** "All branches" or one branch's name. */
  branchName: string;
  /** YYYY-MM-DD */
  date: string;
  rows: DayEndRow[];
  expenses: DayEndExpense[];
};

/** The breakdown columns, in the order of the clinic's sheet. */
export const BREAKDOWN_COLUMNS = [
  "Cash",
  "GCash",
  "GoTyme",
  "POS - Debit",
  "POS - Credit",
  "BDO",
  "Maxicare",
  "Intellicare",
  "AVEGA",
  "Medicard",
  "Valucare",
  "Asiancare",
  "Elite",
] as const;

/** A real calendar date typed as YYYY-MM-DD. */
export function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const BREAKDOWN_OTHER = "Other / not stated";

/** Which breakdown column a payment type belongs to. */
export function breakdownColumnFor(paymentType: string): string {
  const type = paymentType.trim().toLowerCase();
  if (!type) return BREAKDOWN_OTHER;
  if (type.startsWith("pos")) {
    if (type.includes("debit")) return "POS - Debit";
    if (type.includes("credit")) return "POS - Credit";
    return BREAKDOWN_OTHER;
  }
  if (type === "elite dental network" || type === "elite") return "Elite";
  const match = BREAKDOWN_COLUMNS.find((name) => name.toLowerCase() === type);
  return match ?? BREAKDOWN_OTHER;
}

export type DayEndTotals = {
  /** Sum of everything received (HMO included), as the clinic's sheet totals. */
  collected: number;
  merchantFees: number;
  withholdingTax: number;
  netCollection: number;
  /** Part of `collected` paid through an HMO (billed to the HMO, not cash in hand). */
  hmo: number;
  /** Part of `collected` that is reservation fees. */
  reservationFees: number;
  /** `collected` less the HMO part. */
  collectedWithoutHmo: number;
  expenses: number;
  visitsWithoutPayment: number;
  paymentCount: number;
};

export function summarizeDayEnd(report: DayEndReport): {
  breakdown: Array<{ label: string; amount: number }>;
  totals: DayEndTotals;
} {
  const sums = new Map<string, number>(BREAKDOWN_COLUMNS.map((c) => [c, 0]));
  let collected = 0;
  let merchantFees = 0;
  let withholdingTax = 0;
  let netCollection = 0;
  let hmo = 0;
  let reservationFees = 0;
  let visitsWithoutPayment = 0;
  let paymentCount = 0;

  for (const row of report.rows) {
    if (row.kind === "unpaid") {
      visitsWithoutPayment += 1;
      continue;
    }
    paymentCount += 1;
    const column = breakdownColumnFor(row.paymentType);
    sums.set(column, round2((sums.get(column) ?? 0) + row.amountPaid));
    collected += row.amountPaid;
    merchantFees += row.merchantFee;
    withholdingTax += row.withholdingTax;
    netCollection += row.netCollection;
    if (isHmoPayment(row.paymentType)) hmo += row.amountPaid;
    if (row.isReservation) reservationFees += row.amountPaid;
  }

  const breakdown = [...BREAKDOWN_COLUMNS, BREAKDOWN_OTHER]
    .map((label) => ({ label, amount: round2(sums.get(label) ?? 0) }))
    // The clinic's columns always show; "Other" only when something is in it.
    .filter((item) => item.label !== BREAKDOWN_OTHER || item.amount !== 0);

  return {
    breakdown,
    totals: {
      collected: round2(collected),
      merchantFees: round2(merchantFees),
      withholdingTax: round2(withholdingTax),
      netCollection: round2(netCollection),
      hmo: round2(hmo),
      reservationFees: round2(reservationFees),
      collectedWithoutHmo: round2(collected - hmo),
      expenses: round2(
        report.expenses.reduce((sum, expense) => sum + expense.amount, 0),
      ),
      visitsWithoutPayment,
      paymentCount,
    },
  };
}

const MONTHS = [
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

/** "2026-10-03" → "October 3 2026" (the clinic's sheet style), or with
 * `comma` "October 3, 2026". */
export function formatSheetDate(iso: string, comma = false): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day || month < 1 || month > 12) return iso;
  return `${MONTHS[month - 1]} ${day}${comma ? "," : ""} ${year}`;
}

/** File name without the extension: ADT_EOD_<branch>_<date>. */
export function dayEndFileName(branchName: string, date: string): string {
  const slug =
    branchName
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "All";
  return `ADT_EOD_${slug}_${date}`;
}

export const DAY_END_HEADERS = [
  "Date",
  "Visit ID",
  "Patient Name",
  "Dentist",
  "Procedure",
  "Payment Type",
  "Amount Paid",
  "Vat Exclusive",
  "Vat Amount",
  "Invoice Number",
  "Remarks",
  "Merchant Fee",
  "Withholding Tax",
  "Net Collection",
] as const;

/** The report as a grid of cells, in the layout of the clinic's own sheet:
 * title and date, the payment rows, the breakdown by method, the totals and
 * (when there are any) the day's expenses. Used for both CSV and Excel. */
export function buildDayEndSheet(report: DayEndReport): SheetInput {
  const { breakdown, totals } = summarizeDayEnd(report);
  const rows: Cell[][] = [];
  const boldRows: number[] = [];
  const push = (row: Cell[], bold = false) => {
    if (bold) boldRows.push(rows.length);
    rows.push(row);
  };

  const title = `${report.branchName.toUpperCase()} DAY END REPORT`;
  push([title, "", "", "", formatSheetDate(report.date, true)], true);
  push([]);
  push([...DAY_END_HEADERS], true);

  for (const row of report.rows) {
    const unpaid = row.kind === "unpaid";
    push([
      formatSheetDate(row.date),
      row.visitId,
      row.patientName,
      row.dentist,
      row.procedure,
      row.paymentType,
      row.amountPaid,
      row.vatExclusive,
      row.vatAmount,
      row.invoiceNumber,
      unpaid ? row.remarks || "No payment recorded" : row.remarks,
      row.merchantFee,
      row.withholdingTax,
      row.netCollection,
    ]);
  }
  if (report.rows.length === 0) {
    push(["No payments or visits recorded for this day."]);
  }

  push([]);
  push(["Breakdown", ...breakdown.map((item) => item.label)], true);
  push(["", ...breakdown.map((item) => item.amount)]);
  push([]);
  push(["Total collected", totals.collected], true);
  push(["  of which HMO (billed to the HMO)", totals.hmo]);
  push(["  of which reservation fees", totals.reservationFees]);
  push(["Merchant fees", totals.merchantFees]);
  push(["Withholding tax", totals.withholdingTax]);
  push(["Net collection", totals.netCollection], true);

  if (report.expenses.length > 0) {
    push([]);
    push(["Expenses", "Description", "Paid by", "Amount"], true);
    for (const expense of report.expenses) {
      push([
        expense.category,
        expense.description,
        expense.paymentMethod,
        expense.amount,
      ]);
    }
    push(["Total expenses", "", "", totals.expenses], true);
  }

  return {
    name: "Day end",
    rows,
    boldRows,
    columnWidths: [16, 18, 26, 16, 36, 22, 14, 14, 12, 16, 34, 13, 15, 15],
  };
}
