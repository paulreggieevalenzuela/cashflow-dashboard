import { config } from "dotenv";
config({ path: ".env.local", override: true });

// Day end: the HMO amount must have a value. An HMO visit has no payment on
// its day (the HMO pays later), so the amount billed to the HMO counts.
async function main() {
  const { sql } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db/client");
  const { getDayEndReport } = await import("../src/lib/db/day-end");
  const { summarizeDayEnd, buildDayEndSheet } = await import("../src/lib/cashflow/day-end");
  const { toCsv } = await import("../src/lib/cashflow/xlsx");

  let fails = 0;
  const check = (name: string, ok: boolean, extra?: unknown) => {
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`);
  };
  const base = {
    date: "2026-11-11", visitId: "v", patientName: "p", dentist: "d", procedure: "x",
    paymentType: "", amountPaid: 0, vatExclusive: 0, vatAmount: 0, invoiceNumber: "", remarks: "",
    merchantFee: 0, withholdingTax: 0, netCollection: 0, isReservation: false,
    hmo: "", hmoAccountNumber: "", loaNumber: "", loeNumber: "", teeth: "", hmoBilled: 0, hmoParts: [],
  };
  const sum = (rows: unknown[]) =>
    summarizeDayEnd({ branchName: "x", date: "2026-11-11", rows } as never);
  const col = (s: ReturnType<typeof sum>, label: string) =>
    s.breakdown.find((b) => b.label === label)?.amount;

  // --- pure ---
  const hmoOnly = sum([
    { ...base, kind: "hmo", paymentType: "Maxicare", amountPaid: 1300, netCollection: 1300, hmo: "Maxicare", hmoBilled: 1300, hmoParts: [{ name: "Maxicare", amount: 1300 }] },
  ]);
  check("HMO-only visit: amount in the Maxicare column", col(hmoOnly, "Maxicare") === 1300, hmoOnly.breakdown);
  check("HMO-only visit: counted in HMO, collected and net", hmoOnly.totals.hmo === 1300 && hmoOnly.totals.collected === 1300 && hmoOnly.totals.netCollection === 1300, hmoOnly.totals);
  check("HMO-only visit is not 'without payment'", hmoOnly.totals.visitsWithoutPayment === 0 && hmoOnly.totals.paymentCount === 0, hmoOnly.totals);
  check("HMO-only visit: no cash in hand", hmoOnly.totals.collectedWithoutHmo === 0);

  const mixed = sum([
    { ...base, kind: "payment", paymentType: "Cash", amountPaid: 500, netCollection: 500, hmo: "Maxicare", hmoBilled: 800, hmoParts: [{ name: "Maxicare", amount: 800 }] },
  ]);
  check("cash co-pay + HMO share: both columns", col(mixed, "Cash") === 500 && col(mixed, "Maxicare") === 800, mixed.breakdown);
  check("cash co-pay + HMO share: total 1300, cash in hand 500", mixed.totals.collected === 1300 && mixed.totals.collectedWithoutHmo === 500 && mixed.totals.hmo === 800, mixed.totals);

  const twoHmos = sum([
    { ...base, kind: "hmo", paymentType: "Maxicare / Elite Dental Network", amountPaid: 1000, hmo: "Maxicare / Elite Dental Network", hmoBilled: 1000, hmoParts: [{ name: "Maxicare", amount: 600 }, { name: "Elite Dental Network", amount: 400 }] },
  ]);
  check("two HMOs on one visit are split by company (Elite column)", col(twoHmos, "Maxicare") === 600 && col(twoHmos, "Elite") === 400 && twoHmos.totals.collected === 1000, twoHmos.breakdown);

  const paidLater = sum([
    { ...base, kind: "payment", paymentType: "Intellicare", amountPaid: 800, netCollection: 800, hmo: "Intellicare", hmoBilled: 800, hmoParts: [{ name: "Intellicare", amount: 800 }] },
  ]);
  check("HMO-typed payment counted once (not payment + billed)", col(paidLater, "Intellicare") === 800 && paidLater.totals.collected === 800 && paidLater.totals.hmo === 800, paidLater.totals);

  const legacy = sum([{ ...base, kind: "payment", paymentType: "Maxicare", amountPaid: 500, netCollection: 500 }]);
  check("HMO-typed payment on a visit with no HMO lines still counts", col(legacy, "Maxicare") === 500 && legacy.totals.hmo === 500 && legacy.totals.collected === 500, legacy.totals);

  const cash = sum([{ ...base, kind: "payment", paymentType: "Cash", amountPaid: 900, netCollection: 900 }, { ...base, kind: "unpaid" }]);
  check("cash visits unchanged; unpaid still counted", cash.totals.collected === 900 && cash.totals.visitsWithoutPayment === 1 && cash.totals.hmo === 0, cash.totals);

  // --- database ---
  const r1 = await getDayEndReport({ branchId: null, date: "2026-11-06" });
  const hmoRows = r1.rows.filter((r) => r.kind === "hmo");
  check("db: HMO visits with no payment are 'hmo' rows carrying the amount", hmoRows.length === 4 && hmoRows.every((r) => r.amountPaid === 1300 && r.netCollection === 1300 && r.hmoBilled === 1300 && r.paymentType === r.hmo), hmoRows.map((r) => [r.kind, r.paymentType, r.amountPaid]));
  const s1 = summarizeDayEnd(r1);
  check("db: Maxicare and Intellicare columns have values", col(s1, "Maxicare") === 2600 && col(s1, "Intellicare") === 2600, s1.breakdown);
  check("db: HMO total = HMO billed, counted once", s1.totals.hmo === 5200 && s1.totals.hmoBilled === 5200 && s1.totals.collected === 5200, s1.totals);
  check("db: visits with no lines/HMO stay 'without payment'", s1.totals.visitsWithoutPayment === r1.rows.filter((r) => r.kind === "unpaid").length);
  const csv = toCsv(buildDayEndSheet(r1).rows);
  check("csv: Maxicare row shows the amount and 'Billed to the HMO'", /Maxicare,1300\.00,.*Billed to the HMO/.test(csv) && !/No payment recorded.*Maxicare/.test(csv), csv.slice(0, 600));

  // An HMO payment on the visit's own day must not double the amount.
  const found = (await db.execute(sql`select invoice_id as id from transactions where visit_id='20261106-001' limit 1`)) as unknown as { rows?: Array<{ id: string }> } & Array<{ id: string }>;
  const invId = (found.rows ?? found)[0]?.id;
  check("db: found the test visit", Boolean(invId));
  const inserted: string[] = [];
  try {
    const pay = async (paidAt: string) => {
      const res = (await db.execute(sql`insert into payments (invoice_id, amount, payment_type, paid_at, notes) values (${invId}::uuid, 1300, 'Maxicare', ${paidAt}::timestamptz, 'ZZ day-end hmo test') returning id`)) as unknown as { rows?: Array<{ id: string }> } & Array<{ id: string }>;
      inserted.push((res.rows ?? res)[0].id);
    };
    await pay("2026-11-06T10:00:00+08:00");
    const r2 = await getDayEndReport({ branchId: null, date: "2026-11-06" });
    const s2 = summarizeDayEnd(r2);
    const payRow = r2.rows.find((r) => r.visitId === "20261106-001");
    check("db: HMO paid the same day -> a payment row, no longer 'hmo' row", payRow?.kind === "payment" && payRow.hmoParts.length === 1 && payRow.hmoParts[0].amount === 1300, payRow);
    check("db: …and the amount is still counted once", s2.totals.hmo === 5200 && col(s2, "Maxicare") === 2600 && s2.totals.collected === 5200, s2.totals);

    // The HMO pays a week later: that day's report shows what was received.
    await pay("2026-11-13T09:30:00+08:00");
    const r3 = await getDayEndReport({ branchId: null, date: "2026-11-13" });
    const s3 = summarizeDayEnd(r3);
    check("db: HMO paying later shows the amount received that day", col(s3, "Maxicare") === 1300 && s3.totals.hmo === 1300 && s3.totals.collected === 1300, s3.totals);
  } finally {
    for (const id of inserted) await db.execute(sql`delete from payments where id = ${id}::uuid`);
  }
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
