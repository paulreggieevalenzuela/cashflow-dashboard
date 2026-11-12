import { config } from "dotenv";
config({ path: ".env.local", override: true });

// The Overview's "Right now" widgets: waiting times, outstanding balances,
// approval progress and HMO receivables.
async function main() {
  const { sql } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db/client");
  const ops = await import("../src/lib/cashflow/overview-ops");
  const { getOverviewOps } = await import("../src/lib/db/overview-ops");
  const { todayInManila, clinicDay } = await import("../src/lib/cashflow/visit-status");

  let fails = 0;
  const check = (name: string, ok: boolean, extra?: unknown) => {
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`);
  };
  const J = JSON.stringify;

  // --- pure ---
  const starts = ops.periodStartDates(new Date("2026-11-12T00:00:00"));
  check("period starts (Nov 12)", J(starts) === J({ monthly: "2026-11-01", quarterly: "2026-10-01", semiAnnual: "2026-07-01", annual: "2026-01-01" }), starts);
  const s2 = ops.periodStartDates(new Date("2026-03-31T00:00:00"));
  check("period starts (Mar 31)", s2.monthly === "2026-03-01" && s2.quarterly === "2026-01-01" && s2.semiAnnual === "2026-01-01" && s2.annual === "2026-01-01", s2);
  check("daysBefore crosses month and year", ops.daysBefore("2026-03-01", 1) === "2026-02-28" && ops.daysBefore("2026-01-05", 29) === "2025-12-07");
  check("daysBetween", ops.daysBetween("2026-11-01", "2026-11-12") === 11 && ops.daysBetween("2025-12-31", "2026-01-01") === 1);
  check("aging buckets", ops.agingKey(0) === "week" && ops.agingKey(7) === "week" && ops.agingKey(8) === "month" && ops.agingKey(30) === "month" && ops.agingKey(31) === "older");
  check("approval stage: no lines", ops.approvalStageOfCounts({ lines: 0, checked: 0, hqChecked: 0 }) === null);
  check("approval stage: none / partial -> toCheck", ops.approvalStageOfCounts({ lines: 2, checked: 0, hqChecked: 0 }) === "toCheck" && ops.approvalStageOfCounts({ lines: 2, checked: 1, hqChecked: 0 }) === "toCheck");
  check("approval stage: branch done -> waitingHq", ops.approvalStageOfCounts({ lines: 2, checked: 2, hqChecked: 1 }) === "waitingHq");
  check("approval stage: approved", ops.approvalStageOfCounts({ lines: 2, checked: 2, hqChecked: 2 }) === "approved");
  const sp = ops.splitHmoReceivable({ total: 100, unbilled: 40, received: 30 });
  check("hmo split: 100 total, 40 unbilled, 30 received", sp.toBill === 40 && sp.waiting === 30, sp);
  const sp2 = ops.splitHmoReceivable({ total: 100, unbilled: 40, received: 80 });
  check("hmo split: received covers most", sp2.toBill === 20 && sp2.waiting === 0, sp2);
  const sp3 = ops.splitHmoReceivable({ total: 100, unbilled: 0, received: 150 });
  check("hmo split: overpaid never negative", sp3.toBill === 0 && sp3.waiting === 0, sp3);

  const nowMs = Date.parse("2026-11-12T10:00:00+08:00");
  const iso = (minutesAgo: number) => new Date(nowMs - minutesAgo * 60000).toISOString();
  const wn = ops.summarizeWaitingNow(
    [
      { status: "Arrived", statusChangedAt: iso(25) },
      { status: "Arrived", statusChangedAt: iso(5) },
      { status: "On-going", statusChangedAt: iso(40) },
      { status: "For Payment", statusChangedAt: iso(60 * 30) },
      { status: "Cleared", statusChangedAt: iso(10) },
    ],
    nowMs,
    "2026-11-12",
    clinicDay,
  );
  check("waiting now: Arrived 2, longest 25", wn.now[0].count === 2 && wn.now[0].longestMinutes === 25, wn.now[0]);
  check("waiting now: On-going 1, longest 40", wn.now[1].count === 1 && wn.now[1].longestMinutes === 40, wn.now[1]);
  check("waiting now: forgotten visit counted apart, Cleared ignored", wn.now[2].count === 0 && wn.now[2].longestMinutes === null && wn.earlierOpen === 1, wn);

  // --- database: a test branch holds every fixture, so figures are absolute ---
  const cleanup = async (id: string) => {
    await db.execute(sql`delete from hmo_billing_lines where transaction_id like 'OPS-%'`);
    await db.execute(sql`delete from hmo_billings where billing_number like 'OPS-%'`);
    await db.execute(sql`delete from transactions where branch_id = ${id}`);
    await db.execute(sql`delete from invoices where branch_id = ${id}`);
  };
  const [oldBranch] = (await db.execute(sql`select id from branches where name = 'ZZ Ops Test'`)).rows as Array<{ id: string }>;
  if (oldBranch) {
    await cleanup(oldBranch.id);
    await db.execute(sql`delete from branches where id = ${oldBranch.id}`);
  }
  const [branch] = (await db.execute(sql`insert into branches (name) values ('ZZ Ops Test') returning id`)).rows as Array<{ id: string }>;
  const B = branch.id;
  const today = todayInManila();
  const ago = (days: number) => ops.daysBefore(today, days);

  type Line = { id: string; type: string; amount: number; procedure?: string };
  let n = 0;
  const visit = async (input: {
    date: string; status: string; lines: Line[];
    paid?: Array<{ type: string; amount: number }>;
    changedMinutesAgo?: number; changedDaysAgo?: number; loa?: string;
  }) => {
    const [inv] = (await db.execute(sql`
      insert into invoices (visit_date, branch_id, status, loa_number, status_changed_at)
      values (${input.date}, ${B}, ${input.status}, ${input.loa ?? ""},
        now() - make_interval(mins => ${(input.changedDaysAgo ?? 0) * 1440 + (input.changedMinutesAgo ?? 0)}::int))
      returning id`)).rows as Array<{ id: string }>;
    n += 1;
    let ln = 0;
    for (const line of input.lines) {
      ln += 1;
      await db.execute(sql`
        insert into transactions (id, date, visit_id, patient_name, transaction_type, procedure, payment_type,
          amount_paid, month, year, net_collection, line_number, invoice_id, branch_id)
        values (${line.id}, ${input.date}, ${"OPSV" + n}, ${"ZZ Ops Patient " + n}, 'Visit',
          ${line.procedure ?? "Cleaning"}, ${line.type}, ${line.amount}, ${input.date.slice(0, 7)},
          ${Number(input.date.slice(0, 4))}, ${line.amount}, ${ln}, ${inv.id}, ${B})`);
    }
    for (const pay of input.paid ?? []) {
      await db.execute(sql`insert into payments (invoice_id, amount, payment_type) values (${inv.id}, ${pay.amount}, ${pay.type})`);
    }
    return inv.id;
  };

  // balances (patient part)
  await visit({ date: ago(40), status: "Cleared", lines: [{ id: "OPS-1", type: "Cash", amount: 1000 }], paid: [{ type: "Cash", amount: 400 }] });
  await visit({ date: ago(10), status: "Cleared", lines: [{ id: "OPS-2", type: "Cash", amount: 500 }] });
  await visit({ date: ago(1), status: "For Payment", lines: [{ id: "OPS-3", type: "Cash", amount: 300 }], paid: [{ type: "Cash", amount: 100 }], changedDaysAgo: 1 });
  await visit({ date: today, status: "Arrived", lines: [{ id: "OPS-4", type: "Cash", amount: 800 }], changedMinutesAgo: 25 });
  await visit({ date: ago(2), status: "Cleared", lines: [{ id: "OPS-8", type: "Cash", amount: 300 }], paid: [{ type: "Cash", amount: 500 }] });
  await visit({ date: today, status: "On-going", lines: [{ id: "OPS-10", type: "Cash", amount: 150 }], changedMinutesAgo: 10 });
  // HMO
  const v5 = await visit({ date: today, status: "Cleared", lines: [{ id: "OPS-5", type: "Maxicare", amount: 1300 }] });
  const v6 = await visit({ date: today, status: "Cleared", lines: [{ id: "OPS-6a", type: "Maxicare", amount: 700 }, { id: "OPS-6b", type: "Cash", amount: 200 }], paid: [{ type: "Cash", amount: 200 }] });
  const v7 = await visit({ date: today, status: "Cleared", lines: [{ id: "OPS-7", type: "Medicard", amount: 1000 }], paid: [{ type: "Medicard", amount: 400 }] });
  const v9 = await visit({ date: today, status: "Cleared", lines: [{ id: "OPS-9a", type: "Cash", amount: 100 }, { id: "OPS-9b", type: "Cash", amount: 100 }], paid: [{ type: "Cash", amount: 200 }] });
  await visit({ date: today, status: "Arrived", lines: [{ id: "OPS-12", type: "Maxicare", amount: 500 }], changedMinutesAgo: 3 });
  void v5; void v7; void v9; void v6;
  // a billing that includes the OPS-6a line
  const [bill] = (await db.execute(sql`insert into hmo_billings (billing_number, hmo, period_from, period_to) values ('OPS-B1', 'Maxicare', ${today}, ${today}) returning id`)).rows as Array<{ id: string }>;
  await db.execute(sql`insert into hmo_billing_lines (billing_id, transaction_id, visit_date, amount) values (${bill.id}, 'OPS-6a', ${today}, 700)`);
  // checks: OPS-5 approved by HQ; OPS-6 (both lines) branch only; OPS-9a partial; the rest unchecked
  await db.execute(sql`insert into transaction_checks (transaction_id) values ('OPS-5'), ('OPS-6a'), ('OPS-6b'), ('OPS-9a')`);
  await db.execute(sql`insert into transaction_hq_checks (transaction_id) values ('OPS-5')`);

  try {
    const full = await getOverviewOps({ branchId: B, referenceDate: new Date(`${today}T00:00:00`), withApprovals: true });

    // balances: OPS-1 600 (older), OPS-2 500 (month), OPS-3 200 (week); OPS-8 overpaid, HMO visits and open visits not counted
    const b = full.balances;
    check("balances: patients owe 1300 over 3 visits", b.total === 1300 && b.visits === 3, b);
    check("balances: oldest unpaid is the 40-day-old visit", b.oldestDate === ago(40), b.oldestDate);
    check("balances: aging buckets 200 / 500 / 600", J(b.buckets.map((x) => [x.key, x.amount, x.visits])) === J([["week", 200, 1], ["month", 500, 1], ["older", 600, 1]]), b.buckets);

    // approvals, built from the same fixture dates
    const model = [
      { date: ago(40), stage: "toCheck" }, // OPS-1
      { date: ago(10), stage: "toCheck" }, // OPS-2
      { date: ago(2), stage: "toCheck" }, // OPS-8
      { date: today, stage: "approved" }, // OPS-5
      { date: today, stage: "waitingHq" }, // OPS-6
      { date: today, stage: "toCheck" }, // OPS-7
      { date: today, stage: "toCheck" }, // OPS-9 (one of two lines checked)
    ];
    const a = full.approvals;
    check("approvals: tables ready", a?.ready === true && a?.hqReady === true, a);
    for (const g of ops.GRANULARITIES) {
      const inPeriod = model.filter((v) => v.date >= starts_(g));
      const expected = {
        toCheck: inPeriod.filter((v) => v.stage === "toCheck").length,
        late: inPeriod.filter((v) => v.stage === "toCheck" && ops.daysBetween(v.date, today) > 2).length,
        waitingHq: inPeriod.filter((v) => v.stage === "waitingHq").length,
        approved: inPeriod.filter((v) => v.stage === "approved").length,
      };
      check(`approvals (${g}): ${J(expected)}`, J(a?.byPeriod[g]) === J(expected), a?.byPeriod[g]);
    }
    function starts_(g: (typeof ops.GRANULARITIES)[number]) {
      return ops.periodStartDates(new Date(`${today}T00:00:00`))[g];
    }
    const noApprovals = await getOverviewOps({ branchId: B, referenceDate: new Date(`${today}T00:00:00`), withApprovals: false });
    check("approvals: left out when the person may not see them", noApprovals.approvals === null);

    // HMO receivables (all four periods include today's visits)
    const h = full.hmo.byPeriod.monthly;
    const maxi = h.rows.find((r) => r.hmo === "Maxicare");
    const medi = h.rows.find((r) => r.hmo === "Medicard");
    check("hmo: Maxicare to bill 1800, waiting 700", maxi?.toBill === 1800 && maxi?.waiting === 700, maxi);
    check("hmo: Medicard 1000 less 400 received = 600 to bill", medi?.toBill === 600 && medi?.waiting === 0, medi);
    check("hmo: totals 2400 to bill, 700 waiting, 4 visits", h.toBill === 2400 && h.waiting === 700 && h.visits === 4, h);
    check("hmo: same figures in every period (all visits are today)", ops.GRANULARITIES.every((g) => full.hmo.byPeriod[g].toBill === 2400 && full.hmo.byPeriod[g].waiting === 700 && full.hmo.byPeriod[g].visits === 4), ops.GRANULARITIES.map((g) => full.hmo.byPeriod[g].toBill));
    check("hmo: biggest first", h.rows[0]?.hmo === "Maxicare", h.rows.map((r) => r.hmo));
    check("hmo: billing tables ready", full.hmo.billingReady === true);
    check("hmo: LOA pending counts the open Maxicare visit", full.hmo.loaPending === 1, full.hmo.loaPending);

    // waiting times
    const wd = full.waiting;
    check("waiting: three stages today and for 30 days", wd.today.length === 3 && wd.last30Days.length === 3);
    check("waiting now: 1 Arrived (longest ~25), 1 On-going, 0 For Payment today", J(wd.board.now.map((x) => x.count)) === J([2, 1, 0]) && (wd.board.now[0].longestMinutes ?? 0) >= 25, wd.board);
    check("waiting now: the For Payment visit from yesterday is 'earlier'", wd.board.earlierOpen === 1, wd.board);

    // other branch is not mixed in
    const empty = await getOverviewOps({ branchId: "00000000-0000-0000-0000-000000000000", referenceDate: new Date(`${today}T00:00:00`), withApprovals: true });
    check("branch scope: an unrelated branch sees none of it", empty.balances.total === 0 && empty.hmo.byPeriod.annual.toBill === 0 && empty.approvals?.byPeriod.annual.toCheck === 0, empty);

    // checks table missing -> approvals report not ready, rest still works
    await db.execute(sql`alter table transaction_checks rename to transaction_checks_off`);
    try {
      const off = await getOverviewOps({ branchId: B, referenceDate: new Date(`${today}T00:00:00`), withApprovals: true });
      check("checks table missing: approvals not ready, others fine", off.approvals?.ready === false && off.balances.total === 1300, off.approvals);
    } finally {
      await db.execute(sql`alter table transaction_checks_off rename to transaction_checks`);
    }
    // HQ table missing -> branch stages still work, hqReady false
    await db.execute(sql`alter table transaction_hq_checks rename to transaction_hq_checks_off`);
    try {
      const off = await getOverviewOps({ branchId: B, referenceDate: new Date(`${today}T00:00:00`), withApprovals: true });
      check("HQ table missing: hqReady false, branch counts kept", off.approvals?.ready === true && off.approvals?.hqReady === false && off.approvals.byPeriod.annual.toCheck === 5, off.approvals);
    } finally {
      await db.execute(sql`alter table transaction_hq_checks_off rename to transaction_hq_checks`);
    }
    // billing tables missing -> everything outstanding counts as "to bill"
    await db.execute(sql`alter table hmo_billing_lines rename to hmo_billing_lines_off`);
    try {
      const off = await getOverviewOps({ branchId: B, referenceDate: new Date(`${today}T00:00:00`), withApprovals: true });
      check("billing table missing: billingReady false, all to bill", off.hmo.billingReady === false && off.hmo.byPeriod.monthly.toBill === 3100 && off.hmo.byPeriod.monthly.waiting === 0, off.hmo.byPeriod.monthly);
    } finally {
      await db.execute(sql`alter table hmo_billing_lines_off rename to hmo_billing_lines`);
    }
  } finally {
    // KEEP_FIXTURES=1 leaves the sample visits in place so the Overview can be looked at.
    if (!process.env.KEEP_FIXTURES) {
      await cleanup(B);
      await db.execute(sql`delete from branches where id = ${B}`);
    }
  }
  console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
