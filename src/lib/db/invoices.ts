import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  branches,
  invoices,
  patients,
  transactions,
  type InvoiceRow,
  type NewInvoiceRow,
} from "@/lib/db/schema";
import {
  computeNetCollection,
  deriveMonthYear,
} from "@/lib/cashflow/normalize";
import type { InvoiceInput } from "@/lib/cashflow/invoice-schema";
import {
  allocateProportionally,
  appliedToBill,
  computeListPrice,
  computeMerchantFee,
  isHmoPayment,
  isStatutoryDiscount,
  normalizeVatType,
  priceLine,
  round2,
  type VatType,
} from "@/lib/cashflow/pricing";
import { parseTeeth } from "@/lib/cashflow/teeth";
import type { CashflowTransaction } from "@/lib/cashflow/schema";
import {
  addPayment,
  getCollectedTotalsByInvoice,
  listPaymentsForInvoice,
  replaceImportedPayments,
  type Payment,
} from "@/lib/db/payments";
import {
  computeVisitType,
  getFirstVisitDates,
  getOrCreatePatientByName,
  getOrCreatePatientsByNames,
  normalizeNameKey,
  cleanDisplayName,
} from "@/lib/db/patients";
import {
  listAllDiscountTypes,
  type DiscountTypeOption,
} from "@/lib/db/discount-types";
import {
  loadProcedureInfoMap,
  rememberProcedureDefaults,
  type ProcedureInfo,
} from "@/lib/db/procedures";
import {
  defaultStatusOnCreate,
  isLocked,
  isVisitStatus,
  todayInManila,
  type VisitStatus,
} from "@/lib/cashflow/visit-status";
import {
  diffVisit,
  summarizeChanges,
  type AuditSnapshot,
} from "@/lib/cashflow/audit-diff";
import { logAudit } from "@/lib/db/audit";
import {
  reconcileImportedStatuses,
  recordInitialStatus,
  syncStatusWithPayments,
} from "@/lib/db/visit-status";
import {
  generateTransactionNumbers,
  generateVisitId,
  toAppTransaction,
  upsertTransactions,
} from "@/lib/db/transactions";

export type Invoice = InvoiceRow;

const CHUNK = 200;

/** Header row + what the table/list needs per invoice, without loading
 * every line. */
export type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  lineCount: number;
  totalDue: number;
  collected: number;
  /** Internal tracking status of the visit. */
  status: VisitStatus;
  /** When the status last changed (ISO). */
  statusChangedAt: string;
};

export type InvoiceDetail = {
  invoice: Invoice;
  lines: CashflowTransaction[];
  payments: Payment[];
  totalDue: number;
  /** Paid towards the bill (card payments without their merchant fee). */
  collected: number;
  /** Everything the patient handed over: collected + merchant fees. */
  received: number;
};

export type SaveInvoiceResult =
  | { ok: true; invoiceId: string; firstLineId: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export async function getInvoiceById(id: string): Promise<Invoice | undefined> {
  const [row] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);
  return row;
}

export async function listLinesForInvoice(
  invoiceId: string,
): Promise<CashflowTransaction[]> {
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.invoiceId, invoiceId))
    .orderBy(asc(transactions.lineNumber), asc(transactions.createdAt));
  return rows.map(toAppTransaction);
}

export async function getInvoiceDetail(
  invoiceId: string,
): Promise<InvoiceDetail | undefined> {
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    return undefined;
  }
  const [lines, payments] = await Promise.all([
    listLinesForInvoice(invoiceId),
    listPaymentsForInvoice(invoiceId),
  ]);
  return {
    invoice,
    lines,
    payments,
    totalDue: round2(lines.reduce((sum, line) => sum + line.amountPaid, 0)),
    collected: round2(
      payments.reduce(
        (sum, payment) =>
          sum + appliedToBill(payment.amount, payment.paymentType),
        0,
      ),
    ),
    received: round2(
      payments.reduce((sum, payment) => sum + payment.amount, 0),
    ),
  };
}

/**
 * Invoice number, line count, total due and total collected for a batch of
 * invoices in a few queries (no per-row round trips) — drives the
 * transactions table's invoice number and "balance due" flag.
 */
export async function getInvoiceSummaries(
  invoiceIds: string[],
): Promise<Record<string, InvoiceSummary>> {
  const ids = [...new Set(invoiceIds)];
  const result: Record<string, InvoiceSummary> = {};
  if (ids.length === 0) {
    return result;
  }

  const [headers, lineTotals, collected] = await Promise.all([
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        statusChangedAt: invoices.statusChangedAt,
      })
      .from(invoices)
      .where(inArray(invoices.id, ids)),
    db
      .select({
        invoiceId: transactions.invoiceId,
        lineCount: sql<number>`count(*)::int`,
        totalDue: sql<string>`coalesce(sum(${transactions.amountPaid}), 0)`,
      })
      .from(transactions)
      .where(inArray(transactions.invoiceId, ids))
      .groupBy(transactions.invoiceId),
    getCollectedTotalsByInvoice(ids),
  ]);

  const totalsById = new Map(lineTotals.map((row) => [row.invoiceId, row]));
  for (const header of headers) {
    const totals = totalsById.get(header.id);
    result[header.id] = {
      id: header.id,
      invoiceNumber: header.invoiceNumber,
      lineCount: totals?.lineCount ?? 0,
      totalDue: Number(totals?.totalDue ?? 0),
      collected: collected.get(header.id) ?? 0,
      status: isVisitStatus(header.status) ? header.status : "Cleared",
      statusChangedAt: header.statusChangedAt.toISOString(),
    };
  }
  return result;
}

/**
 * Is this booklet number already used at this branch? Checked in the app
 * rather than by a unique index because older data can legitimately share
 * numbers. Case-insensitive; compared within the same branch only (each
 * branch has its own booklets).
 */
export async function findInvoiceByNumber(
  invoiceNumber: string,
  branchId: string | null,
  excludeInvoiceId?: string,
): Promise<{ id: string; visitDate: string; patientName: string } | undefined> {
  const number = invoiceNumber.trim();
  if (!number) {
    return undefined;
  }
  const rows = await db
    .select({
      id: invoices.id,
      visitDate: invoices.visitDate,
      patientName: patients.fullName,
    })
    .from(invoices)
    .leftJoin(patients, eq(patients.id, invoices.patientId))
    .where(
      and(
        sql`lower(${invoices.invoiceNumber}) = lower(${number})`,
        branchId ? eq(invoices.branchId, branchId) : isNull(invoices.branchId),
      ),
    )
    .limit(5);
  const match = rows.find((row) => row.id !== excludeInvoiceId);
  return match
    ? {
        id: match.id,
        visitDate: match.visitDate,
        patientName: match.patientName ?? "",
      }
    : undefined;
}

type PricedLine = {
  input: InvoiceInput["lines"][number];
  listPrice: number;
  discountMode: "" | "percent" | "amount";
  discountValue: number;
  discountAmount: number;
  /** The discount's name as saved on the line (type name, or old free text). */
  discountReason: string;
  discountTypeId: string | null;
  discountType: DiscountTypeOption | undefined;
  lineTotal: number;
  vatBase: number;
  vat: number;
  vatType: VatType;
  procedureId: string | null;
};

/** A saved line, as far as pricing a re-saved line needs to know. */
type PreviousLine = Pick<CashflowTransaction, "procedure" | "vatType" | "procedureId">;

function sameProcedure(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The server's own arithmetic for every line — what is saved is never
 * taken from the browser's totals.
 *
 * - A line that is still on the same procedure keeps the VAT setting and
 *   procedure link it was saved with: changing the price list later never
 *   re-prices or re-classifies an old visit when someone edits it.
 * - A new line, or one switched to another procedure, takes the procedure
 *   list's current VAT setting (a procedure that isn't on the list keeps the
 *   setting the form sent).
 * - The discount type, not its wording, decides the PWD / Senior rule.
 */
function priceLines(
  lines: InvoiceInput["lines"],
  context: {
    procedures: Map<string, ProcedureInfo>;
    discountTypes: DiscountTypeOption[];
    previousById: Map<string, PreviousLine>;
  },
): PricedLine[] {
  const typeById = new Map(context.discountTypes.map((t) => [t.id, t]));
  const typeByName = new Map(
    context.discountTypes.map((t) => [t.name.trim().toLowerCase(), t]),
  );

  return lines.map((line) => {
    const info = context.procedures.get(line.procedure.trim().toLowerCase());
    const previous = line.id ? context.previousById.get(line.id) : undefined;
    const unchanged = !!previous && sameProcedure(previous.procedure, line.procedure);
    const vatType: VatType = unchanged
      ? normalizeVatType(previous.vatType)
      : (info?.vatType ?? line.vatType);
    const procedureId = unchanged
      ? (previous.procedureId ?? info?.id ?? null)
      : (info?.id ?? null);

    // Discount: a picked type wins; otherwise an old free-text reason that
    // still matches a type by name; otherwise the text stays as it is.
    const reasonText = (line.discountReason ?? "").trim();
    const discountType =
      (line.discountTypeId ? typeById.get(line.discountTypeId) : undefined) ??
      typeByName.get(reasonText.toLowerCase());
    let discountMode = line.discountMode;
    let discountValue = line.discountValue;
    if (discountType?.defaultPercent != null && discountValue > 0) {
      // PWD / Senior citizen have a fixed rate; it is not typed.
      discountMode = "percent";
      discountValue = discountType.defaultPercent;
    }
    const discountReason = discountType ? discountType.name : reasonText;

    const listPrice = computeListPrice(line.unitPrice, line.quantity);
    const priced = priceLine({
      listPrice,
      vatType,
      discountMode,
      discountValue,
      discountReason,
      statutory: discountType
        ? discountType.statutory
        : isStatutoryDiscount(discountReason),
    });
    return {
      input: line,
      listPrice,
      discountMode,
      discountValue,
      discountAmount: priced.discountAmount,
      discountReason,
      discountTypeId: discountType?.id ?? null,
      discountType,
      lineTotal: priced.total,
      vatBase: priced.vatBase,
      vat: priced.vat,
      vatType,
      procedureId,
    };
  });
}

/**
 * Does a priced visit need an ID number? True when a line with an actual
 * discount uses a type flagged `needsId`, or (for an old reason that is not
 * a type) a PWD / Senior citizen reason.
 */
function visitNeedsDiscountId(priced: PricedLine[]): boolean {
  return priced.some(
    (line) =>
      line.discountAmount > 0 &&
      (line.discountType
        ? line.discountType.needsId
        : isStatutoryDiscount(line.discountReason)),
  );
}

/** Field errors for the PWD / Senior ID and the recall fields. */
function checkVisitFields(
  input: InvoiceInput,
  priced: PricedLine[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (visitNeedsDiscountId(priced)) {
    if (!input.discountIdNumber.trim()) {
      errors.discountIdNumber = "Enter the PWD / Senior citizen ID number.";
    }
    if (!input.discountIdType.trim()) {
      errors.discountIdType = "Choose the ID type.";
    }
  }
  return errors;
}

/** The ID and recall columns of the invoice header. An ID is only kept
 * when a discount on the visit needs one. */
function visitHeaderFields(input: InvoiceInput, priced: PricedLine[]) {
  const keepId = visitNeedsDiscountId(priced);
  return {
    discountIdType: keepId ? input.discountIdType.trim() : "",
    discountIdNumber: keepId ? input.discountIdNumber.trim() : "",
    recallDate: input.recallDate || null,
    recallReason: input.recallDate ? input.recallReason.trim() : "",
  };
}

function buildLine(args: {
  priced: PricedLine;
  lineNumber: number;
  fee: number;
  withholding: number;
  base: {
    id: string;
    date: string;
    visitId: string;
    patientName: string;
    patientId: string | null;
    dentist: string;
    transactionType: string;
    visitType: string;
    invoiceNumber: string;
    remarks: string;
    paymentType: string;
    branchId: string | null;
    createdByUserId: string | null;
    transactionNumber: string | null;
    invoiceId: string;
  };
}): CashflowTransaction {
  const { priced, base } = args;
  const monthYear = deriveMonthYear(base.date);
  const hasDiscount = priced.discountAmount > 0;
  return {
    id: base.id,
    date: base.date,
    visitId: base.visitId,
    patientName: base.patientName,
    transactionType: base.transactionType,
    visitType: base.visitType,
    dentist: base.dentist,
    procedure: priced.input.procedure,
    procedureId: priced.procedureId,
    paymentType: base.paymentType,
    amountPaid: priced.lineTotal,
    vatExclusive: priced.vatBase,
    vatAmount: priced.vat,
    month: monthYear?.month ?? "",
    year: monthYear?.year ?? 0,
    invoiceNumber: base.invoiceNumber,
    remarks: base.remarks,
    merchantFee: args.fee,
    withholdingTax: args.withholding,
    // The merchant fee is part of the payment, so the clinic receives the
    // line total less its share of the fee.
    netCollection: computeNetCollection(
      priced.lineTotal,
      args.fee,
      args.withholding,
    ),
    branchId: base.branchId,
    createdByUserId: base.createdByUserId,
    transactionNumber: base.transactionNumber,
    invoiceId: base.invoiceId,
    patientId: base.patientId,
    lineNumber: args.lineNumber,
    listPrice: priced.listPrice,
    discountMode: hasDiscount ? priced.discountMode : "",
    discountValue: hasDiscount ? priced.discountValue : 0,
    discountAmount: priced.discountAmount,
    discountReason: hasDiscount ? priced.discountReason : "",
    discountTypeId: hasDiscount ? priced.discountTypeId : null,
    vatType: priced.vatType,
    quantity: priced.input.quantity,
    unitPrice: priced.input.unitPrice,
    teeth: parseTeeth(priced.input.teeth).normalized,
  };
}

/** Gives a procedure that has no list price yet the price it was just sold at. */
async function rememberDefaults(invoiceId: string): Promise<void> {
  const lines = await listLinesForInvoice(invoiceId);
  await Promise.all(
    lines.flatMap((line) =>
      // An HMO price typed on a line is not the procedure's cash price.
      line.procedureId && !isHmoPayment(line.paymentType)
        ? [
            rememberProcedureDefaults(line.procedureId, {
              price: line.unitPrice ?? 0,
            }),
          ]
        : [],
    ),
  );
}

/**
 * Re-works a visit's merchant fee from its payments (each payment's amount
 * times the rate for its payment type), shares it across the procedure
 * lines, and refreshes net collection and commission. Called whenever a
 * payment is added or removed.
 */
export async function recomputeInvoiceFees(invoiceId: string): Promise<void> {
  const [lines, paymentList] = await Promise.all([
    listLinesForInvoice(invoiceId),
    listPaymentsForInvoice(invoiceId),
  ]);
  if (lines.length === 0) {
    return;
  }
  const totalFee = round2(
    paymentList.reduce(
      (sum, payment) =>
        sum + computeMerchantFee(payment.amount, payment.paymentType),
      0,
    ),
  );
  const fees = allocateProportionally(
    totalFee,
    lines.map((line) => line.amountPaid),
  );
  // Payments come back newest first; the oldest one names the visit's
  // payment type for a visit that was saved with nothing received yet.
  const firstType = paymentList[paymentList.length - 1]?.paymentType ?? "";
  await upsertTransactions(
    lines.map((line, index) => ({
      ...line,
      merchantFee: fees[index],
      netCollection: computeNetCollection(
        line.amountPaid,
        fees[index],
        line.withholdingTax,
      ),
      paymentType: line.paymentType || firstType,
    })),
  );
}

async function checkInvoiceNumber(
  invoiceNumber: string,
  branchId: string | null,
  excludeInvoiceId?: string,
): Promise<string | null> {
  const clash = await findInvoiceByNumber(
    invoiceNumber,
    branchId,
    excludeInvoiceId,
  );
  if (!clash) {
    return null;
  }
  const who = clash.patientName ? ` for ${clash.patientName}` : "";
  return `Invoice number ${invoiceNumber} is already used${who} on ${clash.visitDate}.`;
}

async function loadBranchName(branchId: string | null | undefined): Promise<string> {
  if (!branchId) return "";
  const [row] = await db
    .select({ name: branches.name })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  return row?.name ?? "";
}

function snapshotOf(
  header: {
    visitDate: string;
    invoiceNumber: string;
    transactionType: string;
    visitType: string;
    discountIdType: string;
    discountIdNumber: string;
    recallDate: string | null;
  },
  extra: { patientName: string; branchName: string; dentist: string },
  lines: CashflowTransaction[],
): AuditSnapshot {
  return {
    visitDate: header.visitDate,
    patientName: extra.patientName,
    branchName: extra.branchName,
    invoiceNumber: header.invoiceNumber,
    transactionType: header.transactionType,
    visitType: header.visitType,
    dentist: extra.dentist,
    discountIdType: header.discountIdType,
    discountIdNumber: header.discountIdNumber,
    recallDate: header.recallDate ?? "",
    totalDue: round2(lines.reduce((sum, line) => sum + line.amountPaid, 0)),
    lines: lines.map((line) => ({
      id: line.id,
      procedure: line.procedure,
      quantity: line.quantity ?? 1,
      unitPrice: line.unitPrice ?? 0,
      teeth: line.teeth ?? "",
      discount: line.discountReason ?? "",
      total: line.amountPaid,
    })),
  };
}

/**
 * Saves a brand-new visit: one invoice, its procedure lines, the patient
 * link, and — when money was taken — the first payment. The Neon HTTP
 * driver has no interactive transactions, so the steps run in order and a
 * failure part-way removes the invoice again (which cascades to anything
 * already written for it) instead of leaving half a visit behind.
 */
export async function createInvoice(
  input: InvoiceInput,
  context: { userId: string | null; userName?: string },
): Promise<SaveInvoiceResult> {
  const branchId = input.branchId || null;
  const priced = priceLines(input.lines, {
    procedures: await loadProcedureInfoMap(),
    discountTypes: await listAllDiscountTypes(),
    previousById: new Map(),
  });
  const totalDue = round2(
    priced.reduce((sum, line) => sum + line.lineTotal, 0),
  );

  const fieldErrors: Record<string, string> = checkVisitFields(input, priced);
  const numberProblem = input.invoiceNumber
    ? await checkInvoiceNumber(input.invoiceNumber, branchId)
    : null;
  if (numberProblem) {
    fieldErrors.invoiceNumber = numberProblem;
  }
  const paidNow = round2(input.payment?.amount ?? 0);
  // A card payment's merchant fee is inside the amount paid.
  if (appliedToBill(paidNow, input.payment?.paymentType) > totalDue + 0.005) {
    fieldErrors.paymentAmount = `That is more than the total due (${totalDue.toFixed(2)}).`;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const patient = await getOrCreatePatientByName(input.patientName);
  const patientName = cleanDisplayName(input.patientName);
  const invoiceId = randomUUID();
  const visitType =
    input.visitType ||
    (await computeVisitType(patient?.id, input.date, undefined));

  const now = new Date();
  const [visitId, transactionNumbers] = await Promise.all([
    generateVisitId(input.date),
    generateTransactionNumbers(priced.length, now),
  ]);

  // Merchant fee follows the payment type of what was received now.
  const fees = allocateProportionally(
    computeMerchantFee(paidNow, input.payment?.paymentType),
    priced.map((line) => line.lineTotal),
  );
  const withholdings = priced.map(() => 0);

  const lines = priced.map((line, index) =>
    buildLine({
      priced: line,
      lineNumber: index + 1,
      fee: fees[index],
      withholding: withholdings[index],
      base: {
        id: randomUUID(),
        date: input.date,
        visitId,
        patientName,
        patientId: patient?.id ?? null,
        dentist: input.dentist,
        transactionType: input.transactionType,
        visitType,
        invoiceNumber: input.invoiceNumber,
        remarks: input.remarks,
        // The payment method chosen at the top of the form is the visit's
        // method (an HMO visit needs it for the HMO commission) even before
        // any money is received.
        paymentType: input.payment?.paymentType ?? "",
        branchId,
        createdByUserId: context.userId,
        transactionNumber: transactionNumbers[index],
        invoiceId,
      },
    }),
  );

  const startStatus = defaultStatusOnCreate({
    visitDate: input.date,
    today: todayInManila(),
    transactionType: input.transactionType,
    totalDue,
    collected: appliedToBill(paidNow, input.payment?.paymentType),
  });

  const header: NewInvoiceRow = {
    id: invoiceId,
    invoiceNumber: input.invoiceNumber,
    visitDate: input.date,
    patientId: patient?.id ?? null,
    branchId,
    transactionType: input.transactionType,
    visitType,
    ...visitHeaderFields(input, priced),
    status: startStatus,
    statusChangedAt: now,
    createdByUserId: context.userId,
  };

  try {
    await db.insert(invoices).values(header);
    await upsertTransactions(lines);
    if (paidNow > 0) {
      await addPayment({
        invoiceId,
        amount: paidNow,
        paymentType: input.payment?.paymentType ?? "",
        referenceNo: input.payment?.referenceNo ?? "",
        paidAt: new Date(`${input.date}T00:00:00`),
      });
    }
    await rememberDefaults(invoiceId);
  } catch (error) {
    console.error("createInvoice failed, cleaning up", error);
    await db
      .delete(transactions)
      .where(eq(transactions.invoiceId, invoiceId))
      .catch(() => undefined);
    await db
      .delete(invoices)
      .where(eq(invoices.id, invoiceId))
      .catch(() => undefined);
    return {
      ok: false,
      message:
        "Couldn't save the transaction. Nothing was recorded — please try again.",
    };
  }

  const actor = { userId: context.userId, name: context.userName ?? "" };
  await recordInitialStatus(invoiceId, startStatus, actor);
  await logAudit({
    action: "visit.created",
    entityType: "invoice",
    entityId: invoiceId,
    invoiceId,
    patientId: patient?.id ?? null,
    summary: `${patientName} · ${priced.length} ${priced.length === 1 ? "procedure" : "procedures"} · total ${totalDue.toFixed(2)}${paidNow > 0 ? ` · ${paidNow.toFixed(2)} received` : ""}`,
    actor,
  });

  return { ok: true, invoiceId, firstLineId: lines[0].id };
}

/**
 * Edits an existing visit. Lines are matched by id: a line that is still
 * on the form is updated in place (keeping its Visit ID, transaction
 * number, who recorded it and so on), a line with no id is new, and an
 * existing line missing from the form was deleted. Payments are not
 * touched here — they are added/removed from the Payments panel — but the
 * new total can't drop below what has already been collected.
 */
export async function updateInvoice(
  invoiceId: string,
  input: InvoiceInput,
  context: { userId: string | null; userName?: string; isAdmin?: boolean },
): Promise<SaveInvoiceResult> {
  const existing = await getInvoiceById(invoiceId);
  if (!existing) {
    return { ok: false, message: "That transaction no longer exists." };
  }
  if (isLocked(isVisitStatus(existing.status) ? existing.status : "Cleared") && !context.isAdmin) {
    return {
      ok: false,
      message:
        "This visit is Cleared, so it is locked. Ask an admin to reopen it if something needs correcting.",
    };
  }
  const existingLines = await listLinesForInvoice(invoiceId);
  if (existingLines.length === 0) {
    return {
      ok: false,
      message: "That transaction no longer has any lines to edit.",
    };
  }

  const branchId = input.branchId || existing.branchId;
  const priced = priceLines(input.lines, {
    procedures: await loadProcedureInfoMap(),
    discountTypes: await listAllDiscountTypes(),
    previousById: new Map(existingLines.map((line) => [line.id, line])),
  });
  const totalDue = round2(
    priced.reduce((sum, line) => sum + line.lineTotal, 0),
  );

  const fieldErrors: Record<string, string> = checkVisitFields(input, priced);
  const numberProblem = input.invoiceNumber
    ? await checkInvoiceNumber(input.invoiceNumber, branchId, invoiceId)
    : null;
  if (numberProblem) {
    fieldErrors.invoiceNumber = numberProblem;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const collectedMap = await getCollectedTotalsByInvoice([invoiceId]);
  const collected = collectedMap.get(invoiceId) ?? 0;
  if (collected > totalDue + 0.005) {
    return {
      ok: false,
      message: `Payments already recorded come to ${collected.toFixed(2)}, which is more than the new total of ${totalDue.toFixed(2)}. Remove a payment first.`,
    };
  }

  const patient = await getOrCreatePatientByName(input.patientName);
  const patientName = cleanDisplayName(input.patientName);
  const visitType =
    input.visitType ||
    (await computeVisitType(patient?.id, input.date, invoiceId));

  const existingById = new Map(existingLines.map((line) => [line.id, line]));
  const keptIds = new Set(
    input.lines.flatMap((line) =>
      line.id && existingById.has(line.id) ? [line.id] : [],
    ),
  );
  const first = existingLines[0];

  const newLineCount = input.lines.filter(
    (line) => !(line.id && existingById.has(line.id)),
  ).length;
  const newNumbers =
    newLineCount > 0
      ? await generateTransactionNumbers(newLineCount, new Date())
      : [];
  let newNumberIndex = 0;

  // Merchant fee: from the payments already recorded on this visit, by
  // payment type. Withholding tax is no longer entered, but a visit that
  // already has some (older or imported data) keeps it.
  const recordedPayments = await listPaymentsForInvoice(invoiceId);
  const fees = allocateProportionally(
    round2(
      recordedPayments.reduce(
        (sum, payment) =>
          sum + computeMerchantFee(payment.amount, payment.paymentType),
        0,
      ),
    ),
    priced.map((line) => line.lineTotal),
  );
  const withholdings = allocateProportionally(
    round2(existingLines.reduce((sum, line) => sum + line.withholdingTax, 0)),
    priced.map((line) => line.lineTotal),
  );

  const lines = priced.map((line, index) => {
    const previous = line.input.id
      ? existingById.get(line.input.id)
      : undefined;
    const built = buildLine({
      priced: line,
      lineNumber: index + 1,
      fee: fees[index],
      withholding: withholdings[index],
      base: {
        id: previous ? previous.id : randomUUID(),
        date: input.date,
        visitId: previous?.visitId ?? first.visitId,
        patientName,
        patientId: patient?.id ?? null,
        dentist: input.dentist,
        transactionType: input.transactionType,
        visitType,
        invoiceNumber: input.invoiceNumber,
        remarks: input.remarks,
        paymentType: previous?.paymentType ?? first.paymentType,
        branchId,
        createdByUserId: previous?.createdByUserId ?? context.userId,
        transactionNumber: previous
          ? (previous.transactionNumber ?? null)
          : newNumbers[newNumberIndex++],
        invoiceId,
      },
    });
    return built;
  });

  const [beforeBranch, afterBranch] = await Promise.all([
    loadBranchName(existing.branchId),
    loadBranchName(branchId),
  ]);
  const beforeSnapshot = snapshotOf(
    existing,
    {
      patientName: existingLines[0].patientName,
      branchName: beforeBranch,
      dentist: existingLines[0].dentist,
    },
    existingLines,
  );

  try {
    await upsertTransactions(lines);

    const removedIds = existingLines
      .filter((line) => !keptIds.has(line.id))
      .map((line) => line.id);
    for (let i = 0; i < removedIds.length; i += CHUNK) {
      await db
        .delete(transactions)
        .where(inArray(transactions.id, removedIds.slice(i, i + CHUNK)));
    }

    await db
      .update(invoices)
      .set({
        invoiceNumber: input.invoiceNumber,
        visitDate: input.date,
        patientId: patient?.id ?? null,
        branchId,
        transactionType: input.transactionType,
        visitType,
        ...visitHeaderFields(input, priced),
      })
      .where(eq(invoices.id, invoiceId));

    await rememberDefaults(invoiceId);
    // A changed total can mean the visit is now paid in full (or owes money
    // again), so let the status follow.
    await syncStatusWithPayments(invoiceId, {
      userId: context.userId,
      name: context.userName ?? "",
    });
    const afterSnapshot = snapshotOf(
      {
        visitDate: input.date,
        invoiceNumber: input.invoiceNumber,
        transactionType: input.transactionType,
        visitType,
        discountIdType: visitHeaderFields(input, priced).discountIdType ?? "",
        discountIdNumber:
          visitHeaderFields(input, priced).discountIdNumber ?? "",
        recallDate: visitHeaderFields(input, priced).recallDate ?? null,
      },
      { patientName, branchName: afterBranch, dentist: input.dentist },
      lines,
    );
    const changes = diffVisit(beforeSnapshot, afterSnapshot);
    if (changes.length > 0) {
      await logAudit({
        action: "visit.updated",
        entityType: "invoice",
        entityId: invoiceId,
        invoiceId,
        patientId: patient?.id ?? null,
        summary: summarizeChanges(changes).slice(0, 300),
        changes,
        actor: { userId: context.userId, name: context.userName ?? "" },
      });
    }
  } catch (error) {
    console.error("updateInvoice failed", error);
    return {
      ok: false,
      message:
        "Couldn't save your changes. Please check the transaction and try again.",
    };
  }

  return { ok: true, invoiceId, firstLineId: lines[0].id };
}

/**
 * Removes a whole visit: every procedure line on the invoice, the invoice
 * itself and (through the foreign key cascade) its payments.
 */
export async function deleteInvoice(
  invoiceId: string,
  actor?: { userId: string | null; name: string },
): Promise<void> {
  // Written first, so the trail still says what was removed.
  const [header, lines] = await Promise.all([
    getInvoiceById(invoiceId),
    listLinesForInvoice(invoiceId),
  ]);
  if (header && actor) {
    const total = round2(lines.reduce((sum, line) => sum + line.amountPaid, 0));
    await logAudit({
      action: "visit.deleted",
      entityType: "invoice",
      entityId: invoiceId,
      invoiceId,
      patientId: header.patientId,
      summary: `${lines[0]?.patientName ?? "Visit"} of ${header.visitDate} · ${lines.length} ${lines.length === 1 ? "procedure" : "procedures"} · total ${total.toFixed(2)}${header.invoiceNumber ? ` · invoice ${header.invoiceNumber}` : ""}`,
      actor,
    });
  }
  await db.delete(transactions).where(eq(transactions.invoiceId, invoiceId));
  await db.delete(invoices).where(eq(invoices.id, invoiceId));
}

// ── CSV import ───────────────────────────────────────────────────────

/** Formats an md5 digest as a uuid, so an imported visit always maps to the
 * same invoice id and a re-import updates instead of duplicating. */
function deterministicUuid(seed: string): string {
  const h = createHash("md5").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export type ImportSummary = {
  lineCount: number;
  invoiceCount: number;
  paymentCount: number;
};

/**
 * Imports parsed CSV rows as invoices: rows sharing a Visit ID and date
 * become the lines of one invoice; the patient is found or created by name;
 * New/Returning is worked out from earlier visits when the file doesn't say;
 * and the money in the file is recorded as payments (one per payment
 * method per invoice) so imported visits show as paid rather than unpaid.
 *
 * Safe to run twice on the same file: invoice ids are derived from the
 * Visit ID, lines upsert by id, and only payments created by an earlier
 * import are replaced.
 */
export async function importTransactionsWithInvoices(
  rows: CashflowTransaction[],
  context: { branchId: string | null; userId: string | null },
): Promise<ImportSummary> {
  if (rows.length === 0) {
    return { lineCount: 0, invoiceCount: 0, paymentCount: 0 };
  }

  type Group = { key: string; invoiceId: string; rows: CashflowTransaction[] };
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const key = `${row.visitId}|${row.date}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        invoiceId: deterministicUuid(`imp:${key}|${context.branchId ?? ""}`),
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  const groupList = [...groups.values()];

  const patientIds = await getOrCreatePatientsByNames(
    rows.map((row) => row.patientName),
  );
  const patientIdFor = (name: string) =>
    patientIds.get(normalizeNameKey(name)) ?? null;

  // New vs returning: a visit is RETURNING if the patient has any visit
  // before its date — on file already (leaving out the invoices being
  // re-imported) or elsewhere in this same file.
  const existingFirst = await getFirstVisitDates(
    groupList.flatMap((group) => {
      const id = patientIdFor(group.rows[0].patientName);
      return id ? [id] : [];
    }),
    groupList.map((group) => group.invoiceId),
  );
  const batchFirst = new Map<string, string>();
  for (const group of groupList) {
    const id = patientIdFor(group.rows[0].patientName);
    const type = group.rows[0].transactionType;
    if (id && type === "Visit") {
      const date = group.rows[0].date;
      const current = batchFirst.get(id);
      if (!current || date < current) {
        batchFirst.set(id, date);
      }
    }
  }

  const headers: NewInvoiceRow[] = [];
  const lines: CashflowTransaction[] = [];
  const paymentRows: Array<{
    invoiceId: string;
    amount: number;
    paymentType: string;
    paidAt: Date;
  }> = [];

  for (const group of groupList) {
    const head = group.rows[0];
    const patientId = patientIdFor(head.patientName);
    const earliest = [
      patientId ? existingFirst.get(patientId) : undefined,
      patientId ? batchFirst.get(patientId) : undefined,
    ]
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    const computedVisitType =
      earliest && earliest < head.date ? "RETURNING" : "NEW";
    const visitType =
      group.rows.find((row) => row.visitType)?.visitType || computedVisitType;
    const invoiceNumber =
      group.rows.find((row) => row.invoiceNumber)?.invoiceNumber ?? "";

    headers.push({
      id: group.invoiceId,
      invoiceNumber,
      visitDate: head.date,
      patientId,
      branchId: context.branchId,
      transactionType: head.transactionType,
      visitType,
      createdByUserId: context.userId,
    });

    group.rows.forEach((row, index) => {
      // The file has no merchant fee column (the Day End report): work it
      // out from the payment type, unless the file gave its own.
      const fileHasFee =
        row.merchantFee > 0 ||
        round2(row.netCollection) !==
          round2(row.amountPaid - row.withholdingTax);
      const importFee = fileHasFee
        ? row.merchantFee
        : computeMerchantFee(row.amountPaid, row.paymentType);
      lines.push({
        ...row,
        merchantFee: importFee,
        netCollection: fileHasFee
          ? row.netCollection
          : computeNetCollection(row.amountPaid, importFee, row.withholdingTax),
        visitType,
        invoiceNumber: row.invoiceNumber || invoiceNumber,
        branchId: context.branchId,
        createdByUserId: context.userId,
        invoiceId: group.invoiceId,
        patientId,
        lineNumber: index + 1,
        listPrice: row.amountPaid,
        quantity: 1,
        unitPrice: row.amountPaid,
        teeth: "",
        discountTypeId: null,
        discountMode: "",
        discountValue: 0,
        discountAmount: 0,
        discountReason: "",
        vatType: row.vatAmount > 0 ? "vat" : "non_vat",
      });
    });

    // The money in the file: one payment per payment method per invoice.
    const byMethod = new Map<string, number>();
    for (const row of group.rows) {
      if (row.amountPaid > 0) {
        byMethod.set(
          row.paymentType,
          round2((byMethod.get(row.paymentType) ?? 0) + row.amountPaid),
        );
      }
    }
    for (const [paymentType, amount] of byMethod) {
      paymentRows.push({
        invoiceId: group.invoiceId,
        // The file's amount is the payment; a card payment's merchant fee is
        // inside it.
        amount,
        paymentType,
        paidAt: new Date(`${head.date}T00:00:00`),
      });
    }
  }

  for (let i = 0; i < headers.length; i += CHUNK) {
    await db
      .insert(invoices)
      .values(headers.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: invoices.id,
        set: {
          invoiceNumber: sql`excluded.invoice_number`,
          visitDate: sql`excluded.visit_date`,
          patientId: sql`excluded.patient_id`,
          branchId: sql`excluded.branch_id`,
          transactionType: sql`excluded.transaction_type`,
          visitType: sql`excluded.visit_type`,
        },
      });
  }

  await upsertTransactions(lines);
  await replaceImportedPayments(
    groupList.map((group) => group.invoiceId),
    paymentRows,
  );
  await reconcileImportedStatuses(groupList.map((group) => group.invoiceId));

  return {
    lineCount: lines.length,
    invoiceCount: headers.length,
    paymentCount: paymentRows.length,
  };
}
