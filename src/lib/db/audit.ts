import { and, desc, eq, ilike, like, ne, or, sql, type SQL } from "drizzle-orm";
import type { AuditChange } from "@/lib/cashflow/audit-diff";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

export {
  AUDIT_ACTION_LABELS,
  type AuditAction,
  type AuditEntry,
} from "@/lib/cashflow/audit-types";
import type { AuditAction, AuditEntry } from "@/lib/cashflow/audit-types";


/**
 * Writes one line to the audit trail. Never throws: a visit or payment that
 * was saved must not be reported as failed just because its log line could
 * not be written.
 */
export async function logAudit(entry: {
  action: AuditAction;
  entityType:
    | "invoice"
    | "patient"
    | "payment"
    | "expense"
    | "user"
    | "hmo_billing"
    | "commission";
  entityId?: string;
  invoiceId?: string | null;
  patientId?: string | null;
  summary: string;
  changes?: AuditChange[];
  actor: { userId: string | null; name: string };
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      userId: entry.actor.userId,
      userName: entry.actor.name,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? "",
      invoiceId: entry.invoiceId ?? null,
      patientId: entry.patientId ?? null,
      summary: entry.summary,
      details:
        entry.changes && entry.changes.length > 0
          ? { changes: entry.changes }
          : null,
    });
  } catch (error) {
    console.error("Couldn't write the audit trail", error);
  }
}

function toEntry(row: typeof auditLog.$inferSelect): AuditEntry {
  const details = row.details as { changes?: AuditChange[] } | null;
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    userName: row.userName,
    action: row.action,
    entityType: row.entityType,
    invoiceId: row.invoiceId,
    patientId: row.patientId,
    summary: row.summary,
    changes: details?.changes ?? [],
  };
}

/** A visit's trail, newest first. Status changes have their own history
 * list on the visit page, so they are left out here. */
export async function listAuditForInvoice(
  invoiceId: string,
): Promise<AuditEntry[]> {
  const rows = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.invoiceId, invoiceId),
        ne(auditLog.action, "status.changed"),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(200);
  return rows.map(toEntry);
}

export async function listAuditForPatient(
  patientId: string,
): Promise<AuditEntry[]> {
  const rows = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.patientId, patientId),
        ne(auditLog.action, "status.changed"),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(200);
  return rows.map(toEntry);
}

export const AUDIT_GROUPS = [
  "visit",
  "payment",
  "status",
  "patient",
  "commission",
] as const;
export type AuditGroup = (typeof AUDIT_GROUPS)[number];

export async function listRecentAudit(input: {
  group?: AuditGroup;
  limit?: number;
}): Promise<AuditEntry[]> {
  const rows = await db
    .select()
    .from(auditLog)
    .where(input.group ? like(auditLog.action, `${input.group}.%`) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(input.limit ?? 200);
  return rows.map(toEntry);
}

/** `%`, `_` and `\` typed in the search box are matched as themselves. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * One page of the audit trail, newest first, for the Audit trail page:
 * optionally one kind of change (`group`) and a search. Every word typed
 * must appear somewhere in the entry: who, the summary, the kind of change
 * or the changed fields (so "Ortho Adj" finds the commission changes to it).
 */
export async function listAuditPage(input: {
  group?: AuditGroup;
  q?: string;
  page: number;
  pageSize: number;
}): Promise<{ entries: AuditEntry[]; total: number }> {
  const words = (input.q ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  const conditions: SQL[] = [];
  if (input.group) conditions.push(like(auditLog.action, `${input.group}.%`));
  for (const word of words) {
    const pattern = likePattern(word);
    conditions.push(
      or(
        ilike(auditLog.summary, pattern),
        ilike(auditLog.userName, pattern),
        ilike(auditLog.action, pattern),
        sql`${auditLog.details}::text ILIKE ${pattern}`,
      ) as SQL,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const page = Math.max(1, Math.floor(input.page));
  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(where);
  const rows = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(input.pageSize)
    .offset((page - 1) * input.pageSize);
  return { entries: rows.map(toEntry), total: countRow?.n ?? 0 };
}

/** When (and by whom) each person's access was last changed, by user id. */
export async function lastAccessChanges(): Promise<
  Map<string, { at: Date; by: string }>
> {
  const rows = await db
    .select({
      entityId: auditLog.entityId,
      createdAt: auditLog.createdAt,
      userName: auditLog.userName,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, "user.access_changed"),
        like(auditLog.summary, "%changed the access of%"),
      ),
    )
    .orderBy(desc(auditLog.createdAt));
  const map = new Map<string, { at: Date; by: string }>();
  for (const row of rows) {
    if (!map.has(row.entityId)) map.set(row.entityId, { at: row.createdAt, by: row.userName });
  }
  return map;
}
