import { and, asc, desc, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import {
  balanceDueOf,
  canMove,
  computeWaitStats,
  type WaitStat,
  isVisitStatus,
  statusAfterPaymentChange,
  type VisitStatus,
} from "@/lib/cashflow/visit-status";
import { logAudit } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { getCollectedTotalsByInvoice } from "@/lib/db/payments";
import {
  branches,
  invoiceStatusHistory,
  invoices,
  transactions,
} from "@/lib/db/schema";

const CHUNK = 200;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Who is making a change, for the history log. */
export type StatusActor = {
  userId: string | null;
  name: string;
  isAdmin: boolean;
};

export type StatusHistoryEntry = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedByName: string;
  changedAt: string; // ISO
  note: string;
};

export type SetStatusResult =
  { ok: true; status: VisitStatus } | { ok: false; message: string };

function asStatus(value: string | null | undefined): VisitStatus {
  return isVisitStatus(value) ? value : "Cleared";
}

async function totalsFor(invoiceId: string): Promise<{
  totalDue: number;
  collected: number;
  balanceDue: number;
}> {
  const [[row], collectedMap] = await Promise.all([
    db
      .select({
        totalDue: sql<string>`coalesce(sum(${transactions.amountPaid}), 0)`,
      })
      .from(transactions)
      .where(eq(transactions.invoiceId, invoiceId)),
    getCollectedTotalsByInvoice([invoiceId]),
  ]);
  const totalDue = round2(Number(row?.totalDue ?? 0));
  const collected = collectedMap.get(invoiceId) ?? 0;
  return { totalDue, collected, balanceDue: balanceDueOf(totalDue, collected) };
}

async function writeHistory(entry: {
  invoiceId: string;
  from: VisitStatus | null;
  to: VisitStatus;
  userId: string | null;
  name: string;
  note: string;
}): Promise<void> {
  try {
    await db.insert(invoiceStatusHistory).values({
      invoiceId: entry.invoiceId,
      fromStatus: entry.from,
      toStatus: entry.to,
      changedByUserId: entry.userId,
      changedByName: entry.name,
      note: entry.note,
    });
  } catch (error) {
    // The status itself is already saved; a missing log line must not
    // undo it. (The Neon HTTP driver has no multi-step transactions.)
    console.error("Couldn't write the status history", error);
  }
}

/** Logs the status a new visit started with. */
export async function recordInitialStatus(
  invoiceId: string,
  status: VisitStatus,
  actor: { userId: string | null; name: string },
): Promise<void> {
  await writeHistory({
    invoiceId,
    from: null,
    to: status,
    userId: actor.userId,
    name: actor.name,
    note: "Visit created",
  });
}

/**
 * Moves a visit to another status after checking the rules (see
 * visit-status.ts). The update only applies if the visit is still in the
 * status the person saw, so two people clicking at once can't both win.
 */
export async function setVisitStatus(input: {
  invoiceId: string;
  to: VisitStatus;
  actor: StatusActor;
  note?: string;
}): Promise<SetStatusResult> {
  const [invoice] = await db
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, input.invoiceId))
    .limit(1);
  if (!invoice) {
    return { ok: false, message: "That visit no longer exists." };
  }
  const from = asStatus(invoice.status);
  const { balanceDue } = await totalsFor(input.invoiceId);

  const check = canMove({
    from,
    to: input.to,
    isAdmin: input.actor.isAdmin,
    balanceDue,
  });
  if (!check.ok) {
    return { ok: false, message: check.message };
  }
  const note = (input.note ?? "").trim();
  if (check.needsNote && !note) {
    return { ok: false, message: "Please write a short reason." };
  }

  const updated = await db
    .update(invoices)
    .set({ status: input.to, statusChangedAt: new Date() })
    .where(and(eq(invoices.id, input.invoiceId), eq(invoices.status, from)))
    .returning({ id: invoices.id });
  if (updated.length === 0) {
    return {
      ok: false,
      message: "Someone just changed this visit. Reload and try again.",
    };
  }

  await writeHistory({
    invoiceId: input.invoiceId,
    from,
    to: input.to,
    userId: input.actor.userId,
    name: input.actor.name,
    note,
  });
  await logAudit({
    action: "status.changed",
    entityType: "invoice",
    entityId: input.invoiceId,
    invoiceId: input.invoiceId,
    summary: `${from} → ${input.to}${note ? ` · ${note}` : ""}`,
    actor: { userId: input.actor.userId, name: input.actor.name },
  });
  return { ok: true, status: input.to };
}

/**
 * Called after a payment is added or removed: a For Payment visit that is
 * now paid in full is cleared automatically, and a Cleared visit that owes
 * money again goes back to For Payment. Returns the new status, or null if
 * nothing changed.
 */
export async function syncStatusWithPayments(
  invoiceId: string,
  actor: { userId: string | null; name: string },
): Promise<VisitStatus | null> {
  const [invoice] = await db
    .select({ status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invoice) {
    return null;
  }
  const current = asStatus(invoice.status);
  const { balanceDue } = await totalsFor(invoiceId);
  const next = statusAfterPaymentChange({ current, balanceDue });
  if (!next) {
    return null;
  }
  const updated = await db
    .update(invoices)
    .set({ status: next, statusChangedAt: new Date() })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.status, current)))
    .returning({ id: invoices.id });
  if (updated.length === 0) {
    return null;
  }
  await writeHistory({
    invoiceId,
    from: current,
    to: next,
    userId: actor.userId,
    name: actor.name,
    note:
      next === "Cleared"
        ? "Paid in full — cleared automatically"
        : "A payment was removed — balance is due again",
  });
  return next;
}

/**
 * After a CSV import: an imported visit that still owes money is For
 * Payment, one that is paid is Cleared. Only touches visits that are
 * Cleared or For Payment, so a visit someone is tracking live
 * (Arrived / On-going) is left alone.
 */
export async function reconcileImportedStatuses(
  invoiceIds: string[],
): Promise<void> {
  for (let i = 0; i < invoiceIds.length; i += CHUNK) {
    const chunk = invoiceIds.slice(i, i + CHUNK);
    const [rows, totalRows, collected] = await Promise.all([
      db
        .select({ id: invoices.id, status: invoices.status })
        .from(invoices)
        .where(inArray(invoices.id, chunk)),
      db
        .select({
          invoiceId: transactions.invoiceId,
          totalDue: sql<string>`coalesce(sum(${transactions.amountPaid}), 0)`,
        })
        .from(transactions)
        .where(inArray(transactions.invoiceId, chunk))
        .groupBy(transactions.invoiceId),
      getCollectedTotalsByInvoice(chunk),
    ]);
    const totals = new Map(
      totalRows.map((row) => [row.invoiceId, round2(Number(row.totalDue))]),
    );
    const wantPay: string[] = [];
    const wantClear: string[] = [];
    for (const row of rows) {
      const balance = balanceDueOf(
        totals.get(row.id) ?? 0,
        collected.get(row.id) ?? 0,
      );
      if (balance > 0 && row.status === "Cleared") wantPay.push(row.id);
      if (balance === 0 && row.status === "For Payment") wantClear.push(row.id);
    }
    if (wantPay.length > 0) {
      await db
        .update(invoices)
        .set({ status: "For Payment", statusChangedAt: new Date() })
        .where(inArray(invoices.id, wantPay));
    }
    if (wantClear.length > 0) {
      await db
        .update(invoices)
        .set({ status: "Cleared", statusChangedAt: new Date() })
        .where(inArray(invoices.id, wantClear));
    }
  }
}

export async function listStatusHistory(
  invoiceId: string,
): Promise<StatusHistoryEntry[]> {
  const rows = await db
    .select()
    .from(invoiceStatusHistory)
    .where(eq(invoiceStatusHistory.invoiceId, invoiceId))
    .orderBy(asc(invoiceStatusHistory.changedAt));
  return rows.map((row) => ({
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    changedByName: row.changedByName,
    changedAt: row.changedAt.toISOString(),
    note: row.note,
  }));
}

// ── Today board ──────────────────────────────────────────────────────

export type BoardVisit = {
  invoiceId: string;
  /** The first procedure line, which opens the visit page. */
  firstLineId: string;
  patientName: string;
  dentist: string;
  branchName: string;
  procedures: string[];
  status: VisitStatus;
  statusChangedAt: string; // ISO
  visitDate: string;
  totalDue: number;
  balanceDue: number;
};

/**
 * Today's visits, any earlier visit that is still not Cleared (a patient who
 * never paid yesterday should not vanish from the queue), and any visit that
 * was Cleared today, even if the visit itself is from an earlier date.
 */
export async function listBoardVisits(today: string): Promise<BoardVisit[]> {
  const headers = await db
    .select({
      id: invoices.id,
      status: invoices.status,
      statusChangedAt: invoices.statusChangedAt,
      visitDate: invoices.visitDate,
      branchName: branches.name,
    })
    .from(invoices)
    .leftJoin(branches, eq(branches.id, invoices.branchId))
    .where(
      or(
        eq(invoices.visitDate, today),
        ne(invoices.status, "Cleared"),
        gte(invoices.statusChangedAt, new Date(`${today}T00:00:00+08:00`)),
      ),
    )
    .orderBy(desc(invoices.statusChangedAt))
    .limit(300);
  if (headers.length === 0) {
    return [];
  }
  const ids = headers.map((header) => header.id);

  const [lineRows, collected] = await Promise.all([
    db
      .select({
        invoiceId: transactions.invoiceId,
        id: transactions.id,
        patientName: transactions.patientName,
        dentist: transactions.dentist,
        procedure: transactions.procedure,
        amountPaid: transactions.amountPaid,
        lineNumber: transactions.lineNumber,
      })
      .from(transactions)
      .where(inArray(transactions.invoiceId, ids))
      .orderBy(asc(transactions.lineNumber), asc(transactions.createdAt)),
    getCollectedTotalsByInvoice(ids),
  ]);

  const linesByInvoice = new Map<string, typeof lineRows>();
  for (const line of lineRows) {
    if (!line.invoiceId) continue;
    const list = linesByInvoice.get(line.invoiceId) ?? [];
    list.push(line);
    linesByInvoice.set(line.invoiceId, list);
  }

  return headers.flatMap((header) => {
    const lines = linesByInvoice.get(header.id);
    if (!lines || lines.length === 0) {
      return [];
    }
    const totalDue = round2(
      lines.reduce((sum, line) => sum + Number(line.amountPaid), 0),
    );
    return [
      {
        invoiceId: header.id,
        firstLineId: lines[0].id,
        patientName: lines[0].patientName,
        dentist: lines[0].dentist,
        branchName: header.branchName ?? "",
        procedures: lines.map((line) => line.procedure),
        status: asStatus(header.status),
        statusChangedAt: header.statusChangedAt.toISOString(),
        visitDate: header.visitDate,
        totalDue,
        balanceDue: balanceDueOf(totalDue, collected.get(header.id) ?? 0),
      },
    ];
  });
}

// ── Waiting times ────────────────────────────────────────────────────

/** Average time in each stage for moves made since `fromDate` (YYYY-MM-DD,
 * clinic time). */
export async function getWaitStats(fromDate: string): Promise<WaitStat[]> {
  const rows = await db
    .select({
      invoiceId: invoiceStatusHistory.invoiceId,
      toStatus: invoiceStatusHistory.toStatus,
      changedAt: invoiceStatusHistory.changedAt,
    })
    .from(invoiceStatusHistory)
    .where(
      gte(
        invoiceStatusHistory.changedAt,
        new Date(`${fromDate}T00:00:00+08:00`),
      ),
    )
    .orderBy(
      asc(invoiceStatusHistory.invoiceId),
      asc(invoiceStatusHistory.changedAt),
    )
    .limit(20000);
  return computeWaitStats(
    rows.map((row) => ({
      invoiceId: row.invoiceId,
      toStatus: row.toStatus,
      at: row.changedAt.getTime(),
    })),
  );
}

/**
 * How many visits are not Cleared yet. Feeds the count next to "Queue" in
 * the menu. Returns null (never throws) so a missing table or a database
 * hiccup cannot take the whole page layout down with it.
 */
export async function countOpenVisits(): Promise<number | null> {
  try {
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(invoices)
      .where(ne(invoices.status, "Cleared"));
    return row?.value ?? 0;
  } catch {
    return null;
  }
}
