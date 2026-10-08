import Papa from "papaparse";
import {
  CashflowTransactionSchema,
  type CashflowTransaction,
} from "@/lib/cashflow/schema";
import {
  computeNetCollection,
  deriveMonthYear,
  parseAmount,
  parseClinicDate,
} from "@/lib/cashflow/normalize";

export type CsvRowError = {
  /** 1-based line number in the original file, for user-facing messages. */
  line: number;
  message: string;
};

export type CsvParseResult = {
  transactions: CashflowTransaction[];
  errors: CsvRowError[];
  /** Branch named in the report's title row ("MARIKINA DAY END REPORT" →
   * "MARIKINA"), when there is one. Used to pre-select the branch. */
  branchName?: string;
};

const EXPECTED_HEADER_CELLS = ["Date", "Visit ID"];

/** The Day End report ends its table with a "Breakdown" block (totals by
 * payment method) and a "Total" row. Everything from the first such row on
 * is a summary, not data. */
const END_OF_TABLE_MARKER = /^(breakdown|total|grand total|summary)\b/i;

const TITLE_PATTERN = /^(.+?)\s+day\s*end\s*report\b/i;

function cleanHeaderCell(cell: string): string {
  return cell.replace(/\s+/g, " ").trim();
}

function toRecord(header: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  header.forEach((key, index) => {
    if (key) {
      record[key] = row[index] ?? "";
    }
  });
  return record;
}

/** True for the blank template rows some exports leave trailing after the real data. */
function isPlaceholderRow(raw: Record<string, string>): boolean {
  return !raw["Date"]?.trim() && !raw["Visit ID"]?.trim();
}

/**
 * The newer Day End report has no "Transaction Type" column, so work it out:
 * a Visit ID starting with `RES`, or a "Reservation Fee" procedure, is a
 * reservation; everything else is a visit. A value in the column always wins.
 */
function inferTransactionType(raw: Record<string, string>): string {
  const explicit = (raw["Transaction Type"] ?? "").trim();
  if (explicit) {
    return explicit;
  }
  const visitId = (raw["Visit ID"] ?? "").trim();
  const procedure = (raw["Procedure"] ?? "").trim();
  if (/^RES/i.test(visitId) || /reservation/i.test(procedure)) {
    return "Reservation";
  }
  return "Visit";
}

function findBranchName(rows: string[][], beforeIndex: number): string | undefined {
  for (const row of rows.slice(0, Math.max(beforeIndex, 0))) {
    for (const cell of row) {
      const match = cell.replace(/\s+/g, " ").trim().match(TITLE_PATTERN);
      if (match) {
        return match[1].trim();
      }
    }
  }
  return undefined;
}

function normalizeRow(raw: Record<string, string>) {
  const visitId = (raw["Visit ID"] ?? "").trim();
  const date = parseClinicDate(raw["Date"]);
  const monthYear = date ? deriveMonthYear(date) : null;

  const amountPaid = parseAmount(raw["Amount Paid"]);
  const merchantFee = parseAmount(raw["Merchant Fee"]);
  const withholdingTax = parseAmount(raw["Withholding Tax"]);
  const rawNetCollection = (raw["Net Collection"] ?? "").trim();

  return {
    date: date ?? "",
    visitId,
    patientName: (raw["Patient Name"] ?? "").trim(),
    transactionType: inferTransactionType(raw),
    visitType: (raw["Visit Type"] ?? "").trim(),
    dentist: (raw["Dentist"] ?? "").trim(),
    procedure: (raw["Procedure"] ?? "").trim(),
    paymentType: (raw["Payment Type"] ?? "").trim(),
    amountPaid,
    vatExclusive: parseAmount(raw["Vat Exclusive"]),
    vatAmount: parseAmount(raw["Vat Amount"]),
    month: monthYear?.month ?? "",
    year: monthYear?.year ?? 0,
    invoiceNumber: (raw["Invoice Number"] ?? "").trim(),
    remarks: (raw["Remarks"] ?? "").trim(),
    merchantFee,
    withholdingTax,
    // A blank Net Collection (the Day End report leaves it blank on
    // reservation fees) falls back to amount paid less fees and tax.
    netCollection: rawNetCollection
      ? parseAmount(rawNetCollection)
      : computeNetCollection(amountPaid, merchantFee, withholdingTax),
  };
}

/**
 * Parses the clinic's cashflow CSV export into validated transactions.
 *
 * Handles the quirks seen in real exports: a summary block (Target, Sales,
 * Lacking, %) sometimes sits above the real header row; a run of blank
 * template rows can trail after the real data; the Day End report ends
 * with a Breakdown/Total block; and the Day End report has no Transaction
 * Type, Visit Type, Month or Year columns (those are inferred or derived).
 *
 * Row ids are the Visit ID itself when it is unique in the file, so
 * re-importing a corrected file updates the same rows even if their order
 * changed. Only when a Visit ID repeats (several lines for one visit) is a
 * running number added to tell the lines apart.
 */
export function parseCashflowCsv(csvText: string): CsvParseResult {
  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: "greedy",
  });

  const rows = parsed.data;
  const headerIndex = rows.findIndex((row: string[]) => {
    const cleaned = row.map(cleanHeaderCell);
    return EXPECTED_HEADER_CELLS.every((expected) => cleaned.includes(expected));
  });

  if (headerIndex === -1) {
    return {
      transactions: [],
      errors: [
        {
          line: 0,
          message:
            "Couldn't find the expected header row (Date, Visit ID, ...). Is this a cashflow export?",
        },
      ],
    };
  }

  const branchName = findBranchName(rows, headerIndex);
  const header = rows[headerIndex].map(cleanHeaderCell);
  const dataRows = rows.slice(headerIndex + 1);

  type Candidate = { line: number; row: ReturnType<typeof normalizeRow> };
  const candidates: Candidate[] = [];
  let reachedSummary = false;

  dataRows.forEach((row: string[], index: number) => {
    if (reachedSummary) {
      return;
    }
    const raw = toRecord(header, row);
    if (isPlaceholderRow(raw)) {
      return;
    }
    const dateCell = (raw["Date"] ?? "").trim();
    if (END_OF_TABLE_MARKER.test(dateCell) && !parseClinicDate(dateCell)) {
      reachedSummary = true;
      return;
    }
    candidates.push({ line: headerIndex + 2 + index, row: normalizeRow(raw) });
  });

  const visitCounts = new Map<string, number>();
  for (const { row } of candidates) {
    visitCounts.set(row.visitId, (visitCounts.get(row.visitId) ?? 0) + 1);
  }
  const visitSequence = new Map<string, number>();

  const transactions: CashflowTransaction[] = [];
  const errors: CsvRowError[] = [];

  for (const { line, row } of candidates) {
    let id = `row-${line}`;
    if (row.visitId) {
      const sequence = (visitSequence.get(row.visitId) ?? 0) + 1;
      visitSequence.set(row.visitId, sequence);
      id = (visitCounts.get(row.visitId) ?? 1) > 1 ? `${row.visitId}-${sequence}` : row.visitId;
    }

    const result = CashflowTransactionSchema.safeParse({ ...row, id });
    if (result.success) {
      transactions.push(result.data);
    } else {
      errors.push({
        line,
        message: result.error.issues.map((issue) => issue.message).join("; "),
      });
    }
  }

  return { transactions, errors, branchName };
}
