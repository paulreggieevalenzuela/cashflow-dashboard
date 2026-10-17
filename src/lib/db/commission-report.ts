import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { branches, transactions } from "@/lib/db/schema";
import type {
  CommissionReport,
  CommissionRow,
} from "@/lib/cashflow/commission-report";
import { round2 } from "@/lib/cashflow/pricing";

/**
 * Every procedure line with a dentist between two visit dates (inclusive),
 * optionally for one branch and one dentist, with the commission stored on
 * each line when it was saved.
 */
export async function getCommissionReport(input: {
  from: string;
  to: string;
  branchId: string | null;
  dentistUserId: string | null;
  branchName: string;
  dentistLabel: string;
}): Promise<CommissionReport> {
  const result = await db
    .select({
      date: transactions.date,
      visitId: transactions.visitId,
      patientName: transactions.patientName,
      dentist: transactions.dentist,
      procedure: transactions.procedure,
      paymentType: transactions.paymentType,
      netCollection: transactions.netCollection,
      commission: transactions.commissionAmount,
      branchName: branches.name,
    })
    .from(transactions)
    .leftJoin(branches, eq(branches.id, transactions.branchId))
    .where(
      and(
        gte(transactions.date, input.from),
        lte(transactions.date, input.to),
        ne(transactions.dentist, ""),
        input.branchId ? eq(transactions.branchId, input.branchId) : undefined,
        input.dentistUserId
          ? eq(transactions.dentistUserId, input.dentistUserId)
          : undefined,
      ),
    )
    .orderBy(
      asc(transactions.dentist),
      asc(transactions.date),
      asc(transactions.visitId),
      asc(transactions.lineNumber),
    );

  const rows: CommissionRow[] = result.map((row) => ({
    date: row.date,
    visitId: row.visitId,
    patientName: row.patientName,
    dentist: row.dentist,
    branchName: row.branchName ?? "",
    procedure: row.procedure,
    paymentType: row.paymentType,
    netCollection: round2(Number(row.netCollection)),
    commission: round2(Number(row.commission)),
  }));

  return {
    from: input.from,
    to: input.to,
    branchName: input.branchName,
    dentistLabel: input.dentistLabel,
    rows,
  };
}
