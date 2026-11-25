import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local", override: true });

// v0.10.0: commission base (merchant fee added back), HMO lines without an
// HMO rate, Ortho/RCM/Loss Bracket on the full amount, recalculation after a
// rate change (checked visits included), the Rate column text, the audit
// trail's paging and search, and the Cleared-editing privilege default.
async function main() {
  const { sql, eq, and } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db/client");
  const { transactions, invoices, commissionTierRates, procedures, auditLog } = await import("../src/lib/db/schema");
  const pricing = await import("../src/lib/cashflow/pricing");
  const calc = await import("../src/lib/cashflow/commission-calc");
  const inv = await import("../src/lib/db/invoices");
  const { listLinesForInvoice } = inv;
  const recalc = await import("../src/lib/db/commission-recalc");
  const tiers = await import("../src/lib/db/commission-tiers");
  const { getCommissionReport } = await import("../src/lib/db/commission-report");
  const reportLib = await import("../src/lib/cashflow/commission-report");
  const audit = await import("../src/lib/db/audit");
  const { roleDefaults } = await import("../src/lib/auth/permissions");

  let fails = 0;
  const check = (name: string, ok: boolean, extra?: unknown) => {
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`);
  };
  const near = (a: number | undefined, b: number) => Math.abs((a ?? NaN) - b) < 0.006;

  // ---------------------------------------------------------------- pure
  check("base: price less discount", pricing.commissionAmountBase({ amountPaid: 1000 }) === 1000);
  check("base: withholding tax still taken off", pricing.commissionAmountBase({ amountPaid: 1000, withholdingTax: 20 }) === 980);
  check("base: never negative", pricing.commissionAmountBase({ amountPaid: 10, withholdingTax: 20 }) === 0);
  for (const name of ["Consultation", "Oral Prophylaxis (MILD)", "oral prophylaxis (pedia)", "Temporary Filling", "Permanent Filling (Posterior)", "Permanent Filling - Per Surface (Voco)", "Simple Tooth Extraction"]) {
    check(`Non-VAT (full amount): ${name}`, pricing.commissionBase(1120, { procedureName: name, vatType: "vat" }) === 1120);
  }
  for (const name of ["Ortho Adj", "RCM", "Lost Bracket", "TMJ Consultation", "Complicated Tooth Extraction w/ suture (silk)", "Calcimol", "Flouride Varnish", "Ortho Removal w/ OP", "Bite Raiser per arch", ""]) {
    check(`VAT taken out (₱1,120 -> ₱1,000): ${name || "(blank)"}`, pricing.commissionBase(1120, { procedureName: name, vatType: "non_vat" }) === 1000);
  }
  check("PWD/Senior line (VAT-exempt): amount as charged", pricing.commissionBase(800, { procedureName: "Ortho Adj", vatType: "vat_exempt" }) === 800);
  check("PWD/Senior by discount reason: amount as charged", pricing.commissionBase(800, { procedureName: "Ortho Adj", vatType: "vat", discountReason: "Senior Citizen" }) === 800);
  check("promo discount: VAT still taken out", pricing.commissionBase(1120, { procedureName: "Ortho Adj", vatType: "vat", discountReason: "Promo" }) === 1000);
  const tier10 = { ratePercent: 10, hmoRatePercent: null, hmoPesoValue: null, pesoValue: null };
  const tier20 = { ratePercent: 20, hmoRatePercent: null, hmoPesoValue: null, pesoValue: null };
  check("GHL card: Ortho Adj ₱1,000 at 20% = ₱178.57 ((1,000 − VAT) × 20%, fee not taken off)", pricing.computeCommission(pricing.commissionAmountBase({ amountPaid: 1000 }), "POS (GHL) - CREDIT", tier20, { procedureName: "Ortho Adj", vatType: "non_vat" }) === 178.57);
  check("RCM ₱486 at 20% = ₱86.79", pricing.computeCommission(486, "POS (GHL) - CREDIT", tier20, { procedureName: "RCM", vatType: "non_vat" }) === 86.79);
  check("PF (Non-VAT) ₱250 cash at 10% = ₱25.00 (no VAT to take out)", pricing.computeCommission(250, "Cash", tier10, { procedureName: "Permanent Filling (Posterior)", vatType: "non_vat" }) === 25);
  check("VAT procedure ₱24,300 at 20% = ₱4,339.29 (VAT taken out)", pricing.computeCommission(24300, "POS (GHL) - DEBIT", tier20, { procedureName: "Ortho Package (Complex Case)", vatType: "vat" }) === 4339.29);
  check("HMO with no HMO rate uses the regular %: PF ₱700 Maxicare = ₱70", pricing.computeCommission(700, "Maxicare", tier10, { procedureName: "Permanent Filling (Posterior)", vatType: "non_vat" }) === 70);
  check("HMO rate wins when set", pricing.computeCommission(700, "Maxicare", { ...tier10, hmoRatePercent: 5 }, { procedureName: "Permanent Filling (Posterior)", vatType: "non_vat" }) === 35);
  check("HMO 0% set on purpose stays 0", pricing.computeCommission(700, "Maxicare", { ...tier10, hmoRatePercent: 0 }, { procedureName: "Permanent Filling (Posterior)", vatType: "non_vat" }) === 0);
  check("HMO peso value is a flat amount", pricing.computeCommission(250, "Medicard", { ratePercent: 0, hmoRatePercent: null, hmoPesoValue: 250 }, { procedureName: "Temporary Filling" }) === 250);
  check("no rate at all = 0", pricing.computeCommission(700, "Maxicare", undefined, { procedureName: "PF" }) === 0);
  check("X-ray flat peso on HMO", pricing.computeCommission(500, "Maxicare", { ratePercent: 0, hmoRatePercent: null, hmoPesoValue: null, pesoValue: 70 }, { procedureName: "Panoramic Xray" }) === 70);

  const d = (amount: number, pay: string, rate: Parameters<typeof pricing.computeCommissionDetail>[2], name: string) =>
    pricing.describeCommissionDetail(pricing.computeCommissionDetail(amount, pay, rate, { procedureName: name }), pay);
  check("Rate text: peso HMO shows pesos, not 112%", d(250, "Medicard", { ratePercent: 0, hmoRatePercent: null, hmoPesoValue: 250 }, "Temporary Filling") === "₱250 (HMO)", d(250, "Medicard", { ratePercent: 0, hmoRatePercent: null, hmoPesoValue: 250 }, "Temporary Filling"));
  check("Rate text: HMO falling back to the regular %", d(700, "Maxicare", tier10, "PF") === "10% (HMO)");
  check("Rate text: cash %", d(700, "Cash", tier20, "Ortho Adj") === "20%");
  check("Rate text: no rate = blank", d(700, "Cash", undefined, "PF") === "");
  check("report Rate column: blank label = 'No rate set'", reportLib.rateText({ date: "", visitId: "", patientName: "", dentist: "", branchName: "", procedure: "", paymentType: "", netCollection: 1, commission: 0, rateLabel: "" }) === reportLib.NO_RATE_TEXT);

  const maps = {
    individual: new Map([["D1:P2", { ratePercent: 30, hmoRatePercent: null, hmoPesoValue: null }]]),
    tier: new Map([["1:P1", tier10], ["1:P2", tier20]]),
    dentistTier: new Map([["D1", 1], ["D2", 1]]),
  };
  const line = { dentistUserId: "D1", procedureId: "P1", procedure: "PF", paymentType: "Cash", amountPaid: 1120, vatType: "vat" };
  check("line: tier rate", calc.commissionForLine(line, maps).main === 100);
  check("line: own rate wins over the tier", calc.commissionForLine({ ...line, procedureId: "P2" }, maps).main === 300);
  const tr = calc.commissionForLine({ ...line, transferDentistUserId: "D2" }, maps);
  check("line: transferred = 50/50 at the main dentist's rate", tr.main === 50 && tr.transfer === 50 && tr.total === 100, tr);
  check("line: no dentist = nothing", calc.commissionForLine({ ...line, dentistUserId: null }, maps).total === 0);
  check("line: second procedure is rated exactly like the first", calc.commissionForLine({ ...line, procedure: "PF 2" }, maps).main === 100);

  check("price list VAT rule: basic procedures Non-VAT", ["Consultation", "Oral Prophylaxis (SEVERE)", "Temporary Filling", "Permanent Filling (Anterior)", "Simple Tooth Extraction"].every((n) => pricing.procedureVatType(n) === "non_vat"));
  check("price list VAT rule: everything else VAT", ["Ortho Adj", "RCM", "Lost Bracket", "Calcimol", "Reservation Fee", "TMJ Consultation", "Periapical Xray", "Complicated Tooth Extraction w/ suture (silk)"].every((n) => pricing.procedureVatType(n) === "vat"));
  check("Edit Cleared transactions: admin and owner by default", roleDefaults("admin").includes("visit.edit_cleared") && roleDefaults("owner").includes("visit.edit_cleared"));
  check("Edit Cleared transactions: not staff or dentist by default", !roleDefaults("staff").includes("visit.edit_cleared") && !roleDefaults("dentist").includes("visit.edit_cleared"));

  // ------------------------------------------------------------ database
  const ctx = { userId: "1b14c8a2-1788-4dbc-97d6-d7629b68cf61", userName: "Test Runner", isAdmin: true, canEditCleared: true };
  const DENTIST = "Anna Beatrice Perez"; // tier 1, own rate: Temporary Filling 0% + ₱250 HMO
  const PATIENT = "ZZ Commission Rules";
  const ANT = "25c705b9-48f6-4631-a4a2-5d4e8afb3dcc";
  const lineOf = (procedure: string, unitPrice: number) => ({
    id: "", procedure, unitPrice, quantity: 1, teeth: "", discountTypeId: "", discountReason: "",
    discountMode: "" as const, discountValue: 0, vatType: "non_vat" as const, loaNumber: "",
  });
  const base = {
    date: "2026-11-05", invoiceNumber: "", patientName: PATIENT, transactionType: "Visit", visitType: "" as const,
    branchId: ANT, remarks: "", discountIdType: "", discountIdNumber: "", recallDate: "", recallReason: "", loeNumber: "",
    dentist: DENTIST, transferDentist: "",
  };
  const cleanup = async () => {
    const ids = await db.select({ id: invoices.id }).from(invoices).innerJoin(transactions, eq(transactions.invoiceId, invoices.id)).where(eq(transactions.patientName, PATIENT));
    for (const r of new Set(ids.map((x) => x.id))) await inv.deleteInvoice(r, ctx as never).catch(() => undefined);
    await db.execute(sql`delete from transactions where patient_name = ${PATIENT}`);
  };
  const [orthoAdj] = await db.select().from(procedures).where(eq(procedures.name, "Ortho Adj"));
  const [tier1Ortho] = await db.select().from(commissionTierRates).where(and(eq(commissionTierRates.tier, 1), eq(commissionTierRates.procedureId, orthoAdj.id)));
  const originalOrtho = tier1Ortho.ratePercent;
  await cleanup();
  try {
    // Two procedures on one HMO visit (the "second procedure has no commission" case).
    const hmo = await inv.createInvoice({
      ...base,
      lines: [lineOf("Oral Prophylaxis (MILD)", 250), lineOf("Permanent Filling (Posterior)", 700), lineOf("Consultation", 150)],
      payment: { amount: 0, paymentType: "Maxicare", referenceNo: "" },
    }, ctx);
    check("HMO visit with 3 procedures saved", hmo.ok, hmo);
    const hmoLines = await listLinesForInvoice((hmo as { invoiceId: string }).invoiceId);
    const by = (name: string) => hmoLines.find((l) => l.procedure === name);
    check("1st procedure (OP, Non-VAT, HMO 10%) = ₱25", near(by("Oral Prophylaxis (MILD)")?.commissionAmount, 25), by("Oral Prophylaxis (MILD)"));
    check("2nd procedure (PF, Non-VAT, no HMO rate -> tier 10%) = ₱70", near(by("Permanent Filling (Posterior)")?.commissionAmount, 70), by("Permanent Filling (Posterior)"));
    check("3rd procedure (Consultation, Non-VAT) = ₱15", near(by("Consultation")?.commissionAmount, 15), by("Consultation"));

    // Two procedures on a cash visit.
    const cash = await inv.createInvoice({
      ...base,
      lines: [lineOf("Permanent Filling (Posterior)", 1120), lineOf("Simple Tooth Extraction", 560)],
      payment: { amount: 1680, paymentType: "Cash", referenceNo: "" },
    }, ctx);
    const cashLines = await listLinesForInvoice((cash as { invoiceId: string }).invoiceId);
    check("cash visit: both Non-VAT procedures earn on the full amount (₱112 + ₱56)", cashLines.length === 2 && near(cashLines[0].commissionAmount, 112) && near(cashLines[1].commissionAmount, 56), cashLines.map((l) => [l.procedure, l.vatType, l.commissionAmount]));

    // Adding a procedure later (Edit transaction) is rated the same way.
    const cashId = (cash as { invoiceId: string }).invoiceId;
    const edited = await inv.updateInvoice(cashId, {
      ...base,
      lines: [
        { ...lineOf("Permanent Filling (Posterior)", 1120), id: cashLines[0].id },
        { ...lineOf("Simple Tooth Extraction", 560), id: cashLines[1].id },
        lineOf("Oral Prophylaxis (MILD)", 336),
      ],
      payment: undefined,
    }, ctx);
    const afterEdit = await listLinesForInvoice(cashId);
    check("edit: a 3rd procedure added later earns too (OP ₱336 = ₱33.60)", edited.ok && afterEdit.length === 3 && near(afterEdit.find((l) => l.procedure === "Oral Prophylaxis (MILD)")?.commissionAmount, 33.6), afterEdit.map((l) => [l.procedure, l.commissionAmount]));
    check("edit: the first two keep their commission", near(afterEdit.find((l) => l.procedure.startsWith("Permanent"))?.commissionAmount, 112) && near(afterEdit.find((l) => l.procedure.startsWith("Simple"))?.commissionAmount, 56));

    // A VAT procedure: VAT taken out before the rate.
    const vatVisit = await inv.createInvoice({
      ...base,
      lines: [lineOf("Bite Raiser per arch", 1120)],
      payment: { amount: 1120, paymentType: "Cash", referenceNo: "" },
    }, ctx);
    const [vatLine] = await listLinesForInvoice((vatVisit as { invoiceId: string }).invoiceId);
    check("VAT procedure: (₱1,120 − VAT) × 20% = ₱200", vatLine?.vatType === "vat" && near(vatLine.commissionAmount, 200), vatLine && [vatLine.vatType, vatLine.commissionAmount]);

    // GHL card: commission on the amount before the merchant fee.
    const card = await inv.createInvoice({
      ...base,
      lines: [lineOf("Ortho Adj", 1000), lineOf("RCM", 500)],
      payment: { amount: 1500, paymentType: "POS (GHL) - CREDIT", referenceNo: "" },
    }, ctx);
    check("card visit saved", card.ok, card);
    const cardId = (card as { invoiceId: string }).invoiceId;
    let cardLines = await listLinesForInvoice(cardId);
    const ortho = () => cardLines.find((l) => l.procedure === "Ortho Adj");
    const rcm = () => cardLines.find((l) => l.procedure === "RCM");
    console.log("ortho line", JSON.stringify({ net: ortho()?.netCollection, fee: ortho()?.merchantFee, c: ortho()?.commissionAmount }));
    check("GHL: net collection still has the fee taken off", (ortho()?.merchantFee ?? 0) > 0 && near(ortho()?.netCollection, 1000 - (ortho()?.merchantFee ?? 0)), ortho());
    check("GHL: Ortho Adj (VAT) on ₱1,000 less VAT at 20% = ₱178.57 (fee not taken off)", near(ortho()?.commissionAmount, 178.57), ortho());
    check("GHL: RCM (VAT) ₱500 less VAT at 20% = ₱89.29", near(rcm()?.commissionAmount, 89.29), rcm());
    check("new lines follow the VAT rule: Ortho Adj and RCM saved as VAT (price list says Non-VAT)", ortho()?.vatType === "vat" && rcm()?.vatType === "vat" && (ortho()?.vatAmount ?? 0) > 0, [ortho()?.vatType, rcm()?.vatType, ortho()?.vatAmount]);
    check("new lines follow the VAT rule: basic procedures saved as Non-VAT", hmoLines.every((l) => l.vatType === "non_vat"), hmoLines.map((l) => l.vatType));

    // Perez's own Temporary Filling override (₱250 HMO): flat ₱250, shown as pesos.
    const tf = await inv.createInvoice({
      ...base,
      lines: [lineOf("Temporary Filling", 250)],
      payment: { amount: 0, paymentType: "Medicard", referenceNo: "" },
    }, ctx);
    const [tfLine] = await listLinesForInvoice((tf as { invoiceId: string }).invoiceId);
    check("own HMO peso override: ₱250 flat", near(tfLine.commissionAmount, 250), tfLine);
    const rep = await getCommissionReport({ from: "2026-11-05", to: "2026-11-05", branchId: null, dentistUserId: null, branchName: "", dentistLabel: "", sort: "date", dir: "asc" });
    const mine = rep.rows.filter((r) => r.patientName === PATIENT);
    const tfRow = mine.find((r) => r.procedure === "Temporary Filling");
    check("report Rate column: '₱250 (HMO)', not '112% (HMO)'", reportLib.rateText(tfRow!) === "₱250 (HMO)", tfRow);
    check("report Rate column: PF on HMO shows '10% (HMO)'", reportLib.rateText(mine.find((r) => r.procedure === "Permanent Filling (Posterior)")!) === "10% (HMO)");
    check("report Rate column: Ortho Adj '20%'", reportLib.rateText(mine.find((r) => r.procedure === "Ortho Adj")!) === "20%");

    // Check (lock) the card visit, then change the tier rate: it is recalculated anyway.
    await db.execute(sql`insert into transaction_checks (transaction_id, checked_by_name) select id, 'Test' from transactions where invoice_id = ${cardId} on conflict do nothing`);
    await tiers.setTierRate(1, orthoAdj.id, { ratePercent: 15, hmoRatePercent: null, pesoValue: null, hmoPesoValue: null });
    const r1 = await recalc.recalculateCommissions({ procedureIds: [orthoAdj.id] });
    cardLines = await listLinesForInvoice(cardId);
    check("rate change: checked visit recalculated too (₱178.57 -> ₱133.93)", near(ortho()?.commissionAmount, 133.93), ortho());
    check("rate change: other procedures untouched (RCM still ₱89.29)", near(rcm()?.commissionAmount, 89.29), rcm());
    check("rate change: result counts the change", r1.changed >= 1 && r1.difference <= -44, r1);
    await db.execute(sql`update transactions set commission_amount = 1 where invoice_id = ${cardId} and procedure = 'Ortho Adj'`);
    const dry = await recalc.recalculateCommissions({ procedureIds: [orthoAdj.id] }, { dryRun: true });
    const [afterDry] = await db.select().from(transactions).where(and(eq(transactions.invoiceId, cardId), eq(transactions.procedure, "Ortho Adj")));
    check("dry run reports the change but saves nothing", dry.changed >= 1 && dry.samples.length >= 1 && Number(afterDry.commissionAmount) === 1, { dry: dry.changed, c: afterDry.commissionAmount });
    await recalc.recalculateCommissions({ procedureIds: [orthoAdj.id] });
    const r2 = await recalc.recalculateCommissions({ procedureIds: [orthoAdj.id] });
    check("recalculating again changes nothing", r2.changed === 0, r2);
    check("empty scope does nothing", (await recalc.recalculateCommissions({ procedureIds: [] })).lines === 0);

    // A line saved before its procedure was on the price list gets linked.
    const tfId = tfLine.id;
    await db.execute(sql`update transactions set procedure_id = null, commission_amount = 0 where id = ${tfId}`);
    const r3 = await recalc.recalculateCommissions({ dentistUserIds: [tfLine.dentistUserId!] });
    const [relinked] = await db.select().from(transactions).where(eq(transactions.id, tfId));
    check("recalc links an unlinked line by name and prices it", !!relinked.procedureId && Number(relinked.commissionAmount) === 250 && r3.linked >= 1, { pid: relinked.procedureId, c: relinked.commissionAmount, r3 });

    // A line saved before the dentist had an account gets linked by name.
    await db.execute(sql`update transactions set dentist_user_id = null, commission_amount = 0 where id = ${tfId}`);
    const r4 = await recalc.recalculateCommissions({});
    const [relinked2] = await db.select().from(transactions).where(eq(transactions.id, tfId));
    check("recalc links an unlinked dentist by name and prices the line", relinked2.dentistUserId === tfLine.dentistUserId && Number(relinked2.commissionAmount) === 250 && r4.linked >= 1, { d: relinked2.dentistUserId, c: relinked2.commissionAmount, r4 });

    // Audit page: paging and search.
    const marker = `zzaudit${Date.now()}`;
    for (let i = 0; i < 7; i++) {
      await audit.logAudit({ action: "commission.tier_rate_set", entityType: "commission", summary: `Test ${marker} entry ${["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf"][i]}`, changes: [{ field: `Ortho Adj · Tier 1 ${marker}`, from: "20%", to: "15%" }], actor: { userId: null, name: "Test Runner" } });
    }
    const p1 = await audit.listAuditPage({ q: marker, page: 1, pageSize: 5 });
    const p2 = await audit.listAuditPage({ q: marker, page: 2, pageSize: 5 });
    check("audit search: total counts every match", p1.total === 7, p1.total);
    check("audit paging: 5 then 2, no overlap", p1.entries.length === 5 && p2.entries.length === 2 && !p2.entries.some((e) => p1.entries.some((f) => f.id === e.id)));
    check("audit paging: newest first", p1.entries[0].summary.endsWith("entry golf"), p1.entries[0].summary);
    const g = await audit.listAuditPage({ group: "commission", q: marker, page: 1, pageSize: 50 });
    check("audit group 'commission' filter", g.total === 7);
    const gv = await audit.listAuditPage({ group: "visit", q: marker, page: 1, pageSize: 50 });
    check("audit group 'visit' excludes them", gv.total === 0);
    const words = await audit.listAuditPage({ q: `${marker} delta`, page: 1, pageSize: 50 });
    check("audit search: several words narrow it down", words.total === 1, words.total);
    const inDetails = await audit.listAuditPage({ q: `Tier 1 ${marker}`, page: 1, pageSize: 50 });
    check("audit search looks inside the changed fields", inDetails.total === 7, inDetails.total);
    const odd = await audit.listAuditPage({ q: "100%_x", page: 1, pageSize: 5 });
    check("audit search: % and _ typed are not wildcards", odd.total === 0, odd.total);
    await db.delete(auditLog).where(sql`${auditLog.summary} like ${`%${marker}%`}`);
  } finally {
    await db.update(commissionTierRates).set({ ratePercent: originalOrtho }).where(eq(commissionTierRates.id, tier1Ortho.id));
    await cleanup();
  }

  console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
