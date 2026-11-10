import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import {
  getTableConfig,
  type AnyPgColumn,
  type PgTable,
} from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  attachments,
  deletedItems,
  expenses,
  invoices,
  invoiceStatusHistory,
  payments,
  transactions,
} from "@/lib/db/schema";
import { logAudit } from "@/lib/db/audit";
import { DELETED_ITEMS_RETENTION_DAYS } from "@/lib/cashflow/deleted-retention";

/**
 * Deleted items. Nothing an owner or admin deletes is really gone: the rows
 * are copied (as JSON) into `deleted_items` and then removed from the live
 * tables, so every report, total and list stays correct. Only the superuser
 * can bring an item back, or remove it for good.
 *
 * Archiving is written BEFORE the live rows are removed: if the copy fails,
 * nothing is deleted.
 */

export const DELETED_KINDS = [
  "visit",
  "line",
  "payment",
  "expense",
  "attachment",
] as const;
export type DeletedKind = (typeof DELETED_KINDS)[number];

export const DELETED_KIND_LABELS: Record<DeletedKind, string> = {
  visit: "Visit",
  line: "Procedure line",
  payment: "Payment",
  expense: "Expense",
  attachment: "File",
};

export type Actor = { userId: string | null; name: string };

type Row = Record<string, unknown>;
type Snapshot = Record<string, Row[]>;

/** Restored in this order: parents before the rows that point at them. */
const RESTORE_ORDER = [
  "expenses",
  "invoices",
  "transactions",
  "payments",
  "attachments",
  "invoice_status_history",
] as const;
type SnapshotTable = (typeof RESTORE_ORDER)[number];

const TABLES: Record<SnapshotTable, PgTable> = {
  expenses,
  invoices,
  transactions,
  payments,
  attachments,
  invoice_status_history: invoiceStatusHistory,
};

/** Links that must still resolve for the item to make sense on its own. */
const HARD_PARENTS: Record<SnapshotTable, string[]> = {
  expenses: [],
  invoices: [],
  transactions: ["invoiceId"],
  payments: ["invoiceId"],
  attachments: ["invoiceId", "expenseId", "paymentId"],
  invoice_status_history: ["invoiceId"],
};

const PARENT_NAMES: Record<string, string> = {
  invoiceId: "visit",
  expenseId: "expense",
  paymentId: "payment",
};

let warned = false;

/** True until scripts/sql/2026-11-roles-permissions-trash.sql has been run. */
export function deletedItemsSchemaMissing(error: unknown): boolean {
  const text = String(error) + String((error as { cause?: unknown })?.cause ?? "");
  const missing = /deleted_items/.test(text);
  if (missing && !warned) {
    warned = true;
    console.warn(
      "Deleted items are OFF: run scripts/sql/2026-11-roles-permissions-trash.sql.",
    );
  }
  return missing;
}

export const ARCHIVE_NOT_READY =
  "Deleting needs the new Deleted items table first. Run scripts/sql/2026-11-roles-permissions-trash.sql in Neon, then try again.";

const money = (value: number) =>
  value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Copies rows into the archive. Throws (nothing is deleted) if that fails. */
async function archive(input: {
  kind: DeletedKind;
  entityId: string;
  label: string;
  summary: string;
  branchId: string | null;
  amount: number | null;
  snapshot: Snapshot;
  actor: Actor;
}): Promise<void> {
  try {
    await db.insert(deletedItems).values({
      kind: input.kind,
      entityId: input.entityId,
      label: input.label,
      summary: input.summary,
      branchId: input.branchId,
      amount: input.amount === null ? null : input.amount.toFixed(2),
      snapshot: input.snapshot,
      deletedByUserId: input.actor.userId,
      deletedByName: input.actor.name,
    });
  } catch (error) {
    if (deletedItemsSchemaMissing(error)) {
      throw new Error(ARCHIVE_NOT_READY);
    }
    throw error;
  }
  // The archive only grows when something is deleted, so this is also the
  // moment to clear what has been kept long enough (no scheduled job needed).
  // It never blocks or fails the delete itself.
  await purgeExpiredDeletedItems().catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Archiving + deleting (called by the delete actions)
// ---------------------------------------------------------------------------

/** A whole visit: the invoice, its lines, payments, files and status history. */
export async function softDeleteVisit(
  invoiceId: string,
  actor: Actor,
): Promise<boolean> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) return false;
  const lines = await db.select().from(transactions).where(eq(transactions.invoiceId, invoiceId));
  const lineIds = lines.map((line) => line.id);
  const paymentRows = await db
    .select()
    .from(payments)
    .where(
      lineIds.length > 0
        ? or(eq(payments.invoiceId, invoiceId), inArray(payments.transactionId, lineIds))
        : eq(payments.invoiceId, invoiceId),
    );
  const paymentIds = paymentRows.map((payment) => payment.id);
  const files = await db
    .select()
    .from(attachments)
    .where(
      paymentIds.length > 0
        ? or(eq(attachments.invoiceId, invoiceId), inArray(attachments.paymentId, paymentIds))
        : eq(attachments.invoiceId, invoiceId),
    );
  const history = await db
    .select()
    .from(invoiceStatusHistory)
    .where(eq(invoiceStatusHistory.invoiceId, invoiceId));

  const total = lines.reduce((sum, line) => sum + num(line.amountPaid), 0);
  const patient = lines[0]?.patientName || "Visit";
  await archive({
    kind: "visit",
    entityId: invoiceId,
    label: `${patient} · ${invoice.visitDate}`,
    summary: `${lines.length} ${lines.length === 1 ? "procedure" : "procedures"}${invoice.invoiceNumber ? ` · invoice ${invoice.invoiceNumber}` : ""} · ${paymentRows.length} ${paymentRows.length === 1 ? "payment" : "payments"}${files.length ? ` · ${files.length} ${files.length === 1 ? "file" : "files"}` : ""}`,
    branchId: invoice.branchId,
    amount: Math.round(total * 100) / 100,
    snapshot: {
      invoices: [invoice],
      transactions: lines,
      payments: paymentRows,
      attachments: files,
      invoice_status_history: history,
    },
    actor,
  });

  if (lineIds.length > 0) {
    await db.delete(transactions).where(eq(transactions.invoiceId, invoiceId));
  }
  await db.delete(invoices).where(eq(invoices.id, invoiceId));
  return true;
}

/** One procedure line. The last line of a visit takes the whole visit with it. */
export async function softDeleteLine(
  id: string,
  actor: Actor,
): Promise<"visit" | "line" | null> {
  const [line] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  if (!line) return null;

  if (line.invoiceId) {
    const [others] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(and(eq(transactions.invoiceId, line.invoiceId), sql`${transactions.id} <> ${id}`));
    if ((others?.count ?? 0) === 0) {
      // An invoice with no lines left is an empty shell: archive it as the
      // whole visit so a restore brings back the payments and files too.
      await softDeleteVisit(line.invoiceId, actor);
      return "visit";
    }
  }

  const linked = await db.select().from(payments).where(eq(payments.transactionId, id));
  await archive({
    kind: "line",
    entityId: id,
    label: `${line.patientName || "Procedure"} · ${line.procedure || "line"}`,
    summary: `${line.date} · ${line.visitId}${line.invoiceId ? "" : " · no visit"}`,
    branchId: line.branchId ?? null,
    amount: num(line.amountPaid),
    snapshot: { transactions: [line], payments: linked },
    actor,
  });
  await db.delete(transactions).where(eq(transactions.id, id));
  return "line";
}

/** A payment (and the proof files attached to it). Returns its visit's id. */
export async function softDeletePayment(
  id: string,
  actor: Actor,
): Promise<string | null> {
  const [payment] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  if (!payment) return null;
  const files = await db.select().from(attachments).where(eq(attachments.paymentId, id));
  let patient = "";
  let visitDate = "";
  let branchId: string | null = null;
  if (payment.invoiceId) {
    const [invoice] = await db
      .select({ visitDate: invoices.visitDate, branchId: invoices.branchId })
      .from(invoices)
      .where(eq(invoices.id, payment.invoiceId))
      .limit(1);
    visitDate = invoice?.visitDate ?? "";
    branchId = invoice?.branchId ?? null;
    const [first] = await db
      .select({ name: transactions.patientName })
      .from(transactions)
      .where(eq(transactions.invoiceId, payment.invoiceId))
      .limit(1);
    patient = first?.name ?? "";
  }
  await archive({
    kind: "payment",
    entityId: id,
    label: `${payment.paymentType} ${money(num(payment.amount))}${patient ? ` · ${patient}` : ""}`,
    summary: `${visitDate ? `visit of ${visitDate}` : "payment"}${payment.referenceNo ? ` · ref ${payment.referenceNo}` : ""}${files.length ? ` · ${files.length} ${files.length === 1 ? "file" : "files"}` : ""}`,
    branchId,
    amount: num(payment.amount),
    snapshot: { payments: [payment], attachments: files },
    actor,
  });
  await db.delete(payments).where(eq(payments.id, id));
  return payment.invoiceId ?? null;
}

/** An expense and its receipts. */
export async function softDeleteExpense(id: string, actor: Actor): Promise<boolean> {
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!expense) return false;
  const files = await db.select().from(attachments).where(eq(attachments.expenseId, id));
  await archive({
    kind: "expense",
    entityId: id,
    label: `${expense.category} ${money(num(expense.amount))}`,
    summary: `${expense.date}${expense.description ? ` · ${expense.description}` : ""}${files.length ? ` · ${files.length} ${files.length === 1 ? "file" : "files"}` : ""}`,
    branchId: expense.branchId ?? null,
    amount: num(expense.amount),
    snapshot: { expenses: [expense], attachments: files },
    actor,
  });
  await db.delete(expenses).where(eq(expenses.id, id));
  return true;
}

/** One attached photo / file. */
export async function softDeleteAttachment(id: string, actor: Actor): Promise<boolean> {
  const [file] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!file) return false;
  let branchId: string | null = null;
  if (file.invoiceId) {
    const [invoice] = await db
      .select({ branchId: invoices.branchId })
      .from(invoices)
      .where(eq(invoices.id, file.invoiceId))
      .limit(1);
    branchId = invoice?.branchId ?? null;
  } else if (file.expenseId) {
    const [expense] = await db
      .select({ branchId: expenses.branchId })
      .from(expenses)
      .where(eq(expenses.id, file.expenseId))
      .limit(1);
    branchId = expense?.branchId ?? null;
  }
  await archive({
    kind: "attachment",
    entityId: id,
    label: file.fileName,
    summary: `${file.kind === "receipt" ? "Receipt" : "Photo / proof"} · ${(num(file.sizeBytes) / 1024).toFixed(0)} KB${file.expenseId ? " · on an expense" : file.paymentId ? " · on a payment" : " · on a visit"}`,
    branchId,
    amount: null,
    snapshot: { attachments: [file] },
    actor,
  });
  await db.delete(attachments).where(eq(attachments.id, id));
  return true;
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export type DeletedItemSummary = {
  id: string;
  kind: DeletedKind;
  entityId: string;
  label: string;
  summary: string;
  branchId: string | null;
  amount: number | null;
  deletedByName: string;
  deletedAt: Date;
  restoredAt: Date | null;
  restoredByName: string;
};

function asKind(value: string): DeletedKind {
  return (DELETED_KINDS as readonly string[]).includes(value)
    ? (value as DeletedKind)
    : "visit";
}

/** Without the snapshot (which can hold photos): just what the list shows. */
export async function listDeletedItems(input: {
  kind?: DeletedKind | null;
  showRestored?: boolean;
  limit?: number;
}): Promise<DeletedItemSummary[]> {
  const conditions = [];
  if (input.kind) conditions.push(eq(deletedItems.kind, input.kind));
  if (!input.showRestored) conditions.push(isNull(deletedItems.restoredAt));
  try {
    const rows = await db
      .select({
        id: deletedItems.id,
        kind: deletedItems.kind,
        entityId: deletedItems.entityId,
        label: deletedItems.label,
        summary: deletedItems.summary,
        branchId: deletedItems.branchId,
        amount: deletedItems.amount,
        deletedByName: deletedItems.deletedByName,
        deletedAt: deletedItems.deletedAt,
        restoredAt: deletedItems.restoredAt,
        restoredByName: deletedItems.restoredByName,
      })
      .from(deletedItems)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(deletedItems.deletedAt))
      .limit(input.limit ?? 300);
    return rows.map((row) => ({
      ...row,
      kind: asKind(row.kind),
      amount: row.amount === null ? null : num(row.amount),
    }));
  } catch (error) {
    if (deletedItemsSchemaMissing(error)) return [];
    throw error;
  }
}

/** How many deleted items wait (not restored yet). */
export async function countDeletedItems(): Promise<number | null> {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(deletedItems)
      .where(isNull(deletedItems.restoredAt));
    return row?.count ?? 0;
  } catch (error) {
    if (deletedItemsSchemaMissing(error)) return null;
    throw error;
  }
}

/** Whether the archive table exists (for the page's "run the SQL" notice). */
export async function deletedItemsReady(): Promise<boolean> {
  return (await countDeletedItems()) !== null;
}

// ---------------------------------------------------------------------------
// Restoring
// ---------------------------------------------------------------------------

export type RestoreResult =
  | { ok: true; message: string }
  | { ok: false; message: string; canForce?: boolean };

const DATE_KEY = "date";

/** JSON turned the dates into text: put real Dates back for the insert. */
function revive(table: PgTable, row: Row): Row {
  const columns = getTableColumns(table);
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    const column = columns[key] as AnyPgColumn | undefined;
    if (column && column.dataType === DATE_KEY && typeof value === "string") {
      out[key] = new Date(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function primaryIds(table: PgTable, rows: Row[]): string[] {
  const idColumn = (getTableColumns(table) as Record<string, AnyPgColumn>).id;
  if (!idColumn) return [];
  return rows.map((row) => String(row.id));
}

/**
 * Puts an archived item back. Checks first (the id is free, what it belongs
 * to still exists), and undoes its own inserts if one of them fails, so it
 * never leaves half a visit behind.
 */
export async function restoreDeletedItem(
  archiveId: string,
  actor: Actor,
  options: { allowNumberClash?: boolean } = {},
): Promise<RestoreResult> {
  let entry;
  try {
    [entry] = await db.select().from(deletedItems).where(eq(deletedItems.id, archiveId)).limit(1);
  } catch (error) {
    if (deletedItemsSchemaMissing(error)) return { ok: false, message: ARCHIVE_NOT_READY };
    throw error;
  }
  if (!entry) return { ok: false, message: "That item is no longer in Deleted items." };
  if (entry.restoredAt) {
    return { ok: false, message: "That item was already restored." };
  }

  const snapshot = (entry.snapshot ?? {}) as Snapshot;
  const tableNames = RESTORE_ORDER.filter((name) => (snapshot[name]?.length ?? 0) > 0);
  if (tableNames.length === 0) {
    return { ok: false, message: "This archived item has no content left to restore." };
  }

  // 1. Every id must be free.
  for (const name of tableNames) {
    const table = TABLES[name];
    const ids = primaryIds(table, snapshot[name]);
    if (ids.length === 0) continue;
    const idColumn = (getTableColumns(table) as Record<string, AnyPgColumn>).id;
    const existing = await db.select({ id: idColumn }).from(table).where(inArray(idColumn, ids));
    if (existing.length > 0) {
      return {
        ok: false,
        message: `Can't restore: a ${DELETED_KIND_LABELS[asKind(entry.kind)].toLowerCase()} with the same record already exists (it may have been restored or re-entered).`,
      };
    }
  }

  // 2. A visit's booklet number may now belong to another visit.
  const invoiceRow = snapshot.invoices?.[0];
  if (invoiceRow && !options.allowNumberClash) {
    const number = String(invoiceRow.invoiceNumber ?? "").trim();
    if (number) {
      const clash = await db
        .select({ id: invoices.id, visitDate: invoices.visitDate })
        .from(invoices)
        .where(
          and(
            eq(invoices.invoiceNumber, number),
            invoiceRow.branchId
              ? eq(invoices.branchId, String(invoiceRow.branchId))
              : isNull(invoices.branchId),
          ),
        )
        .limit(1);
      if (clash.length > 0) {
        return {
          ok: false,
          canForce: true,
          message: `Invoice number ${number} is now used by another visit (${clash[0].visitDate}). Restoring would repeat the number.`,
        };
      }
    }
  }

  // 3. Everything each row points at must still exist; soft links to
  // something gone (a removed user, supplier, procedure) are cleared, but
  // the visit / expense / payment it belongs to must be there.
  const restoring: Record<string, Row[]> = {};
  const inSnapshot = (table: PgTable, value: unknown): boolean => {
    const name = tableNames.find((candidate) => TABLES[candidate] === table);
    if (!name) return false;
    return snapshot[name].some((row) => String(row.id) === String(value));
  };
  for (const name of tableNames) {
    const table = TABLES[name];
    const columns = getTableColumns(table) as Record<string, AnyPgColumn>;
    const keyByColumnName = new Map(
      Object.entries(columns).map(([key, column]) => [column.name, key]),
    );
    const rows = snapshot[name].map((row) => revive(table, row));
    for (const foreignKey of getTableConfig(table).foreignKeys) {
      const reference = foreignKey.reference();
      const key = keyByColumnName.get(reference.columns[0].name);
      if (!key) continue;
      const foreignTable = reference.foreignTable as PgTable;
      const foreignColumn = reference.foreignColumns[0] as AnyPgColumn;
      const values = [
        ...new Set(rows.map((row) => row[key]).filter((v) => v !== null && v !== undefined)),
      ].map(String);
      if (values.length === 0) continue;
      const found = await db
        .select({ value: foreignColumn })
        .from(foreignTable)
        .where(inArray(foreignColumn, values));
      const present = new Set(found.map((item) => String(item.value)));
      const missing = values.filter(
        (value) => !present.has(value) && !inSnapshot(foreignTable, value),
      );
      if (missing.length === 0) continue;
      if (HARD_PARENTS[name].includes(key)) {
        const parent = PARENT_NAMES[key] ?? "record";
        return {
          ok: false,
          message: `Can't restore: the ${parent} it belongs to no longer exists. Restore the ${parent} first.`,
        };
      }
      for (const row of rows) {
        if (missing.includes(String(row[key]))) row[key] = null;
      }
    }
    restoring[name] = rows;
  }

  // 4. Insert, parents first; undo what was inserted if one step fails.
  const inserted: SnapshotTable[] = [];
  try {
    for (const name of tableNames) {
      const table = TABLES[name];
      const rows = restoring[name];
      for (let index = 0; index < rows.length; index += 100) {
        await db.insert(table).values(rows.slice(index, index + 100) as never);
      }
      inserted.push(name);
    }
  } catch (error) {
    console.error("Restore failed; undoing", error);
    for (const name of [...inserted, tableNames[inserted.length]].reverse()) {
      if (!name) continue;
      const table = TABLES[name];
      const idColumn = (getTableColumns(table) as Record<string, AnyPgColumn>).id;
      const ids = primaryIds(table, snapshot[name]);
      if (idColumn && ids.length > 0) {
        await db.delete(table).where(inArray(idColumn, ids)).catch(() => undefined);
      }
    }
    return {
      ok: false,
      message:
        "The restore could not be completed and nothing was changed. Please try again, or tell the developer.",
    };
  }

  await db
    .update(deletedItems)
    .set({ restoredAt: new Date(), restoredByName: actor.name, snapshot: {} })
    .where(eq(deletedItems.id, archiveId));

  const kind = asKind(entry.kind);
  await logAudit({
    action: `${kind}.restored`,
    entityType:
      kind === "payment" ? "payment" : kind === "expense" ? "expense" : "invoice",
    entityId: entry.entityId,
    invoiceId: kind === "visit" ? entry.entityId : undefined,
    summary: `Restored ${DELETED_KIND_LABELS[kind].toLowerCase()}: ${entry.label}`,
    actor,
  }).catch(() => undefined);

  return {
    ok: true,
    message: `${DELETED_KIND_LABELS[kind]} restored: ${entry.label}.`,
  };
}

/** Removes an archived item for good (superuser only, checked by the caller). */
export async function purgeDeletedItem(archiveId: string): Promise<boolean> {
  const removed = await db
    .delete(deletedItems)
    .where(eq(deletedItems.id, archiveId))
    .returning({ id: deletedItems.id });
  return removed.length > 0;
}

// ---------------------------------------------------------------------------
// Retention: kept for DELETED_ITEMS_RETENTION_DAYS, then removed for good
// ---------------------------------------------------------------------------

let lastExpiredPurge = 0;
const PURGE_EVERY_MS = 60 * 60 * 1000;

/**
 * Removes archived items that have been kept for the retention period (30
 * days). The archive holds JSON copies, including photos, so this is what
 * keeps the database from growing for ever. Items waiting to be restored and
 * items already restored (empty copies, kept only as history) both expire
 * 30 days after they were deleted / restored. The audit trail keeps the
 * record of what was deleted and restored.
 *
 * Runs by itself when something is deleted (at most once an hour per server),
 * when the superuser opens Deleted items, and from the optional cron route.
 * Pass `force` to skip the once-an-hour limit. Never throws.
 */
export async function purgeExpiredDeletedItems(
  options: { force?: boolean; now?: Date } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  if (!options.force && now.getTime() - lastExpiredPurge < PURGE_EVERY_MS) return 0;
  lastExpiredPurge = now.getTime();

  const cutoff = new Date(now.getTime() - DELETED_ITEMS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    const removed = await db
      .delete(deletedItems)
      .where(
        or(
          and(isNull(deletedItems.restoredAt), lt(deletedItems.deletedAt, cutoff)),
          and(isNotNull(deletedItems.restoredAt), lt(deletedItems.restoredAt, cutoff)),
        ),
      )
      .returning({ id: deletedItems.id, restoredAt: deletedItems.restoredAt });
    if (removed.length > 0) {
      const gone = removed.filter((row) => row.restoredAt === null).length;
      await logAudit({
        action: "deleted_items.purged",
        entityType: "user",
        summary: `Clean-up: ${gone} deleted item${gone === 1 ? "" : "s"} kept ${DELETED_ITEMS_RETENTION_DAYS} days were removed for good${
          removed.length > gone ? ` (and ${removed.length - gone} restored record${removed.length - gone === 1 ? "" : "s"})` : ""
        }.`,
        actor: { userId: null, name: "System (30-day clean-up)" },
      });
    }
    return removed.length;
  } catch (error) {
    if (!deletedItemsSchemaMissing(error)) console.error("Deleted items clean-up failed", error);
    return 0;
  }
}

/** Items that will be removed within `days` days (for the page's heads-up). */
export async function countExpiringSoon(days: number): Promise<number> {
  const cutoff = new Date(
    Date.now() - (DELETED_ITEMS_RETENTION_DAYS - days) * 24 * 60 * 60 * 1000,
  );
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(deletedItems)
      .where(and(isNull(deletedItems.restoredAt), lt(deletedItems.deletedAt, cutoff)));
    return row?.count ?? 0;
  } catch (error) {
    if (deletedItemsSchemaMissing(error)) return 0;
    throw error;
  }
}
