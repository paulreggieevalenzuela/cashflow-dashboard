import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { balanceDueOf, isCheckInPlaceholder } from "@/lib/cashflow/visit-status";
import { db } from "@/lib/db/client";
import { getInvoiceSummaries } from "@/lib/db/invoices";
import { cleanDisplayName, normalizeNameKey } from "@/lib/db/patients";
import {
  branches,
  invoices,
  patients,
  payments,
  transactions,
} from "@/lib/db/schema";
import type { VisitStatus } from "@/lib/cashflow/visit-status";

export const PATIENT_PAGE_SIZE = 25;

export const PATIENT_FILTERS = [
  { key: "all", label: "All patients" },
  { key: "balance", label: "Has a balance" },
  { key: "recall", label: "Recall due" },
  { key: "recent", label: "Seen in the last 30 days" },
  { key: "lapsed", label: "Not seen in 6 months" },
] as const;
export type PatientFilter = (typeof PATIENT_FILTERS)[number]["key"];

export function parsePatientFilter(value: string | undefined): PatientFilter {
  return PATIENT_FILTERS.some((filter) => filter.key === value)
    ? (value as PatientFilter)
    : "all";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function daysAgo(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** One row per patient with everything the list shows, worked out in the
 * database (not in the browser) so it stays quick as patients grow. */
function patientStats() {
  const lineTotals = db
    .select({
      invoiceId: transactions.invoiceId,
      total: sql<string>`sum(${transactions.amountPaid})`.as("line_total"),
    })
    .from(transactions)
    .groupBy(transactions.invoiceId)
    .as("line_totals");
  const payTotals = db
    .select({
      invoiceId: payments.invoiceId,
      paid: sql<string>`sum(${payments.amount})`.as("paid_total"),
    })
    .from(payments)
    .groupBy(payments.invoiceId)
    .as("pay_totals");

  return db
    .select({
      patientId: invoices.patientId,
      lastVisit: sql<
        string | null
      >`max(case when ${invoices.transactionType} = 'Visit' then ${invoices.visitDate} end)`.as(
        "last_visit",
      ),
      visits:
        sql<number>`count(case when ${invoices.transactionType} = 'Visit' then 1 end)::int`.as(
          "visit_count",
        ),
      invoiceCount: sql<number>`count(*)::int`.as("invoice_count"),
      openCount:
        sql<number>`count(case when ${invoices.status} <> 'Cleared' then 1 end)::int`.as(
          "open_count",
        ),
      balance:
        sql<string>`coalesce(sum(greatest(coalesce(${lineTotals.total}, 0) - coalesce(${payTotals.paid}, 0), 0)), 0)`.as(
          "balance_due",
        ),
      openStatus: sql<
        string | null
      >`(array_agg(${invoices.status} order by ${invoices.visitDate} desc) filter (where ${invoices.status} <> 'Cleared'))[1]`.as(
        "open_status",
      ),
      // A recall is pending only if no later visit exists, so only the most
      // recent visit's recall counts.
      nextRecall: sql<
        string | null
      >`(array_agg(${invoices.recallDate} order by ${invoices.visitDate} desc, ${invoices.createdAt} desc))[1]`.as(
        "next_recall",
      ),
    })
    .from(invoices)
    .leftJoin(lineTotals, eq(lineTotals.invoiceId, invoices.id))
    .leftJoin(payTotals, eq(payTotals.invoiceId, invoices.id))
    .groupBy(invoices.patientId)
    .as("stats");
}

export type PatientListRow = {
  id: string;
  fullName: string;
  contactNumber: string;
  lastVisitDate: string | null;
  visitCount: number;
  /** All invoices on file (visits and reservations). */
  invoiceCount: number;
  /** Invoices still being worked on (not Cleared). */
  openCount: number;
  balanceDue: number;
  openStatus: VisitStatus | null;
  nextRecall: string | null;
};

export type PatientsPage = { rows: PatientListRow[]; total: number };

export async function listPatientsPage(input: {
  q?: string;
  filter: PatientFilter;
  page: number;
  today: string;
}): Promise<PatientsPage> {
  const stats = patientStats();
  const conditions = [];

  const search = input.q?.trim();
  if (search) {
    const term = `%${search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    conditions.push(
      or(ilike(patients.fullName, term), ilike(patients.contactNumber, term)),
    );
  }
  switch (input.filter) {
    case "balance":
      conditions.push(sql`coalesce(${stats.balance}, 0) > 0.005`);
      break;
    case "recall":
      conditions.push(
        sql`${stats.nextRecall} is not null and ${stats.nextRecall} <= ${input.today}`,
      );
      break;
    case "recent":
      conditions.push(sql`${stats.lastVisit} >= ${daysAgo(input.today, 30)}`);
      break;
    case "lapsed":
      conditions.push(
        sql`(${stats.lastVisit} is null or ${stats.lastVisit} < ${daysAgo(input.today, 183)})`,
      );
      break;
    default:
      break;
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [count]] = await Promise.all([
    db
      .select({
        id: patients.id,
        fullName: patients.fullName,
        contactNumber: patients.contactNumber,
        lastVisit: stats.lastVisit,
        visits: stats.visits,
        invoiceCount: stats.invoiceCount,
        openCount: stats.openCount,
        balance: stats.balance,
        openStatus: stats.openStatus,
        nextRecall: stats.nextRecall,
      })
      .from(patients)
      .leftJoin(stats, eq(stats.patientId, patients.id))
      .where(where)
      .orderBy(sql`${stats.lastVisit} desc nulls last`, asc(patients.nameKey))
      .limit(PATIENT_PAGE_SIZE)
      .offset((Math.max(input.page, 1) - 1) * PATIENT_PAGE_SIZE),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(patients)
      .leftJoin(stats, eq(stats.patientId, patients.id))
      .where(where),
  ]);

  return {
    total: count?.count ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      contactNumber: row.contactNumber,
      lastVisitDate: row.lastVisit ?? null,
      visitCount: row.visits ?? 0,
      invoiceCount: row.invoiceCount ?? 0,
      openCount: row.openCount ?? 0,
      balanceDue: round2(Number(row.balance ?? 0)),
      openStatus: (row.openStatus as VisitStatus | null) ?? null,
      nextRecall: row.nextRecall ?? null,
    })),
  };
}

// ── Patient profile ──────────────────────────────────────────────────

export type PatientInvoiceRow = {
  invoiceId: string;
  firstLineId: string;
  visitDate: string;
  invoiceNumber: string;
  transactionType: string;
  procedures: string[];
  dentist: string;
  branchName: string;
  paymentType: string;
  totalDue: number;
  collected: number;
  balanceDue: number;
  status: VisitStatus;
  loaPending: boolean;
  loaMissing: boolean;
  visitIssue: string | null;
};

export type PatientProfile = {
  patient: {
    id: string;
    fullName: string;
    contactNumber: string;
    notes: string;
    createdAt: string;
  };
  invoices: PatientInvoiceRow[];
  totals: {
    visits: number;
    billed: number;
    paid: number;
    balanceDue: number;
    lastVisitDate: string | null;
    nextRecall: { date: string; reason: string } | null;
  };
  /** The PWD / Senior ID last used by this patient, if any. */
  lastDiscountId: { type: string; number: string } | null;
};

export async function getPatientProfile(
  patientId: string,
): Promise<PatientProfile | undefined> {
  const [patient] = await db
    .select()
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);
  if (!patient) {
    return undefined;
  }

  const headers = await db
    .select({
      id: invoices.id,
      visitDate: invoices.visitDate,
      invoiceNumber: invoices.invoiceNumber,
      transactionType: invoices.transactionType,
      recallDate: invoices.recallDate,
      recallReason: invoices.recallReason,
      discountIdType: invoices.discountIdType,
      discountIdNumber: invoices.discountIdNumber,
      branchName: branches.name,
    })
    .from(invoices)
    .leftJoin(branches, eq(branches.id, invoices.branchId))
    .where(eq(invoices.patientId, patientId))
    .orderBy(desc(invoices.visitDate), desc(invoices.createdAt));

  const ids = headers.map((header) => header.id);
  const [summaries, lineRows] = await Promise.all([
    getInvoiceSummaries(ids),
    ids.length === 0
      ? Promise.resolve([])
      : db
          .select({
            invoiceId: transactions.invoiceId,
            id: transactions.id,
            procedure: transactions.procedure,
            dentist: transactions.dentist,
            paymentType: transactions.paymentType,
          })
          .from(transactions)
          .where(inArray(transactions.invoiceId, ids))
          .orderBy(asc(transactions.lineNumber), asc(transactions.createdAt)),
  ]);

  const linesByInvoice = new Map<string, typeof lineRows>();
  for (const line of lineRows) {
    if (!line.invoiceId) continue;
    const list = linesByInvoice.get(line.invoiceId) ?? [];
    list.push(line);
    linesByInvoice.set(line.invoiceId, list);
  }

  const rows: PatientInvoiceRow[] = headers.flatMap((header) => {
    const lines = linesByInvoice.get(header.id);
    const summary = summaries[header.id];
    if (!lines || lines.length === 0 || !summary) {
      return [];
    }
    return [
      {
        invoiceId: header.id,
        firstLineId: lines[0].id,
        visitDate: header.visitDate,
        invoiceNumber: header.invoiceNumber,
        transactionType: header.transactionType,
        procedures: lines
          .map((line) => line.procedure)
          .filter((name) => !isCheckInPlaceholder(name)),
        dentist: [
          ...new Set(lines.map((line) => line.dentist).filter(Boolean)),
        ].join(", "),
        branchName: header.branchName ?? "",
        paymentType: lines[0].paymentType,
        totalDue: summary.totalDue,
        collected: summary.collected,
        balanceDue: balanceDueOf(summary.totalDue, summary.collected),
        status: summary.status,
        loaPending: summary.loaPending,
        loaMissing: summary.loaMissing,
        visitIssue: summary.visitIssue,
      },
    ];
  });

  const visitRows = rows.filter((row) => row.transactionType === "Visit");
  const latest = headers[0];
  const withId = headers.find((header) => header.discountIdNumber);

  return {
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      contactNumber: patient.contactNumber,
      notes: patient.notes,
      createdAt: patient.createdAt.toISOString(),
    },
    invoices: rows,
    totals: {
      visits: visitRows.length,
      billed: round2(rows.reduce((sum, row) => sum + row.totalDue, 0)),
      paid: round2(rows.reduce((sum, row) => sum + row.collected, 0)),
      balanceDue: round2(rows.reduce((sum, row) => sum + row.balanceDue, 0)),
      lastVisitDate: visitRows[0]?.visitDate ?? null,
      nextRecall: latest?.recallDate
        ? { date: latest.recallDate, reason: latest.recallReason }
        : null,
    },
    lastDiscountId: withId
      ? { type: withId.discountIdType, number: withId.discountIdNumber }
      : null,
  };
}

// ── Create / edit / merge ────────────────────────────────────────────

export type PatientInput = {
  fullName: string;
  contactNumber: string;
  notes: string;
};

export type PatientResult =
  | { ok: true; id: string }
  | { ok: false; message: string; existingId?: string };

async function findByKey(key: string) {
  const [row] = await db
    .select({ id: patients.id, fullName: patients.fullName })
    .from(patients)
    .where(eq(patients.nameKey, key))
    .limit(1);
  return row;
}

export async function createPatient(
  input: PatientInput,
): Promise<PatientResult> {
  const fullName = cleanDisplayName(input.fullName);
  const key = normalizeNameKey(input.fullName);
  if (!key) {
    return { ok: false, message: "Please enter the patient's name." };
  }
  const existing = await findByKey(key);
  if (existing) {
    return {
      ok: false,
      message: `${existing.fullName} is already on file.`,
      existingId: existing.id,
    };
  }
  const [row] = await db
    .insert(patients)
    .values({
      fullName,
      nameKey: key,
      contactNumber: input.contactNumber.trim(),
      notes: input.notes.trim(),
    })
    .returning({ id: patients.id });
  return { ok: true, id: row.id };
}

export async function updatePatient(
  id: string,
  input: PatientInput,
): Promise<PatientResult> {
  const fullName = cleanDisplayName(input.fullName);
  const key = normalizeNameKey(input.fullName);
  if (!key) {
    return { ok: false, message: "Please enter the patient's name." };
  }
  const clash = await findByKey(key);
  if (clash && clash.id !== id) {
    return {
      ok: false,
      message: `${clash.fullName} is already on file. Use "Merge duplicate" to combine the two.`,
      existingId: clash.id,
    };
  }
  await db
    .update(patients)
    .set({
      fullName,
      nameKey: key,
      contactNumber: input.contactNumber.trim(),
      notes: input.notes.trim(),
    })
    .where(eq(patients.id, id));
  // Visits keep showing the name they were saved with, so keep the stored
  // display name in step with the patient record.
  await db
    .update(transactions)
    .set({ patientName: fullName })
    .where(eq(transactions.patientId, id));
  return { ok: true, id };
}

/**
 * Moves every visit of `sourceId` onto `targetId` and removes the duplicate
 * record. Used to fix the same person saved under two spellings.
 */
export async function mergePatients(
  sourceId: string,
  targetId: string,
): Promise<{ ok: true; movedVisits: number } | { ok: false; message: string }> {
  if (sourceId === targetId) {
    return { ok: false, message: "Pick a different patient to merge into." };
  }
  const [source, target] = await Promise.all([
    db.select().from(patients).where(eq(patients.id, sourceId)).limit(1),
    db.select().from(patients).where(eq(patients.id, targetId)).limit(1),
  ]);
  if (!source[0] || !target[0]) {
    return { ok: false, message: "One of the patients no longer exists." };
  }
  const moved = await db
    .update(invoices)
    .set({ patientId: targetId })
    .where(eq(invoices.patientId, sourceId))
    .returning({ id: invoices.id });
  await db
    .update(transactions)
    .set({ patientId: targetId, patientName: target[0].fullName })
    .where(eq(transactions.patientId, sourceId));
  // Keep the contact number / notes of the removed record if the kept one has none.
  await db
    .update(patients)
    .set({
      contactNumber: target[0].contactNumber || source[0].contactNumber,
      notes: [target[0].notes, source[0].notes].filter(Boolean).join("\n"),
    })
    .where(eq(patients.id, targetId));
  await db.delete(patients).where(eq(patients.id, sourceId));
  return { ok: true, movedVisits: moved.length };
}
