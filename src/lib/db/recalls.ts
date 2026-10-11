import { and, asc, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, patients } from "@/lib/db/schema";

export type RecallItem = {
  invoiceId: string;
  /** A line of the visit, which is what the detail page opens. */
  lineId: string | null;
  patientName: string;
  recallDate: string;
  recallReason: string;
  lastVisitDate: string;
  invoiceNumber: string;
};

/**
 * Patients who were asked to come back and have not had a visit since the
 * one that set the recall. Soonest first, so overdue recalls are on top.
 */
export async function listPendingRecalls(): Promise<RecallItem[]> {
  const rows = await db
    .select({
      invoiceId: invoices.id,
      lineId: sql<string | null>`(select t.id from transactions t where t.invoice_id = invoices.id order by t.line_number limit 1)`,
      patientName: patients.fullName,
      recallDate: invoices.recallDate,
      recallReason: invoices.recallReason,
      lastVisitDate: invoices.visitDate,
      invoiceNumber: invoices.invoiceNumber,
    })
    .from(invoices)
    .leftJoin(patients, sql`${patients.id} = ${invoices.patientId}`)
    .where(
      and(
        isNotNull(invoices.recallDate),
        sql`not exists (
          select 1 from invoices later
          where later.patient_id = invoices.patient_id
            and later.visit_date > invoices.visit_date
        )`,
      ),
    )
    .orderBy(asc(invoices.recallDate))
    .limit(500);
  return rows.map((row) => ({
    invoiceId: row.invoiceId,
    lineId: row.lineId,
    patientName: row.patientName ?? "",
    recallDate: row.recallDate ?? "",
    recallReason: row.recallReason,
    lastVisitDate: row.lastVisitDate,
    invoiceNumber: row.invoiceNumber,
  }));
}
