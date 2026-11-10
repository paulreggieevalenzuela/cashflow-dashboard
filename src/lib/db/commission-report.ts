import { and, asc, eq, gte, lte, ne, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { branches, transactions } from "@/lib/db/schema";
import {
  sortCommissionRows,
  type CommissionReport,
  type CommissionRow,
  type CommissionSortDir,
  type CommissionSortKey,
} from "@/lib/cashflow/commission-report";
import { round2 } from "@/lib/cashflow/pricing";
import { splitCommission, TRANSFER_SHARE_PERCENT } from "@/lib/cashflow/commission-split";

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
  sort: CommissionSortKey;
  dir: CommissionSortDir;
}): Promise<CommissionReport> {
  const result = await db
    .select({
      date: transactions.date,
      visitId: transactions.visitId,
      patientName: transactions.patientName,
      dentist: transactions.dentist,
      dentistUserId: transactions.dentistUserId,
      transferDentist: transactions.transferDentist,
      transferDentistUserId: transactions.transferDentistUserId,
      transferCommission: transactions.transferCommissionAmount,
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
        // A dentist's report includes the lines they were transferred.
        input.dentistUserId
          ? or(
              eq(transactions.dentistUserId, input.dentistUserId),
              eq(transactions.transferDentistUserId, input.dentistUserId),
            )
          : undefined,
      ),
    )
    // Always oldest first here; the chosen order is applied afterwards.
    .orderBy(
      asc(transactions.date),
      asc(transactions.visitId),
      asc(transactions.lineNumber),
    );

  // A transferred patient's line is two report lines: the main dentist's
  // half and the transferred dentist's half. The net collection is divided
  // the same way, so the report still adds up to what was collected and the
  // Rate column still shows the main dentist's rate on both.
  const rows: CommissionRow[] = [];
  for (const row of result) {
    const net = round2(Number(row.netCollection));
    const common = {
      date: row.date,
      visitId: row.visitId,
      patientName: row.patientName,
      branchName: row.branchName ?? "",
      procedure: row.procedure,
      paymentType: row.paymentType,
    };
    const transferred =
      Boolean(row.transferDentistUserId) && Boolean(row.transferDentist);
    if (!transferred) {
      rows.push({
        ...common,
        dentist: row.dentist,
        netCollection: net,
        commission: round2(Number(row.commission)),
      });
      continue;
    }
    const netSplit = splitCommission(net, true);
    if (!input.dentistUserId || input.dentistUserId === row.dentistUserId) {
      rows.push({
        ...common,
        dentist: row.dentist,
        netCollection: netSplit.main,
        commission: round2(Number(row.commission)),
        note: `${TRANSFER_SHARE_PERCENT}% — shared with ${row.transferDentist} (transferred)`,
      });
    }
    if (
      !input.dentistUserId ||
      input.dentistUserId === row.transferDentistUserId
    ) {
      rows.push({
        ...common,
        dentist: row.transferDentist,
        netCollection: netSplit.transfer,
        commission: round2(Number(row.transferCommission)),
        note: `${TRANSFER_SHARE_PERCENT}% — transferred from ${row.dentist}`,
      });
    }
  }

  return {
    from: input.from,
    to: input.to,
    branchName: input.branchName,
    dentistLabel: input.dentistLabel,
    sort: input.sort,
    dir: input.dir,
    rows: sortCommissionRows(rows, input.sort, input.dir),
  };
}
