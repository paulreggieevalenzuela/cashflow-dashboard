import { and, desc, eq, like, ne } from "drizzle-orm";
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
  entityType: "invoice" | "patient" | "payment";
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

export async function listRecentAudit(input: {
  group?: "visit" | "payment" | "status" | "patient";
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
