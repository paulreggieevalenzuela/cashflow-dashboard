import { and, asc, eq, gte, inArray, lt, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getUserById } from "@/lib/db/users";
import {
  branches,
  expenses,
  invoices,
  patients,
  payments,
  transactions,
} from "@/lib/db/schema";
import {
  hmoNameFor,
  type DayEndExpense,
  type DayEndHmoVisit,
  type DayEndReport,
  type DayEndRow,
} from "@/lib/cashflow/day-end";
import { getInvoiceSummaries } from "@/lib/db/invoices";
import {
  allocateProportionally,
  computeMerchantFee,
  isHmoPayment,
  round2,
} from "@/lib/cashflow/pricing";

/** The clinic works on Manila time (UTC+8): a "day" runs 00:00–24:00 there. */
function manilaDayRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Marks payment rows created by the CSV import (kept out of the remarks). */
const IMPORT_NOTE = "Imported from Day End report";

type LineLite = {
  invoiceId: string | null;
  visitId: string;
  patientName: string;
  dentist: string;
  procedure: string;
  amountPaid: string;
  vatExclusive: string;
  vatAmount: string;
  withholdingTax: string;
  remarks: string;
  lineNumber: number | null;
};

function distinct(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/**
 * The day's visits that are billed to an HMO: one entry per visit whose
 * procedures use an HMO payment method, with what was billed, what has been
 * received so far, the LOA number and the patient's HMO account number.
 * A visit counts on its own visit date, paid or not.
 */
async function getHmoVisits(input: {
  date: string;
  branchFilter: ReturnType<typeof eq> | undefined;
}): Promise<DayEndHmoVisit[]> {
  const dayVisits = await db
    .select({
      id: invoices.id,
      loaNumber: invoices.loaNumber,
      patientId: invoices.patientId,
    })
    .from(invoices)
    .where(and(eq(invoices.visitDate, input.date), input.branchFilter))
    .orderBy(asc(invoices.createdAt));
  if (dayVisits.length === 0) return [];

  const ids = dayVisits.map((visit) => visit.id);
  const [lines, summaries] = await Promise.all([
    db
      .select({
        invoiceId: transactions.invoiceId,
        patientName: transactions.patientName,
        procedure: transactions.procedure,
        paymentType: transactions.paymentType,
      })
      .from(transactions)
      .where(inArray(transactions.invoiceId, ids))
      .orderBy(asc(transactions.lineNumber), asc(transactions.createdAt)),
    getInvoiceSummaries(ids),
  ]);

  const linesByInvoice = new Map<string, typeof lines>();
  for (const line of lines) {
    if (!line.invoiceId) continue;
    const list = linesByInvoice.get(line.invoiceId) ?? [];
    list.push(line);
    linesByInvoice.set(line.invoiceId, list);
  }

  const hmoVisits = dayVisits.flatMap((visit) => {
    const visitLines = linesByInvoice.get(visit.id) ?? [];
    const hmoLine = visitLines.find((line) => isHmoPayment(line.paymentType));
    if (!hmoLine) return [];
    return [{ visit, visitLines, hmoLine }];
  });
  if (hmoVisits.length === 0) return [];

  // The patient's HMO account number comes from their profile.
  const patientIds = [
    ...new Set(
      hmoVisits.flatMap(({ visit }) => (visit.patientId ? [visit.patientId] : [])),
    ),
  ];
  const accountByPatient = new Map<string, string>();
  if (patientIds.length > 0) {
    try {
      const accounts = await db
        .select({
          id: patients.id,
          hmoAccountNumber: patients.hmoAccountNumber,
        })
        .from(patients)
        .where(inArray(patients.id, patientIds));
      for (const account of accounts) {
        accountByPatient.set(account.id, account.hmoAccountNumber);
      }
    } catch (error) {
      // Until 2026-10-patient-hmo-details.sql is run the column does not
      // exist: the report still works, just without account numbers.
      if (!String(error).includes("hmo_account_number")) throw error;
      console.warn(
        "Day end: patients.hmo_account_number is missing; run scripts/sql/2026-10-patient-hmo-details.sql.",
      );
    }
  }

  return hmoVisits.map(({ visit, visitLines, hmoLine }) => {
    const summary = summaries[visit.id];
    return {
      hmo: hmoNameFor(hmoLine.paymentType),
      patientName: hmoLine.patientName,
      hmoAccountNumber: visit.patientId
        ? (accountByPatient.get(visit.patientId) ?? "")
        : "",
      loaNumber: visit.loaNumber,
      procedure: distinct(visitLines.map((line) => line.procedure)).join(" + "),
      billed: round2(summary?.totalDue ?? 0),
      received: round2(summary?.collected ?? 0),
    };
  });
}

/**
 * Everything received on `date` for one branch (or every branch when
 * `branchId` is null): one row per payment, then one row for each visit of
 * that day that took no payment, plus the branch's expenses for the day.
 *
 * VAT and withholding tax are kept on the procedure lines of a visit, so a
 * payment carries the share of them that matches its share of the bill. The
 * merchant fee is worked out from the payment's own amount and method.
 */
export async function getDayEndReport(input: {
  branchId: string | null;
  date: string;
}): Promise<DayEndReport> {
  const { start, end } = manilaDayRange(input.date);
  const branchFilter = input.branchId
    ? eq(invoices.branchId, input.branchId)
    : undefined;

  let branchName = "All branches";
  if (input.branchId) {
    const [branch] = await db
      .select({ name: branches.name })
      .from(branches)
      .where(eq(branches.id, input.branchId))
      .limit(1);
    branchName = branch?.name ?? "Branch";
  }

  const dayPayments = await db
    .select({
      id: payments.id,
      invoiceId: payments.invoiceId,
      amount: payments.amount,
      paymentType: payments.paymentType,
      referenceNo: payments.referenceNo,
      notes: payments.notes,
      paidAt: payments.paidAt,
      invoiceNumber: invoices.invoiceNumber,
      transactionType: invoices.transactionType,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(
      and(gte(payments.paidAt, start), lt(payments.paidAt, end), branchFilter),
    )
    .orderBy(asc(payments.paidAt), asc(payments.createdAt));

  const paidInvoiceIds = [
    ...new Set(
      dayPayments.flatMap((payment) =>
        payment.invoiceId ? [payment.invoiceId] : [],
      ),
    ),
  ];

  // Visits of the day with no payment received that day.
  const unpaidVisits = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      transactionType: invoices.transactionType,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.visitDate, input.date),
        branchFilter,
        paidInvoiceIds.length > 0
          ? notInArray(invoices.id, paidInvoiceIds)
          : undefined,
      ),
    )
    .orderBy(asc(invoices.createdAt));

  const allInvoiceIds = [
    ...paidInvoiceIds,
    ...unpaidVisits.map((visit) => visit.id),
  ];
  const lines: LineLite[] =
    allInvoiceIds.length === 0
      ? []
      : await db
          .select({
            invoiceId: transactions.invoiceId,
            visitId: transactions.visitId,
            patientName: transactions.patientName,
            dentist: transactions.dentist,
            procedure: transactions.procedure,
            amountPaid: transactions.amountPaid,
            vatExclusive: transactions.vatExclusive,
            vatAmount: transactions.vatAmount,
            withholdingTax: transactions.withholdingTax,
            remarks: transactions.remarks,
            lineNumber: transactions.lineNumber,
          })
          .from(transactions)
          .where(inArray(transactions.invoiceId, allInvoiceIds))
          .orderBy(asc(transactions.lineNumber), asc(transactions.createdAt));

  const linesByInvoice = new Map<string, LineLite[]>();
  for (const line of lines) {
    if (!line.invoiceId) continue;
    const list = linesByInvoice.get(line.invoiceId) ?? [];
    list.push(line);
    linesByInvoice.set(line.invoiceId, list);
  }

  const rows: DayEndRow[] = [];

  // Withholding tax is shared across an invoice's payments of the day in
  // proportion to their amounts.
  const paymentsByInvoice = new Map<string, typeof dayPayments>();
  for (const payment of dayPayments) {
    if (!payment.invoiceId) continue;
    const list = paymentsByInvoice.get(payment.invoiceId) ?? [];
    list.push(payment);
    paymentsByInvoice.set(payment.invoiceId, list);
  }
  const whtByPayment = new Map<string, number>();
  for (const [invoiceId, list] of paymentsByInvoice) {
    const invoiceLines = linesByInvoice.get(invoiceId) ?? [];
    const totalWht = invoiceLines.reduce(
      (sum, line) => sum + Number(line.withholdingTax),
      0,
    );
    const shares = allocateProportionally(
      totalWht,
      list.map((payment) => Number(payment.amount)),
    );
    list.forEach((payment, index) => whtByPayment.set(payment.id, shares[index]));
  }

  for (const payment of dayPayments) {
    const invoiceLines = payment.invoiceId
      ? (linesByInvoice.get(payment.invoiceId) ?? [])
      : [];
    const first = invoiceLines[0];
    const amount = round2(Number(payment.amount));
    const totalDue = invoiceLines.reduce(
      (sum, line) => sum + Number(line.amountPaid),
      0,
    );
    const share = totalDue > 0 ? Math.min(1, amount / totalDue) : 0;
    const vatExclusive = round2(
      invoiceLines.reduce((sum, line) => sum + Number(line.vatExclusive), 0) *
        share,
    );
    const vatAmount = round2(
      invoiceLines.reduce((sum, line) => sum + Number(line.vatAmount), 0) *
        share,
    );
    const fee = computeMerchantFee(amount, payment.paymentType);
    const wht = whtByPayment.get(payment.id) ?? 0;
    const notes = payment.notes === IMPORT_NOTE ? "" : payment.notes;
    rows.push({
      kind: "payment",
      date: input.date,
      visitId: first?.visitId ?? "",
      patientName: first?.patientName ?? "",
      dentist: distinct(invoiceLines.map((line) => line.dentist)).join(" / "),
      procedure: distinct(invoiceLines.map((line) => line.procedure)).join(
        " + ",
      ),
      paymentType: payment.paymentType,
      amountPaid: amount,
      vatExclusive,
      vatAmount,
      invoiceNumber: payment.invoiceNumber,
      remarks: distinct([
        payment.referenceNo,
        notes,
        ...invoiceLines.map((line) => line.remarks),
      ]).join(" · "),
      merchantFee: fee,
      withholdingTax: wht,
      netCollection: Math.max(0, round2(amount - fee - wht)),
      isReservation: payment.transactionType === "Reservation",
    });
  }

  for (const visit of unpaidVisits) {
    const visitLines = linesByInvoice.get(visit.id) ?? [];
    const first = visitLines[0];
    if (!first) continue;
    rows.push({
      kind: "unpaid",
      date: input.date,
      visitId: first.visitId,
      patientName: first.patientName,
      dentist: distinct(visitLines.map((line) => line.dentist)).join(" / "),
      procedure: distinct(visitLines.map((line) => line.procedure)).join(" + "),
      paymentType: "",
      amountPaid: 0,
      vatExclusive: 0,
      vatAmount: 0,
      invoiceNumber: visit.invoiceNumber,
      remarks: distinct(visitLines.map((line) => line.remarks)).join(" · "),
      merchantFee: 0,
      withholdingTax: 0,
      netCollection: 0,
      isReservation: visit.transactionType === "Reservation",
    });
  }

  const hmoVisits = await getHmoVisits({
    date: input.date,
    branchFilter,
  });

  const dayExpenses: DayEndExpense[] = (
    await db
      .select({
        category: expenses.category,
        description: expenses.description,
        paymentMethod: expenses.paymentMethod,
        amount: expenses.amount,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.date, input.date),
          input.branchId ? eq(expenses.branchId, input.branchId) : undefined,
        ),
      )
      .orderBy(asc(expenses.createdAt))
  ).map((expense) => ({
    category: expense.category,
    description: expense.description,
    paymentMethod: expense.paymentMethod,
    amount: round2(Number(expense.amount)),
  }));

  return { branchName, date: input.date, rows, hmoVisits, expenses: dayExpenses };
}

/**
 * Which branch a person may look at. An admin picks any branch or "all"; a
 * staff member or dentist who belongs to a branch is kept to it; one with no
 * branch picks any single branch.
 */
export async function resolveDayEndScope(input: {
  userId: string;
  role: string;
  requested: string | undefined;
  branchList: Array<{ id: string }>;
}): Promise<{ branchId: string | null; locked: boolean }> {
  const known = (id: string | undefined) =>
    id && input.branchList.some((branch) => branch.id === id) ? id : null;

  if (input.role === "admin") {
    return { branchId: known(input.requested), locked: false };
  }
  const user = await getUserById(input.userId);
  if (user?.branchId) {
    return { branchId: user.branchId, locked: true };
  }
  return {
    branchId: known(input.requested) ?? input.branchList[0]?.id ?? null,
    locked: false,
  };
}
