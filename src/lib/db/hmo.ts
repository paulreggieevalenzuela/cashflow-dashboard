import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, payments, transactions } from "@/lib/db/schema";
import { hasHmoPayment } from "@/lib/cashflow/hmo";

export type HmoInfo = {
  /** Paid (or to be paid) through an HMO: any payment or line says so. */
  isHmo: boolean;
  loaNumber: string;
  loeNumber: string;
};

/**
 * HMO / LOA state for a batch of visits in three queries. A visit counts as
 * an HMO visit when any of its payments, or any of its lines, uses an HMO
 * provider as the payment type.
 */
export async function getHmoInfoByInvoice(
  invoiceIds: string[],
): Promise<Map<string, HmoInfo>> {
  const ids = [...new Set(invoiceIds)];
  const result = new Map<string, HmoInfo>();
  if (ids.length === 0) {
    return result;
  }
  const [headers, paymentTypes, lineTypes] = await Promise.all([
    db
      .select({
        id: invoices.id,
        loaNumber: invoices.loaNumber,
        loeNumber: invoices.loeNumber,
      })
      .from(invoices)
      .where(inArray(invoices.id, ids)),
    db
      .selectDistinct({
        invoiceId: payments.invoiceId,
        paymentType: payments.paymentType,
      })
      .from(payments)
      .where(inArray(payments.invoiceId, ids)),
    db
      .selectDistinct({
        invoiceId: transactions.invoiceId,
        paymentType: transactions.paymentType,
      })
      .from(transactions)
      .where(inArray(transactions.invoiceId, ids)),
  ]);

  const typesByInvoice = new Map<string, string[]>();
  for (const row of [...paymentTypes, ...lineTypes]) {
    if (!row.invoiceId) continue;
    const list = typesByInvoice.get(row.invoiceId) ?? [];
    list.push(row.paymentType);
    typesByInvoice.set(row.invoiceId, list);
  }
  for (const header of headers) {
    result.set(header.id, {
      isHmo: hasHmoPayment(typesByInvoice.get(header.id) ?? []),
      loaNumber: header.loaNumber,
      loeNumber: header.loeNumber,
    });
  }
  return result;
}

export async function getHmoInfo(invoiceId: string): Promise<HmoInfo> {
  const map = await getHmoInfoByInvoice([invoiceId]);
  return (
    map.get(invoiceId) ?? { isHmo: false, loaNumber: "", loeNumber: "" }
  );
}
