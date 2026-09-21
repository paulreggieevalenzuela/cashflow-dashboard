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
};

const EXPECTED_HEADER_CELLS = ["Date", "Visit ID"];

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

function normalizeRow(raw: Record<string, string>, lineNumber: number) {
  const visitId = (raw["Visit ID"] ?? "").trim();
  const date = parseClinicDate(raw["Date"]);
  const monthYear = date ? deriveMonthYear(date) : null;

  const amountPaid = parseAmount(raw["Amount Paid"]);
  const merchantFee = parseAmount(raw["Merchant Fee"]);
  const withholdingTax = parseAmount(raw["Withholding Tax"]);
  const rawNetCollection = (raw["Net Collection"] ?? "").trim();

  return {
    id: `${visitId || "row"}-${lineNumber}`,
    date: date ?? "",
    visitId,
    patientName: (raw["Patient Name"] ?? "").trim(),
    transactionType: (raw["Transaction Type"] ?? "").trim(),
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
    netCollection: rawNetCollection
      ? parseAmount(rawNetCollection)
      : computeNetCollection(amountPaid, merchantFee, withholdingTax),
  };
}

/**
 * Parses the clinic's cashflow CSV export into validated transactions.
 *
 * Handles two quirks seen in real exports: a summary block (Target, Sales,
 * Lacking, %) sometimes sits above the real header row, and a run of blank
 * template rows can trail after the real data — both are skipped rather
 * than treated as data.
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

  const header = rows[headerIndex].map(cleanHeaderCell);
  const dataRows = rows.slice(headerIndex + 1);

  const transactions: CashflowTransaction[] = [];
  const errors: CsvRowError[] = [];
  let lineNumber = 0;

  dataRows.forEach((row: string[], index: number) => {
    const raw = toRecord(header, row);
    if (isPlaceholderRow(raw)) {
      return;
    }

    lineNumber += 1;
    const candidate = normalizeRow(raw, lineNumber);
    const result = CashflowTransactionSchema.safeParse(candidate);

    if (result.success) {
      transactions.push(result.data);
    } else {
      errors.push({
        line: headerIndex + 2 + index,
        message: result.error.issues.map((issue) => issue.message).join("; "),
      });
    }
  });

  return { transactions, errors };
}
