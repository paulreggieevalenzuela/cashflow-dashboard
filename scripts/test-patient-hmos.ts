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
  const J = JSON.stringify;

  // --- pure ---
  check("hmoKey ignores capitals and spaces", h.hmoKey("  Elite   Dental Network ") === "elite dental network");
  const ok1 = h.cleanHmoList([
    { company: "  Maxicare ", accountNumber: " MX-1 " },
    { company: "", accountNumber: "" },
    { company: "Medicard", accountNumber: "" },
  ]);
  check("clean: trims, drops empty rows, keeps order", ok1.ok && J(ok1.list) === J([{ company: "Maxicare", accountNumber: "MX-1" }, { company: "Medicard", accountNumber: "" }]), ok1);
  check("clean: undefined = empty list", J(h.cleanHmoList(undefined)) === J({ ok: true, list: [] }));
  check("clean: not an array is refused", !h.cleanHmoList("x").ok);
  const noCompany = h.cleanHmoList([{ company: "", accountNumber: "A-1" }]);
  check("clean: account number needs a company", !noCompany.ok && /company name/.test((noCompany as { message: string }).message), noCompany);
  const dup = h.cleanHmoList([{ company: "Maxicare", accountNumber: "1" }, { company: " maxicare ", accountNumber: "2" }]);
  check("clean: same company twice refused (capitals ignored)", !dup.ok, dup);
  const many = h.cleanHmoList(Array.from({ length: 11 }, (_, i) => ({ company: `HMO ${i}`, accountNumber: "" })));
  check("clean: more than 10 refused", !many.ok, many);
  check("clean: exactly 10 ok", h.cleanHmoList(Array.from({ length: 10 }, (_, i) => ({ company: `HMO ${i}`, accountNumber: "" }))).ok);
  check("legacyHmoList", J(h.legacyHmoList(" Maxicare ", "M1")) === J([{ company: "Maxicare", accountNumber: "M1" }]) && h.legacyHmoList("", "x").length === 0);
  const list = [{ company: "Maxicare", accountNumber: "MX-1" }, { company: "Medicard", accountNumber: "MD-2" }];
  check("accountNumberFor: matching company", h.accountNumberFor(list, "medicard", "OLD") === "MD-2");
  check("accountNumberFor: list without that company -> blank", h.accountNumberFor(list, "Avega", "OLD") === "");
  check("accountNumberFor: empty list -> legacy", h.accountNumberFor([], "Avega", "OLD") === "OLD");

  // --- database ---
  await db.execute(sql`delete from patients where full_name like 'ZHMO %'`);
  const rows = async (id: string) =>
    (await db.execute(sql`select company, account_number, position from patient_hmos where patient_id = ${id} order by position`)) as unknown as Array<{ company: string; account_number: string }> & { rows?: Array<{ company: string; account_number: string }> };
  const legacy = async (id: string) => {
    const [p] = await db.select({ c: patients.hmoCompany, a: patients.hmoAccountNumber }).from(patients).where(eq(patients.id, id));
    return `${p.c}|${p.a}`;
  };
  const base = { contactNumber: "0917", notes: "", birthDate: "" };

  check("table is ready", (await store.patientHmosReady()) === true);

  const created = await admin.createPatient({ ...base, fullName: "ZHMO Alpha", hmoCompany: "Maxicare", hmoAccountNumber: "MX-A1", hmos: [{ company: "Maxicare", accountNumber: "MX-A1" }, { company: "Medicard", accountNumber: "MD-A2" }] });
  if (!created.ok) throw new Error("create failed");
  const id = created.id;
  let p = await admin.getPatientProfile(id);
  check("profile: both HMOs, in order", J(p?.patient.hmos) === J([{ company: "Maxicare", accountNumber: "MX-A1" }, { company: "Medicard", accountNumber: "MD-A2" }]), p?.patient.hmos);
  check("profile: list is ready", p?.patient.hmoListReady === true);
  check("legacy columns mirror the first HMO", (await legacy(id)) === "Maxicare|MX-A1", await legacy(id));

  // reorder + edit + remove
  await admin.updatePatient(id, { ...base, fullName: "ZHMO Alpha", hmoCompany: "Medicard", hmoAccountNumber: "MD-A9", hmos: [{ company: "Medicard", accountNumber: "MD-A9" }, { company: "Avega", accountNumber: "AV-1" }] });
  p = await admin.getPatientProfile(id);
  check("update: new order, edited number, removed Maxicare, added Avega", J(p?.patient.hmos) === J([{ company: "Medicard", accountNumber: "MD-A9" }, { company: "Avega", accountNumber: "AV-1" }]), p?.patient.hmos);
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
  check("legacy-only patient shows their single HMO", J(p?.patient.hmos) === J([{ company: "Intellicare", accountNumber: "IC-7" }]), p?.patient.hmos);

  // merge
  const t = await admin.createPatient({ ...base, fullName: "ZHMO Target", hmoCompany: "Maxicare", hmoAccountNumber: "MX-T", hmos: [{ company: "Maxicare", accountNumber: "MX-T" }] });
  const s = await admin.createPatient({ ...base, fullName: "ZHMO Source", hmoCompany: "Maxicare", hmoAccountNumber: "MX-S", hmos: [{ company: "maxicare", accountNumber: "MX-S" }, { company: "Valucare", accountNumber: "VC-S" }] });
  if (!t.ok || !s.ok) throw new Error("create failed");
  const merged = await admin.mergePatients(s.id, t.id);
  check("merge ok", merged.ok, merged);
  const tp = await admin.getPatientProfile(t.id);
  check("merge: target's own Maxicare number stays, Valucare added", J(tp?.patient.hmos) === J([{ company: "Maxicare", accountNumber: "MX-T" }, { company: "Valucare", accountNumber: "VC-S" }]), tp?.patient.hmos);
  const left = await db.execute(sql`select count(*)::int as n from patient_hmos where patient_id = ${s.id}`) as unknown as Array<{ n: number }> & { rows?: Array<{ n: number }> };
  check("merge: removed patient's rows are gone", (left.rows ?? left)[0].n === 0, left);

  // HMO billing uses the account of the line's own HMO
  const ana = (await db.execute(sql`select id from patients where full_name = 'HMOTEST Ana Cruz'`)) as unknown as Array<{ id: string }> & { rows?: Array<{ id: string }> };
  const anaId = (ana.rows ?? ana)[0]?.id;
  if (anaId) {
    await admin.updatePatient(anaId, { ...base, fullName: "HMOTEST Ana Cruz", contactNumber: "", hmoCompany: "Medicard", hmoAccountNumber: "MD-9", hmos: [{ company: "Medicard", accountNumber: "MD-9" }, { company: "Maxicare", accountNumber: "MX-1001" }] });
    const lines = await getHmoBillingLines({ from: "2026-11-01", to: "2026-11-30", branchId: null, hmo: "Maxicare" });
    const anaLines = lines.filter((l) => l.transactionId.startsWith("T-HMO-1"));
    check("billing: Maxicare line shows Maxicare's number, not the first HMO's", anaLines.length > 0 && anaLines.every((l) => l.hmoAccountNumber === "MX-1001"), anaLines.map((l) => l.hmoAccountNumber));
    await admin.updatePatient(anaId, { ...base, fullName: "HMOTEST Ana Cruz", contactNumber: "", hmoCompany: "Medicard", hmoAccountNumber: "MD-9", hmos: [{ company: "Medicard", accountNumber: "MD-9" }] });
    const noEntry = await getHmoBillingLines({ from: "2026-11-01", to: "2026-11-30", branchId: null, hmo: "Maxicare" });
    check("billing: no Maxicare entry -> blank, not another HMO's number", noEntry.filter((l) => l.transactionId.startsWith("T-HMO-1")).every((l) => l.hmoAccountNumber === ""), noEntry.map((l) => l.hmoAccountNumber));
    await admin.updatePatient(anaId, { ...base, fullName: "HMOTEST Ana Cruz", contactNumber: "", hmoCompany: "Maxicare", hmoAccountNumber: "MX-1001", hmos: [{ company: "Maxicare", accountNumber: "MX-1001" }] });
  } else {
    console.log("(skipped billing checks: no HMOTEST Ana Cruz)");
  }

  // table missing: one HMO still works through the older fields
  await db.execute(sql`alter table patient_hmos rename to patient_hmos_off`);
  try {
    check("missing table: not ready", (await store.patientHmosReady()) === false);
    const q = await admin.getPatientProfile(id);
    check("missing table: profile still shows the single HMO", q?.patient.hmoListReady === false && J(q.patient.hmos) === J([{ company: "Intellicare", accountNumber: "IC-7" }]), q?.patient);
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
