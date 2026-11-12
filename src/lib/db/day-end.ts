import { resolveHmoDetails } from "@/lib/cashflow/patient-hmo";
import { getVisitHmoDetails } from "@/lib/db/visit-hmo";
import { listPatientHmos } from "@/lib/db/patient-hmos";
import { and, asc, eq, gte, inArray, lt, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  branches,
  invoices,
  patients,
  payments,
  transactions,
} from "@/lib/db/schema";
import {
  hmoNameFor,
  type DayEndReport,
  type DayEndRow,
} from "@/lib/cashflow/day-end";
import { isCheckInPlaceholder } from "@/lib/cashflow/visit-status";
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
  paymentType: string;
  teeth: string;
  loaNumber: string;
};

function distinct(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

type HmoInfo = Pick<
  DayEndRow,
  "hmo" | "hmoEmployer" | "hmoAccountNumber" | "loaNumber" | "loeNumber" | "teeth"
> & { billed: number; billedByHmo: Array<{ name: string; amount: number }> };

const NO_HMO: HmoInfo = {
  hmo: "",
  hmoEmployer: "",
  hmoAccountNumber: "",
  loaNumber: "",
  loeNumber: "",
  teeth: "",
  billed: 0,
  billedByHmo: [],
};

/**
 * HMO details per visit, so they can sit on the same row as the payment:
 * company, the patient's account number, LOA (per procedure, falling back to
 * the visit's), LOE, tooth numbers and what is billed to the HMO. A visit with
 * no HMO procedure line gets blanks.
 */
async function getHmoInfoByInvoice(
  invoiceIds: string[],
  linesByInvoice: Map<string, LineLite[]>,
): Promise<Map<string, HmoInfo>> {
  const result = new Map<string, HmoInfo>();
  const hmoInvoiceIds = invoiceIds.filter((id) =>
    (linesByInvoice.get(id) ?? []).some(
      (line) =>
        isHmoPayment(line.paymentType) && !isCheckInPlaceholder(line.procedure),
    ),
  );
  if (hmoInvoiceIds.length === 0) return result;

  const visits = await db
    .select({
      id: invoices.id,
      loaNumber: invoices.loaNumber,
      loeNumber: invoices.loeNumber,
      patientId: invoices.patientId,
    })
    .from(invoices)
    .where(inArray(invoices.id, hmoInvoiceIds));

  // The patient's HMO account number comes from their profile.
  const patientIds = [
    ...new Set(visits.flatMap((visit) => (visit.patientId ? [visit.patientId] : []))),
  ];
  const accountByPatient = new Map<string, string>();
  if (patientIds.length > 0) {
    try {
      const accounts = await db
        .select({ id: patients.id, account: patients.hmoAccountNumber })
        .from(patients)
        .where(inArray(patients.id, patientIds));
      for (const account of accounts) accountByPatient.set(account.id, account.account);
    } catch (error) {
      // Until 2026-10-patient-hmo-details.sql is run the column is missing:
      // the report still works, without account numbers.
      if (!String(error).includes("hmo_account_number")) throw error;
      console.warn("Day end: patients.hmo_account_number is missing.");
    }
  }
  // A patient can have several HMOs: show the account number of each HMO the
  // visit is billed to.
  const hmosByPatient = await listPatientHmos(patientIds);
  // What was typed on each visit for its HMO wins over the patient's profile.
  const visitDetails = await getVisitHmoDetails(visits.map((visit) => visit.id));

  /** The patient's company and account number for each HMO the visit is billed to. */
  const detailsFor = (visit: (typeof visits)[number], hmoNames: string[]) => {
    const patientId = visit.patientId;
    const entries = patientId ? (hmosByPatient.get(patientId) ?? []) : [];
    const legacy = patientId ? (accountByPatient.get(patientId) ?? "") : "";
    const typed = visitDetails.get(visit.id);
    const found = (hmoNames.length > 0 ? hmoNames : [typed?.hmoName || entries[0]?.company || ""]).map(
      (name) => {
        const details = resolveHmoDetails({
          visit: typed,
          entries,
          hmoName: name,
          legacyAccountNumber: legacy,
        });
        // HMO payments only (no HMO line, no typed HMO): the patient's first HMO, as before.
        if (hmoNames.length === 0 && !typed && entries[0]) {
          return { employer: entries[0].employer, accountNumber: entries[0].accountNumber };
        }
        return details;
      },
    );
    return {
      hmoEmployer: distinct(found.map((item) => item.employer)).join(", "),
      hmoAccountNumber: distinct(found.map((item) => item.accountNumber)).join(", "),
    };
  };

  for (const visit of visits) {
    const hmoLines = (linesByInvoice.get(visit.id) ?? []).filter(
      (line) =>
        isHmoPayment(line.paymentType) && !isCheckInPlaceholder(line.procedure),
    );
    const byHmo = new Map<string, number>();
    for (const line of hmoLines) {
      const name = hmoNameFor(line.paymentType);
      byHmo.set(name, round2((byHmo.get(name) ?? 0) + Number(line.amountPaid)));
    }
    result.set(visit.id, {
      billedByHmo: [...byHmo].map(([name, amount]) => ({ name, amount })),
      hmo: distinct(hmoLines.map((line) => hmoNameFor(line.paymentType))).join(" / "),
      ...detailsFor(visit, [...byHmo.keys()]),
      loaNumber: distinct(
        hmoLines.map((line) => line.loaNumber || visit.loaNumber || ""),
      ).join(", "),
      loeNumber: (visit.loeNumber ?? "").trim(),
      teeth: distinct(hmoLines.map((line) => line.teeth ?? "")).join(", "),
      billed: round2(
        hmoLines.reduce((sum, line) => sum + Number(line.amountPaid), 0),
      ),
    });
  }
  return result;
}

/**
 * Everything received on `date` for one branch (or every branch when
 * `branchId` is null): one row per payment, then one row for each visit of
 * that day that took no payment. HMO details sit on the same row (no
 * separate HMO section, no expenses).
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
      visitDate: invoices.visitDate,
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
            paymentType: transactions.paymentType,
            teeth: transactions.teeth,
            loaNumber: transactions.loaNumber,
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
  const hmoInfo = await getHmoInfoByInvoice(allInvoiceIds, linesByInvoice);
  // The billed amount goes on a visit's first row only, so it counts once.
  const billedShown = new Set<string>();
  const hmoFor = (
    invoiceId: string | null | undefined,
    /** The visit is dated on the report's day, so what it is billed to the
     * HMO counts here (an HMO pays later: there may be no payment at all). */
    visitIsToday: boolean,
    /** An HMO payment received for the visit (counted instead of the billed
     * amount when the visit is from an earlier day). */
    payment?: { name: string; amount: number },
  ) => {
    const info = (invoiceId && hmoInfo.get(invoiceId)) || NO_HMO;
    const first = Boolean(invoiceId) && !billedShown.has(invoiceId as string);
    if (invoiceId && info.hmo) billedShown.add(invoiceId);
    const parts: Array<{ name: string; amount: number }> = [];
    if (info.hmo && visitIsToday && first) parts.push(...info.billedByHmo);
    else if (info.hmo && !visitIsToday && payment && isHmoPayment(payment.name)) {
      parts.push(payment);
    }
    return {
      hmo: info.hmo,
      hmoEmployer: info.hmoEmployer,
      hmoAccountNumber: info.hmoAccountNumber,
      loaNumber: info.loaNumber,
      loeNumber: info.loeNumber,
      teeth: info.teeth,
      hmoBilled: first && info.hmo ? info.billed : 0,
      hmoParts: parts,
    };
  };

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
      ...hmoFor(payment.invoiceId, payment.visitDate === input.date, {
        name: payment.paymentType,
        amount,
      }),
    });
  }

  for (const visit of unpaidVisits) {
    const visitLines = linesByInvoice.get(visit.id) ?? [];
    const first = visitLines[0];
    if (!first) continue;
    const hmo = hmoFor(visit.id, true);
    const realLines = visitLines.filter((line) => !isCheckInPlaceholder(line.procedure));
    // A visit billed only to an HMO has no payment because the HMO pays
    // later: its row carries the HMO amount instead of "no payment".
    const hmoOnly =
      hmo.hmo !== "" &&
      realLines.length > 0 &&
      realLines.every((line) => isHmoPayment(line.paymentType));
    const billed = hmo.hmoBilled;
    rows.push({
      kind: hmoOnly ? "hmo" : "unpaid",
      date: input.date,
      visitId: first.visitId,
      patientName: first.patientName,
      dentist: distinct(visitLines.map((line) => line.dentist)).join(" / "),
      procedure: distinct(visitLines.map((line) => line.procedure)).join(" + "),
      paymentType: hmoOnly ? hmo.hmo : "",
      amountPaid: hmoOnly ? billed : 0,
      vatExclusive: hmoOnly
        ? round2(realLines.reduce((sum, line) => sum + Number(line.vatExclusive), 0))
        : 0,
      vatAmount: hmoOnly
        ? round2(realLines.reduce((sum, line) => sum + Number(line.vatAmount), 0))
        : 0,
      invoiceNumber: visit.invoiceNumber,
      remarks: distinct(visitLines.map((line) => line.remarks)).join(" · "),
      merchantFee: 0,
      withholdingTax: 0,
      netCollection: hmoOnly ? billed : 0,
      isReservation: visit.transactionType === "Reservation",
      ...hmo,
    });
  }

  return { branchName, date: input.date, rows };
}

/**
 * Which clinic a person may look at. An owner / admin picks any clinic or
 * "all"; a dentist or staff member is kept to the clinics ticked for them
 * (one clinic: locked to it; several: they pick among those). An account
 * with no clinic ticked picks any single clinic, as before.
 */
export type DayEndScope = {
  branchId: string | null;
  /** True when there is nothing to choose (a single clinic). */
  locked: boolean;
  /** The clinics they may look at; null = every clinic. */
  allowedBranchIds: string[] | null;
};

export async function resolveDayEndScope(input: {
  userId: string;
  role: string;
  /** Their home clinic and every clinic ticked for them (from the session). */
  branchId?: string | null;
  branchIds?: string[] | null;
  requested: string | undefined;
  branchList: Array<{ id: string }>;
}): Promise<DayEndScope> {
  const known = (id: string | undefined) =>
    id && input.branchList.some((branch) => branch.id === id) ? id : null;

  if (input.role === "admin") {
    return { branchId: known(input.requested), locked: false, allowedBranchIds: null };
  }
  const allowed = (input.branchIds ?? []).filter((id) => known(id));
  if (allowed.length === 0) {
    return {
      branchId: known(input.requested) ?? input.branchList[0]?.id ?? null,
      locked: false,
      allowedBranchIds: input.branchList.map((branch) => branch.id),
    };
  }
  const requested = known(input.requested);
  const branchId =
    requested && allowed.includes(requested)
      ? requested
      : input.branchId && allowed.includes(input.branchId)
        ? input.branchId
        : allowed[0];
  return { branchId, locked: allowed.length === 1, allowedBranchIds: allowed };
}

/** May this scope look at something that belongs to this clinic? */
export function scopeCoversBranch(
  scope: Pick<DayEndScope, "allowedBranchIds">,
  branchId: string | null,
): boolean {
  return (
    scope.allowedBranchIds === null ||
    (branchId !== null && scope.allowedBranchIds.includes(branchId))
  );
}
