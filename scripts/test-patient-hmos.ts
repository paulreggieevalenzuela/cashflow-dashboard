import { config } from "dotenv";
config({ path: ".env.local", override: true });

// Patients can have several HMOs, each with a company name and account number.
async function main() {
  const { sql, eq } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db/client");
  const { patients } = await import("../src/lib/db/schema");
  const h = await import("../src/lib/cashflow/patient-hmo");
  const store = await import("../src/lib/db/patient-hmos");
  const admin = await import("../src/lib/db/patient-admin");
  const { getHmoBillingLines } = await import("../src/lib/db/hmo-billing");

  let fails = 0;
  const check = (name: string, ok: boolean, extra?: unknown) => {
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`);
  };
  const J = (value: unknown) =>
    JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
        : v,
    );

  // --- pure ---
  check("hmoKey ignores capitals and spaces", h.hmoKey("  Elite   Dental Network ") === "elite dental network");
  const ok1 = h.cleanHmoList([
    { company: "  Maxicare ", employer: "", accountNumber: " MX-1 " },
    { company: "", employer: "", accountNumber: "" },
    { company: "Medicard", employer: "", accountNumber: "" },
  ]);
  check("clean: trims, drops empty rows, keeps order", ok1.ok && J(ok1.list) === J([{ company: "Maxicare", employer: "", accountNumber: "MX-1" }, { company: "Medicard", employer: "", accountNumber: "" }]), ok1);
  check("clean: undefined = empty list", J(h.cleanHmoList(undefined)) === J({ ok: true, list: [] }));
  check("clean: not an array is refused", !h.cleanHmoList("x").ok);
  const noCompany = h.cleanHmoList([{ company: "", employer: "", accountNumber: "A-1" }]);
  check("clean: account number needs a company", !noCompany.ok && /HMO name/.test((noCompany as { message: string }).message), noCompany);
  const dup = h.cleanHmoList([{ company: "Maxicare", employer: "", accountNumber: "1" }, { company: " maxicare ", employer: "", accountNumber: "2" }]);
  check("clean: same company twice refused (capitals ignored)", !dup.ok, dup);
  const many = h.cleanHmoList(Array.from({ length: 11 }, (_, i) => ({ company: `HMO ${i}`, accountNumber: "" })));
  check("clean: more than 10 refused", !many.ok, many);
  check("clean: exactly 10 ok", h.cleanHmoList(Array.from({ length: 10 }, (_, i) => ({ company: `HMO ${i}`, accountNumber: "" }))).ok);
  check("legacyHmoList", J(h.legacyHmoList(" Maxicare ", "M1")) === J([{ company: "Maxicare", employer: "", accountNumber: "M1" }]) && h.legacyHmoList("", "x").length === 0);
  const list = [{ company: "Maxicare", employer: "", accountNumber: "MX-1" }, { company: "Medicard", employer: "", accountNumber: "MD-2" }];
  check("accountNumberFor: matching company", h.accountNumberFor(list, "medicard", "OLD") === "MD-2");
  check("accountNumberFor: list without that company -> blank", h.accountNumberFor(list, "Avega", "OLD") === "");
  check("accountNumberFor: empty list -> legacy", h.accountNumberFor([], "Avega", "OLD") === "OLD");

  // --- database ---
  await db.execute(sql`delete from patients where full_name like 'ZHMO %'`);
  await db.execute(sql`delete from invoice_hmo_details where invoice_id = '2af5eb24-12b3-4fb5-8cc0-0ee737fe2cce'`);
  const rows = async (id: string) =>
    (await db.execute(sql`select company, account_number, position from patient_hmos where patient_id = ${id} order by position`)) as unknown as Array<{ company: string; account_number: string }> & { rows?: Array<{ company: string; account_number: string }> };
  const legacy = async (id: string) => {
    const [p] = await db.select({ c: patients.hmoCompany, a: patients.hmoAccountNumber }).from(patients).where(eq(patients.id, id));
    return `${p.c}|${p.a}`;
  };
  const base = { contactNumber: "0917", notes: "", birthDate: "" };

  check("table is ready", (await store.patientHmosReady()) === true);

  const created = await admin.createPatient({ ...base, fullName: "ZHMO Alpha", hmoCompany: "Maxicare", hmoAccountNumber: "MX-A1", hmos: [{ company: "Maxicare", employer: "", accountNumber: "MX-A1" }, { company: "Medicard", employer: "", accountNumber: "MD-A2" }] });
  if (!created.ok) throw new Error("create failed");
  const id = created.id;
  let p = await admin.getPatientProfile(id);
  check("profile: both HMOs, in order", J(p?.patient.hmos) === J([{ company: "Maxicare", employer: "", accountNumber: "MX-A1" }, { company: "Medicard", employer: "", accountNumber: "MD-A2" }]), p?.patient.hmos);
  check("profile: list is ready", p?.patient.hmoListReady === true);
  check("legacy columns mirror the first HMO", (await legacy(id)) === "Maxicare|MX-A1", await legacy(id));

  // reorder + edit + remove
  await admin.updatePatient(id, { ...base, fullName: "ZHMO Alpha", hmoCompany: "Medicard", hmoAccountNumber: "MD-A9", hmos: [{ company: "Medicard", employer: "", accountNumber: "MD-A9" }, { company: "Avega", employer: "", accountNumber: "AV-1" }] });
  p = await admin.getPatientProfile(id);
  check("update: new order, edited number, removed Maxicare, added Avega", J(p?.patient.hmos) === J([{ company: "Medicard", employer: "", accountNumber: "MD-A9" }, { company: "Avega", employer: "", accountNumber: "AV-1" }]), p?.patient.hmos);
  check("update: legacy now Medicard", (await legacy(id)) === "Medicard|MD-A9", await legacy(id));
  const stored = (await rows(id)); const n = (stored.rows ?? stored).length;
  check("update: exactly two rows stored", n === 2, n);

  // update without hmos leaves the list alone
  await admin.updatePatient(id, { ...base, fullName: "ZHMO Alpha", contactNumber: "0999", hmoCompany: "Medicard", hmoAccountNumber: "MD-A9" });
  p = await admin.getPatientProfile(id);
  check("update without hmos keeps the list", p?.patient.hmos.length === 2, p?.patient.hmos);

  // search by 2nd HMO account number and company
  const bySecond = await admin.listPatientsPage({ q: "AV-1", filter: "all", page: 1, today: "2026-11-12" });
  check("search finds the patient by their second HMO's account number", bySecond.rows.some((r) => r.id === id), bySecond.rows.map((r) => r.fullName));
  const byCompany = await admin.listPatientsPage({ q: "avega", filter: "all", page: 1, today: "2026-11-12" });
  check("search finds the patient by HMO company", byCompany.rows.some((r) => r.id === id));

  // clearing the list clears legacy
  await admin.updatePatient(id, { ...base, fullName: "ZHMO Alpha", hmoCompany: "", hmoAccountNumber: "", hmos: [] });
  p = await admin.getPatientProfile(id);
  check("empty list: no HMOs, legacy cleared", p?.patient.hmos.length === 0 && (await legacy(id)) === "|", [p?.patient.hmos, await legacy(id)]);

  // legacy-only patient (no list rows): profile still shows the legacy HMO
  await db.update(patients).set({ hmoCompany: "Intellicare", hmoAccountNumber: "IC-7" }).where(eq(patients.id, id));
  p = await admin.getPatientProfile(id);
  check("legacy-only patient shows their single HMO", J(p?.patient.hmos) === J([{ company: "Intellicare", employer: "", accountNumber: "IC-7" }]), p?.patient.hmos);

  // merge
  const t = await admin.createPatient({ ...base, fullName: "ZHMO Target", hmoCompany: "Maxicare", hmoAccountNumber: "MX-T", hmos: [{ company: "Maxicare", employer: "", accountNumber: "MX-T" }] });
  const s = await admin.createPatient({ ...base, fullName: "ZHMO Source", hmoCompany: "Maxicare", hmoAccountNumber: "MX-S", hmos: [{ company: "maxicare", employer: "", accountNumber: "MX-S" }, { company: "Valucare", employer: "", accountNumber: "VC-S" }] });
  if (!t.ok || !s.ok) throw new Error("create failed");
  const merged = await admin.mergePatients(s.id, t.id);
  check("merge ok", merged.ok, merged);
  const tp = await admin.getPatientProfile(t.id);
  check("merge: target's own Maxicare number stays, Valucare added", J(tp?.patient.hmos) === J([{ company: "Maxicare", employer: "", accountNumber: "MX-T" }, { company: "Valucare", employer: "", accountNumber: "VC-S" }]), tp?.patient.hmos);
  const left = await db.execute(sql`select count(*)::int as n from patient_hmos where patient_id = ${s.id}`) as unknown as Array<{ n: number }> & { rows?: Array<{ n: number }> };
  check("merge: removed patient's rows are gone", (left.rows ?? left)[0].n === 0, left);

  // HMO billing uses the account of the line's own HMO
  const ana = (await db.execute(sql`select id from patients where full_name = 'HMOTEST Ana Cruz'`)) as unknown as Array<{ id: string }> & { rows?: Array<{ id: string }> };
  const anaId = (ana.rows ?? ana)[0]?.id;
  if (anaId) {
    await admin.updatePatient(anaId, { ...base, fullName: "HMOTEST Ana Cruz", contactNumber: "", hmoCompany: "Medicard", hmoAccountNumber: "MD-9", hmos: [{ company: "Medicard", employer: "", accountNumber: "MD-9" }, { company: "Maxicare", employer: "", accountNumber: "MX-1001" }] });
    const lines = await getHmoBillingLines({ from: "2026-11-01", to: "2026-11-30", branchId: null, hmo: "Maxicare" });
    const anaLines = lines.filter((l) => l.transactionId.startsWith("T-HMO-1"));
    check("billing: Maxicare line shows Maxicare's number, not the first HMO's", anaLines.length > 0 && anaLines.every((l) => l.hmoAccountNumber === "MX-1001"), anaLines.map((l) => l.hmoAccountNumber));
    await admin.updatePatient(anaId, { ...base, fullName: "HMOTEST Ana Cruz", contactNumber: "", hmoCompany: "Medicard", hmoAccountNumber: "MD-9", hmos: [{ company: "Medicard", employer: "", accountNumber: "MD-9" }] });
    const noEntry = await getHmoBillingLines({ from: "2026-11-01", to: "2026-11-30", branchId: null, hmo: "Maxicare" });
    check("billing: no Maxicare entry -> blank, not another HMO's number", noEntry.filter((l) => l.transactionId.startsWith("T-HMO-1")).every((l) => l.hmoAccountNumber === ""), noEntry.map((l) => l.hmoAccountNumber));
    await admin.updatePatient(anaId, { ...base, fullName: "HMOTEST Ana Cruz", contactNumber: "", hmoCompany: "Maxicare", hmoAccountNumber: "MX-1001", hmos: [{ company: "Maxicare", employer: "", accountNumber: "MX-1001" }] });
  } else {
    console.log("(skipped billing checks: no HMOTEST Ana Cruz)");
  }

  // ===== v0.9.0: the patient's company, and details typed on the visit =====
  const e1 = h.cleanHmoList([{ company: " Maxicare ", employer: "  Acme   Corp ", accountNumber: " M1 " }]);
  check("clean: employer trimmed", e1.ok && e1.list[0].employer.startsWith("Acme") && e1.list[0].employer === e1.list[0].employer.trim(), e1);
  const e2 = h.cleanHmoList([{ company: "", employer: "Acme", accountNumber: "" }]);
  check("clean: a company with no HMO name is refused", !e2.ok, e2);
  const e3 = h.cleanHmoList([{ company: "Maxicare", employer: "x".repeat(h.MAX_HMO_EMPLOYER_LENGTH + 1), accountNumber: "" }]);
  check("clean: employer too long is cut or refused, never stored over the limit", !e3.ok || e3.list[0].employer.length <= h.MAX_HMO_EMPLOYER_LENGTH, e3);
  const elist = [{ company: "Maxicare", employer: "Acme Corp", accountNumber: "MX-1" }, { company: "Medicard", employer: "", accountNumber: "MD-2" }];
  check("hmoDetailsFor: company and number of that HMO", J(h.hmoDetailsFor(elist, "maxicare", "OLD")) === J({ employer: "Acme Corp", accountNumber: "MX-1" }));
  check("hmoDetailsFor: other HMO -> blank both", J(h.hmoDetailsFor(elist, "Avega", "OLD")) === J({ employer: "", accountNumber: "" }));
  check("hmoDetailsFor: empty list -> legacy number, no company", J(h.hmoDetailsFor([], "Avega", "OLD")) === J({ employer: "", accountNumber: "OLD" }));
  const typed = { hmoName: "Maxicare", employer: "Visit Co", accountNumber: "VX-1" };
  check("resolve: visit-typed wins for the same HMO", J(h.resolveHmoDetails({ visit: typed, entries: elist, hmoName: "MAXICARE", legacyAccountNumber: "" })) === J({ employer: "Visit Co", accountNumber: "VX-1" }));
  check("resolve: visit typed for another HMO is ignored", J(h.resolveHmoDetails({ visit: { ...typed, hmoName: "Avega" }, entries: elist, hmoName: "Maxicare", legacyAccountNumber: "" })) === J({ employer: "Acme Corp", accountNumber: "MX-1" }));
  check("resolve: empty visit details fall back to the patient", J(h.resolveHmoDetails({ visit: { hmoName: "Maxicare", employer: "", accountNumber: "" }, entries: elist, hmoName: "Maxicare", legacyAccountNumber: "" })) === J({ employer: "Acme Corp", accountNumber: "MX-1" }));
  check("resolve: no visit, no entries -> legacy", J(h.resolveHmoDetails({ visit: undefined, entries: [], hmoName: "Maxicare", legacyAccountNumber: "L-1" })) === J({ employer: "", accountNumber: "L-1" }));

  const visitStore = await import("../src/lib/db/visit-hmo");
  const billingLib = await import("../src/lib/db/hmo-billing");
  const billingPure = await import("../src/lib/cashflow/hmo-billing");
  const { toCsv } = await import("../src/lib/cashflow/xlsx");
  const ANA_ID = "b96c2c35-07a3-4446-863e-8e5a6133a6d9";
  const INV = "2af5eb24-12b3-4fb5-8cc0-0ee737fe2cce"; // T-HMO-1a and 1b
  const MAR = "1625aea3-62c8-4740-9159-81d72a5fb666";
  const actor = { userId: "1b14c8a2-1788-4dbc-97d6-d7629b68cf61", name: "Test Runner" };
  const range = { from: "2026-11-01", to: "2026-11-09", branchId: MAR, hmo: "Maxicare" };
  const anaProfile = async () => (await admin.getPatientProfile(ANA_ID))?.patient.hmos;
  const lineOf = async (tid: string) => (await billingLib.getHmoBillingLines(range)).find((l) => l.transactionId === tid);
  await db.execute(sql`delete from hmo_billing_lines`);
  await db.execute(sql`delete from hmo_billings`);
  await db.execute(sql`delete from invoice_hmo_details where invoice_id = ${INV}`);
  const ana2 = { ...base, fullName: "HMOTEST Ana Cruz", contactNumber: "", hmoCompany: "Maxicare", hmoAccountNumber: "MX-1001" };

  // patient profile round-trip with employer
  await admin.updatePatient(ANA_ID, { ...ana2, hmos: [{ company: "Maxicare", employer: "Acme Corp", accountNumber: "MX-1001" }] });
  check("profile: company saved and read back", J(await anaProfile()) === J([{ company: "Maxicare", employer: "Acme Corp", accountNumber: "MX-1001" }]), await anaProfile());
  const byEmployer = await admin.listPatientsPage({ q: "acme corp", filter: "all", page: 1, today: "2026-11-12" });
  check("search finds the patient by their company", byEmployer.rows.some((r) => r.id === ANA_ID));

  // billing lines take the company from the patient
  const l1 = await lineOf("T-HMO-1a");
  check("billing: company and number from the patient's entry", l1?.hmoEmployer === "Acme Corp" && l1.hmoAccountNumber === "MX-1001", l1);

  // visit-typed details
  check("visit details saved", (await visitStore.saveVisitHmoDetails(INV, typed)) === true);
  check("visit details read back", J((await visitStore.getVisitHmoDetails([INV])).get(INV)) === J(typed));
  const l2 = await lineOf("T-HMO-1a"), l2b = await lineOf("T-HMO-1b"), l3 = await lineOf("T-HMO-3a");
  check("billing: visit-typed details win on that visit's lines", l2?.hmoEmployer === "Visit Co" && l2.hmoAccountNumber === "VX-1" && l2b?.hmoEmployer === "Visit Co", [l2, l2b]);
  check("billing: other visits still use the patient's entry", l3?.hmoEmployer === "Acme Corp" && l3.hmoAccountNumber === "MX-1001", l3);
  await visitStore.saveVisitHmoDetails(INV, { ...typed, hmoName: "Medicard" });
  check("billing: details typed for another HMO are ignored", (await lineOf("T-HMO-1a"))?.hmoEmployer === "Acme Corp");
  await visitStore.saveVisitHmoDetails(INV, typed);

  const offered = await visitStore.resolveVisitHmoDetails({ invoiceId: INV, patientId: ANA_ID, hmoName: "Maxicare" });
  check("form prefill: the visit's own details", J(offered) === J({ employer: "Visit Co", accountNumber: "VX-1" }), offered);
  const offeredNew = await visitStore.resolveVisitHmoDetails({ patientId: ANA_ID, hmoName: "Maxicare" });
  check("form prefill: new visit gets the patient's entry", J(offeredNew) === J({ employer: "Acme Corp", accountNumber: "MX-1001" }), offeredNew);
  const offeredOther = await visitStore.resolveVisitHmoDetails({ patientId: ANA_ID, hmoName: "Avega" });
  check("form prefill: HMO the patient lacks -> blank", J(offeredOther) === J({ employer: "", accountNumber: "" }), offeredOther);

  // a saved billing keeps its own copy
  const made = await billingLib.createHmoBilling({ ...range, actor });
  if (!made.ok) throw new Error("billing failed: " + made.message);
  let saved = await billingLib.getHmoBilling(made.billing.id);
  const snap = (id: string) => saved?.lines.find((l) => l.transactionId === id)?.hmoEmployer;
  check("saved billing: company per line as it was", snap("T-HMO-1a") === "Visit Co" && snap("T-HMO-3a") === "Acme Corp", saved?.lines.map((l) => [l.transactionId, l.hmoEmployer]));
  await visitStore.saveVisitHmoDetails(INV, { ...typed, employer: "Changed Later" });
  await admin.updatePatient(ANA_ID, { ...ana2, hmos: [{ company: "Maxicare", employer: "Another Co", accountNumber: "MX-1001" }] });
  saved = await billingLib.getHmoBilling(made.billing.id);
  check("saved billing: later edits do not change it", snap("T-HMO-1a") === "Visit Co" && snap("T-HMO-3a") === "Acme Corp", saved?.lines.map((l) => [l.transactionId, l.hmoEmployer]));
  const sheet = billingPure.buildHmoBillingSheet(saved!.billing, saved!.lines);
  const csv = toCsv(sheet.rows);
  check("billing sheet: company column and values", /Patient,Patient's company,HMO account #/.test(csv) && /HMOTEST Ana Cruz,Visit Co,VX-1/.test(csv) && /Acme Corp/.test(csv) && /,Total,[0-9.]+/.test(csv), csv);
  await db.execute(sql`delete from hmo_billings where id = ${made.billing.id}`);
  const gone = (await db.execute(sql`select count(*)::int as n from hmo_billing_employers where billing_id = ${made.billing.id}`)) as unknown as Array<{ n: number }> & { rows?: Array<{ n: number }> };
  check("billing removed -> its company copies go too", (gone.rows ?? gone)[0].n === 0, gone);

  // save rules
  await visitStore.saveVisitHmoDetails(INV, { hmoName: "Maxicare", employer: "", accountNumber: "" });
  check("visit details with nothing in them remove the row", (await visitStore.getVisitHmoDetails([INV])).size === 0);
  await visitStore.saveVisitHmoDetails(INV, typed);
  await visitStore.saveVisitHmoDetails(INV, null);
  check("non-HMO visit (null) removes the row", (await visitStore.getVisitHmoDetails([INV])).size === 0);

  // the patient learns from the visit
  await admin.updatePatient(ANA_ID, { ...ana2, hmos: [{ company: "Maxicare", employer: "", accountNumber: "MX-1001" }] });
  await visitStore.learnPatientHmo(INV, { hmoName: "maxicare", employer: "Learned Co", accountNumber: "OTHER-9" });
  check("learn: blank company filled, existing number kept", J(await anaProfile()) === J([{ company: "Maxicare", employer: "Learned Co", accountNumber: "MX-1001" }]), await anaProfile());
  await visitStore.learnPatientHmo(INV, { hmoName: "Maxicare", employer: "Never Overwrite", accountNumber: "NOPE" });
  check("learn: never overwrites what the patient has", J(await anaProfile()) === J([{ company: "Maxicare", employer: "Learned Co", accountNumber: "MX-1001" }]), await anaProfile());
  await visitStore.learnPatientHmo(INV, { hmoName: "Valucare", employer: "Z Inc", accountNumber: "VC-9" });
  check("learn: a new HMO is added to the list", J(await anaProfile()) === J([{ company: "Maxicare", employer: "Learned Co", accountNumber: "MX-1001" }, { company: "Valucare", employer: "Z Inc", accountNumber: "VC-9" }]), await anaProfile());
  await visitStore.learnPatientHmo(INV, { hmoName: "Avega", employer: "", accountNumber: "" });
  check("learn: nothing typed -> nothing added", (await anaProfile())?.length === 2);

  // merge keeps the company
  const mt = await admin.createPatient({ ...base, fullName: "ZHMO MTarget", hmoCompany: "", hmoAccountNumber: "", hmos: [] });
  const ms = await admin.createPatient({ ...base, fullName: "ZHMO MSource", hmoCompany: "Maxicare", hmoAccountNumber: "MS-1", hmos: [{ company: "Maxicare", employer: "Source Co", accountNumber: "MS-1" }] });
  if (!mt.ok || !ms.ok) throw new Error("create failed");
  await admin.mergePatients(ms.id, mt.id);
  check("merge: the company moves with the HMO", J((await admin.getPatientProfile(mt.id))?.patient.hmos) === J([{ company: "Maxicare", employer: "Source Co", accountNumber: "MS-1" }]));

  // visit table missing: nothing breaks, patient details still used
  await db.execute(sql`alter table invoice_hmo_details rename to invoice_hmo_details_off`);
  try {
    check("visit table missing: read gives nothing", (await visitStore.getVisitHmoDetails([INV])).size === 0);
    check("visit table missing: save reports not saved", (await visitStore.saveVisitHmoDetails(INV, typed)) === false);
    await visitStore.learnPatientHmo(INV, { hmoName: "Maxicare", employer: "", accountNumber: "X" });
    const lm = await lineOf("T-HMO-1a");
    check("visit table missing: billing falls back to the patient", lm?.hmoEmployer === "Learned Co" && lm.hmoAccountNumber === "MX-1001", lm);
  } finally {
    await db.execute(sql`alter table invoice_hmo_details_off rename to invoice_hmo_details`);
  }

  // billing-company table missing: billing still saves, company shows blank
  await db.execute(sql`alter table hmo_billing_employers rename to hmo_billing_employers_off`);
  try {
    const m2 = await billingLib.createHmoBilling({ ...range, actor });
    check("company table missing: billing still saves", m2.ok, m2);
    if (m2.ok) {
      const s2 = await billingLib.getHmoBilling(m2.billing.id);
      check("company table missing: saved billing reads, company blank", !!s2 && s2.lines.length > 0 && s2.lines.every((l) => l.hmoEmployer === ""), s2?.lines.map((l) => l.hmoEmployer));
      await db.execute(sql`delete from hmo_billings where id = ${m2.billing.id}`);
    }
  } finally {
    await db.execute(sql`alter table hmo_billing_employers_off rename to hmo_billing_employers`);
  }

  // company column missing (SQL not re-run): list is off, the single HMO still works
  await db.execute(sql`alter table patient_hmos rename column employer to employer_off`);
  try {
    check("company column missing: list reported as not ready", (await store.patientHmosReady()) === false);
    const q2 = await admin.getPatientProfile(ANA_ID);
    check("company column missing: profile still opens with the single HMO", !!q2 && q2.patient.hmoListReady === false && q2.patient.hmos.length === 1, q2?.patient);
    const lm2 = await lineOf("T-HMO-1a");
    check("company column missing: billing still builds", !!lm2 && lm2.hmoEmployer === "", lm2);
  } finally {
    await db.execute(sql`alter table patient_hmos rename column employer_off to employer`);
  }

  // Day end shows the company, taking the visit's own details first
  const { getDayEndReport } = await import("../src/lib/db/day-end");
  const { buildDayEndSheet } = await import("../src/lib/cashflow/day-end");
  const cora = (await db.execute(sql`select invoice_id, patient_id from transactions where patient_name = 'HMOTEST Cora Diaz' limit 1`)) as unknown as Array<{ invoice_id: string; patient_id: string | null }> & { rows?: Array<{ invoice_id: string; patient_id: string | null }> };
  const c = (cora.rows ?? cora)[0];
  if (c && c.patient_id) {
    const cp = (await admin.getPatientProfile(c.patient_id))?.patient;
    const before = cp?.hmos ?? [];
    await admin.updatePatient(c.patient_id, { ...base, fullName: cp!.fullName, contactNumber: "", hmoCompany: "Medicard", hmoAccountNumber: "MD-3003", hmos: [{ company: "Medicard", employer: "Profile Co", accountNumber: "MD-3003" }] });
    const dayRow = async () => (await getDayEndReport({ branchId: MAR, date: "2026-11-04" })).rows.find((r) => r.patientName === "HMOTEST Cora Diaz");
    let row = await dayRow();
    check("day end: company from the patient's entry", row?.hmoEmployer === "Profile Co" && row.hmoAccountNumber === "MD-3003", row);
    await visitStore.saveVisitHmoDetails(c.invoice_id, { hmoName: "Medicard", employer: "Visit Typed Co", accountNumber: "MD-VISIT" });
    row = await dayRow();
    check("day end: the visit's own details win", row?.hmoEmployer === "Visit Typed Co" && row.hmoAccountNumber === "MD-VISIT", row);
    const dsheet = toCsv(buildDayEndSheet(await getDayEndReport({ branchId: MAR, date: "2026-11-04" })).rows);
    check("day end download: Patient's Company column", /,HMO,Patient's Company,HMO Account #,/.test(dsheet) && /Medicard,Visit Typed Co,MD-VISIT/.test(dsheet), dsheet);
    await visitStore.saveVisitHmoDetails(c.invoice_id, null);
    await admin.updatePatient(c.patient_id, { ...base, fullName: cp!.fullName, contactNumber: "", hmoCompany: before[0]?.company ?? "", hmoAccountNumber: before[0]?.accountNumber ?? "", hmos: before });
  } else {
    console.log("(skipped day end checks: HMOTEST Cora Diaz has no patient)");
  }

  // put Ana back as the other tests expect her
  await admin.updatePatient(ANA_ID, { ...ana2, hmos: [{ company: "Maxicare", employer: "", accountNumber: "MX-1001" }] });
  await db.execute(sql`delete from invoice_hmo_details where invoice_id = ${INV}`);

  // table missing: one HMO still works through the older fields
  await db.execute(sql`alter table patient_hmos rename to patient_hmos_off`);
  try {
    check("missing table: not ready", (await store.patientHmosReady()) === false);
    const q = await admin.getPatientProfile(id);
    check("missing table: profile still shows the single HMO", q?.patient.hmoListReady === false && J(q.patient.hmos) === J([{ company: "Intellicare", employer: "", accountNumber: "IC-7" }]), q?.patient);
    const m = await admin.createPatient({ ...base, fullName: "ZHMO Solo", hmoCompany: "Maxicare", hmoAccountNumber: "MX-S1" });
    check("missing table: create with one HMO works", m.ok, m);
    const srch = await admin.listPatientsPage({ q: "MX-S1", filter: "all", page: 1, today: "2026-11-12" });
    check("missing table: search by account number still works", srch.rows.length >= 1);
  } finally {
    await db.execute(sql`alter table patient_hmos_off rename to patient_hmos`);
  }

  await db.execute(sql`delete from patients where full_name like 'ZHMO %'`);
  console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
