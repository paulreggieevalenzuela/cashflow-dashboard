import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { hmoPaymentNames } from "@/lib/cashflow/payment-methods";
import { hmoNameFor } from "@/lib/cashflow/day-end";
import {
  CHECK_IN_PLACEHOLDER,
  clinicDay,
  todayInManila,
} from "@/lib/cashflow/visit-status";
import {
  AGING_LABELS,
  GRANULARITIES,
  NO_APPROVALS,
  daysBefore,
  periodStartDates,
  splitHmoReceivable,
  summarizeWaitingNow,
  type AgingBucket,
  type ApprovalCounts,
  type ApprovalWidget,
  type BalanceWidget,
  type HmoPeriodFigures,
  type HmoWidget,
  type OverviewOps,
} from "@/lib/cashflow/overview-ops";
import type { Granularity } from "@/lib/cashflow/dashboard-metrics";
import { checksSchemaMissing, hqChecksSchemaMissing } from "@/lib/db/transaction-checks";
import { getWaitStats, listBoardVisits } from "@/lib/db/visit-status";

type Rows<T> = { rows: T[] };

/** A result column name for one period. Postgres folds unquoted names to lower case, so do the same here. */
const alias_ = (name: string, g: Granularity) => `${name}_${g}`.toLowerCase();

/** True when `column` (a SQL column name written by us) holds an HMO payment type. */
function isHmoSql(column: string): SQL {
  const names = hmoPaymentNames().map((name) => name.trim().toLowerCase());
  if (names.length === 0) return sql`false`;
  return sql`lower(trim(${sql.raw(column)})) in (${sql.join(
    names.map((name) => sql`${name}`),
    sql`, `,
  )})`;
}

const branchSql = (column: string, branchId: string | null): SQL =>
  branchId ? sql`and ${sql.raw(column)} = ${branchId}` : sql``;

const billingTablesMissing = (error: unknown) => {
  const text = String(error) + String((error as { cause?: unknown })?.cause ?? "");
  return /hmo_billing_lines/.test(text) && /does not exist|relation/.test(text);
};

// ── 2. Outstanding balances ──────────────────────────────────────────

/**
 * What patients still owe, from visits that reached For Payment or Cleared
 * (a visit still being treated is not "owed" yet). HMO shares are left out:
 * they are the HMO's to pay and sit in the HMO card. Per visit it is
 * `(bill - received)` less the HMO's part, so it never exceeds the visit's
 * own balance on the Transactions page.
 */
async function getBalances(branchId: string | null, today: string): Promise<BalanceWidget> {
  const result = await db.execute(sql`
    select
      coalesce(sum(bal), 0)::float8 as total,
      count(*)::int as visits,
      min(visit_date) as oldest,
      coalesce(sum(bal) filter (where age <= 7), 0)::float8 as week_amount,
      (count(*) filter (where age <= 7))::int as week_visits,
      coalesce(sum(bal) filter (where age > 7 and age <= 30), 0)::float8 as month_amount,
      (count(*) filter (where age > 7 and age <= 30))::int as month_visits,
      coalesce(sum(bal) filter (where age > 30), 0)::float8 as older_amount,
      (count(*) filter (where age > 30))::int as older_visits
    from (
      select
        i.visit_date,
        (${today}::date - i.visit_date::date) as age,
        greatest(
          0,
          greatest(0, d.due_all - coalesce(p.paid_all, 0))
            - greatest(0, d.due_hmo - coalesce(p.paid_hmo, 0))
        ) as bal
      from invoices i
      join (
        select t.invoice_id,
          sum(t.amount_paid) as due_all,
          coalesce(sum(t.amount_paid) filter (where ${isHmoSql("t.payment_type")}), 0) as due_hmo
        from transactions t
        where t.invoice_id is not null and t.procedure <> ${CHECK_IN_PLACEHOLDER}
        group by t.invoice_id
      ) d on d.invoice_id = i.id
      left join (
        select p.invoice_id,
          sum(p.amount) as paid_all,
          coalesce(sum(p.amount) filter (where ${isHmoSql("p.payment_type")}), 0) as paid_hmo
        from payments p
        where p.invoice_id is not null
        group by p.invoice_id
      ) p on p.invoice_id = i.id
      where i.status in ('For Payment', 'Cleared') ${branchSql("i.branch_id", branchId)}
    ) s
    where bal > 0.005
  `);
  const row = (result as unknown as Rows<Record<string, string | number | null>>).rows[0];
  const num = (key: string) => Number(row?.[key] ?? 0);
  const amounts: Record<AgingBucket["key"], [number, number]> = {
    week: [num("week_amount"), num("week_visits")],
    month: [num("month_amount"), num("month_visits")],
    older: [num("older_amount"), num("older_visits")],
  };
  return {
    total: Math.round(num("total") * 100) / 100,
    visits: num("visits"),
    oldestDate: (row?.oldest as string | null) ?? null,
    buckets: (Object.keys(AGING_LABELS) as AgingBucket["key"][]).map((key) => ({
      key,
      label: AGING_LABELS[key],
      amount: Math.round(amounts[key][0] * 100) / 100,
      visits: amounts[key][1],
    })),
  };
}

// ── 3. Approval progress ─────────────────────────────────────────────

async function getApprovals(
  branchId: string | null,
  today: string,
  starts: Record<Granularity, string>,
): Promise<ApprovalWidget> {
  const columns = (stage: SQL, alias: string, extra: SQL = sql``) =>
    sql.join(
      GRANULARITIES.map(
        (g) =>
          sql`(count(*) filter (where ${stage} ${extra} and visit_date >= ${starts[g]}))::int as ${sql.raw(alias_(alias, g))}`,
      ),
      sql`, `,
    );
  const toCheck = sql`checked < lines`;
  const waitingHq = sql`checked >= lines and hq < lines`;
  const approved = sql`checked >= lines and hq >= lines`;
  const late = sql`and (${today}::date - visit_date::date) > 2`;

  const run = (withHq: boolean) =>
    db.execute(sql`
      select
        ${columns(toCheck, "to_check")},
        ${columns(toCheck, "late", late)},
        ${columns(waitingHq, "waiting_hq")},
        ${columns(approved, "approved")}
      from (
        select i.visit_date,
          count(t.id)::int as lines,
          count(c.transaction_id)::int as checked,
          ${withHq ? sql`count(h.transaction_id)::int` : sql`0`} as hq
        from invoices i
        join transactions t on t.invoice_id = i.id and t.procedure <> ${CHECK_IN_PLACEHOLDER}
        left join transaction_checks c on c.transaction_id = t.id
        ${withHq ? sql`left join transaction_hq_checks h on h.transaction_id = t.id` : sql``}
        where i.status = 'Cleared'
          and i.visit_date >= ${starts.annual}
          ${branchSql("i.branch_id", branchId)}
        group by i.id, i.visit_date
      ) v
    `);

  let withHq = true;
  let result;
  try {
    result = await run(true);
  } catch (error) {
    if (checksSchemaMissing(error)) {
      return {
        ready: false,
        hqReady: false,
        byPeriod: Object.fromEntries(
          GRANULARITIES.map((g) => [g, NO_APPROVALS]),
        ) as Record<Granularity, ApprovalCounts>,
      };
    }
    if (!hqChecksSchemaMissing(error)) throw error;
    withHq = false;
    result = await run(false);
  }
  const row = (result as unknown as Rows<Record<string, number>>).rows[0] ?? {};
  const byPeriod = Object.fromEntries(
    GRANULARITIES.map((g) => [
      g,
      {
        toCheck: Number(row[alias_('to_check', g)] ?? 0),
        late: Number(row[alias_('late', g)] ?? 0),
        waitingHq: Number(row[alias_('waiting_hq', g)] ?? 0),
        approved: Number(row[alias_('approved', g)] ?? 0),
      },
    ]),
  ) as Record<Granularity, ApprovalCounts>;
  return { ready: true, hqReady: withHq, byPeriod };
}

// ── 4. HMO receivables ───────────────────────────────────────────────

async function getHmoReceivables(
  branchId: string | null,
  starts: Record<Granularity, string>,
): Promise<Omit<HmoWidget, "loaPending">> {
  const perPeriod = (expression: (g: Granularity) => SQL, alias: string) =>
    sql.join(
      GRANULARITIES.map((g) => sql`${expression(g)} as ${sql.raw(alias_(alias, g))}`),
      sql`, `,
    );

  const lineQuery = (withBilling: boolean) =>
    db.execute(sql`
      select lower(trim(t.payment_type)) as k,
        ${perPeriod(
          (g) =>
            sql`coalesce(sum(t.amount_paid) filter (where i.visit_date >= ${starts[g]}), 0)::float8`,
          "total",
        )},
        ${perPeriod(
          (g) =>
            withBilling
              ? sql`coalesce(sum(t.amount_paid) filter (where i.visit_date >= ${starts[g]} and bl.transaction_id is null), 0)::float8`
              : sql`coalesce(sum(t.amount_paid) filter (where i.visit_date >= ${starts[g]}), 0)::float8`,
          "unbilled",
        )},
        ${perPeriod(
          (g) =>
            sql`(count(distinct t.invoice_id) filter (where i.visit_date >= ${starts[g]}))::int`,
          "visits",
        )}
      from transactions t
      join invoices i on i.id = t.invoice_id
      ${withBilling ? sql`left join hmo_billing_lines bl on bl.transaction_id = t.id and bl.active` : sql``}
      where ${isHmoSql("t.payment_type")}
        and t.procedure <> ${CHECK_IN_PLACEHOLDER}
        and i.visit_date >= ${starts.annual}
        ${branchSql("i.branch_id", branchId)}
      group by 1
    `);

  let billingReady = true;
  let lines;
  try {
    lines = await lineQuery(true);
  } catch (error) {
    if (!billingTablesMissing(error)) throw error;
    billingReady = false;
    lines = await lineQuery(false);
  }
  const received = await db.execute(sql`
    select lower(trim(p.payment_type)) as k,
      ${perPeriod(
        (g) =>
          sql`coalesce(sum(p.amount) filter (where i.visit_date >= ${starts[g]}), 0)::float8`,
        "received",
      )}
    from payments p
    join invoices i on i.id = p.invoice_id
    where ${isHmoSql("p.payment_type")}
      and i.visit_date >= ${starts.annual}
      ${branchSql("i.branch_id", branchId)}
    group by 1
  `);

  const lineRows = (lines as unknown as Rows<Record<string, string | number>>).rows;
  const paidRows = (received as unknown as Rows<Record<string, string | number>>).rows;
  const paidBy = new Map(paidRows.map((row) => [String(row.k), row]));

  const byPeriod = {} as Record<Granularity, HmoPeriodFigures>;
  for (const g of GRANULARITIES) {
    const rows = lineRows
      .map((row) => {
        const total = Number(row[alias_('total', g)] ?? 0);
        const split = splitHmoReceivable({
          total,
          unbilled: Number(row[alias_('unbilled', g)] ?? 0),
          received: Number(paidBy.get(String(row.k))?.[alias_('received', g)] ?? 0),
        });
        return {
          hmo: hmoNameFor(String(row.k)),
          visits: Number(row[alias_('visits', g)] ?? 0),
          ...split,
        };
      })
      .filter((row) => row.toBill + row.waiting > 0.004)
      .sort((a, b) => b.toBill + b.waiting - (a.toBill + a.waiting));
    byPeriod[g] = {
      rows: rows.map(({ hmo, toBill, waiting }) => ({ hmo, toBill, waiting })),
      toBill: Math.round(rows.reduce((sum, row) => sum + row.toBill, 0) * 100) / 100,
      waiting: Math.round(rows.reduce((sum, row) => sum + row.waiting, 0) * 100) / 100,
      visits: lineRows.reduce((sum, row) => sum + Number(row[alias_('visits', g)] ?? 0), 0),
    };
  }
  return { billingReady, byPeriod };
}

// ── All four ─────────────────────────────────────────────────────────

/**
 * The "Right now" widgets of the Overview. `branchId` limits everything to one
 * clinic (null = all). `withApprovals` is false for people who may not see
 * the approval card, so its query is skipped.
 */
export async function getOverviewOps(input: {
  branchId: string | null;
  referenceDate: Date;
  withApprovals: boolean;
}): Promise<OverviewOps> {
  const today = todayInManila();
  const starts = periodStartDates(input.referenceDate);
  const [todayStats, last30, board, balances, approvals, hmo] = await Promise.all([
    getWaitStats(today, input.branchId),
    getWaitStats(daysBefore(today, 29), input.branchId),
    listBoardVisits(today, input.branchId),
    getBalances(input.branchId, today),
    input.withApprovals
      ? getApprovals(input.branchId, today, starts)
      : Promise.resolve(null),
    getHmoReceivables(input.branchId, starts),
  ]);
  return {
    periodStarts: starts,
    waiting: {
      today: todayStats,
      last30Days: last30,
      board: summarizeWaitingNow(board, Date.now(), today, clinicDay),
    },
    balances,
    approvals,
    hmo: {
      ...hmo,
      loaPending: board.filter((visit) => visit.loaPending).length,
    },
  };
}
