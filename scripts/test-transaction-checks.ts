import { config } from "dotenv";
config({ path: ".env.local", override: true });

// The daily check: tick visits (BM / admin), lock them, only the superuser can
// unlock, plus the pure rules, the privilege and the Queue's daily clean-up.
async function main() {
  const { sql } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db/client");
  const lib = await import("../src/lib/db/transaction-checks");
  const rules = await import("../src/lib/cashflow/transaction-lock");
  const perms = await import("../src/lib/auth/permissions");
  const status = await import("../src/lib/cashflow/visit-status");
  const { listTransactionsPage } = await import("../src/lib/db/transactions");
  const { parseTransactionsQuery, buildTransactionsSearch } = await import("../src/lib/cashflow/transactions-query");

  let fails = 0;
  const check = (name: string, ok: boolean, extra?: unknown) => {
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`);
  };

  // --- pure rules ---
  check("checkStateOf none/partial/all",
    rules.checkStateOf({ lines: 2, checked: 0 }) === "none" &&
    rules.checkStateOf({ lines: 2, checked: 1 }) === "partial" &&
    rules.checkStateOf({ lines: 2, checked: 2 }) === "all");
  check("any checked line locks the visit", rules.isVisitLocked({ lines: 3, checked: 1 }) && !rules.isVisitLocked({ lines: 3, checked: 0 }) && !rules.isVisitLocked(undefined));
  check("can check a Cleared visit with procedures", rules.canCheckVisit({ status: "Cleared", procedures: ["Cleaning"], state: "none" }).ok);
  check("cannot check a visit that is not Cleared", !rules.canCheckVisit({ status: "For Payment", procedures: ["Cleaning"], state: "none" }).ok);
  check("cannot check a visit with no procedures yet", !rules.canCheckVisit({ status: "Cleared", procedures: ["No procedures yet"], state: "none" }).ok);
  check("cannot check twice", !rules.canCheckVisit({ status: "Cleared", procedures: ["Cleaning"], state: "all" }).ok);
  check("privilege: owner and admin have it by default; staff and dentist do not; superuser always",
    perms.effectivePermissions("owner").includes("transaction.verify") &&
    perms.effectivePermissions("admin").includes("transaction.verify") &&
    !perms.effectivePermissions("staff").includes("transaction.verify") &&
    !perms.effectivePermissions("dentist").includes("transaction.verify") &&
    perms.effectivePermissions("superuser").includes("transaction.verify"));
  check("privilege can be given to one person (override)",
    perms.effectivePermissions("staff", [{ permission: "transaction.verify", granted: true }]).includes("transaction.verify"));
  // --- two approvals: Branch manager first, Headquarters last ---
  const SAME = "11111111-1111-1111-1111-111111111111";
  const OTHER = "22222222-2222-2222-2222-222222222222";
  const full = { lines: 2, checked: 2, hqChecked: 0, checkedByUserId: SAME };
  check("stage: none / branch / approved",
    rules.approvalStageOf({ lines: 2, checked: 0, hqChecked: 0 }) === "none" &&
    rules.approvalStageOf({ lines: 2, checked: 2, hqChecked: 0 }) === "branch" &&
    rules.approvalStageOf({ lines: 2, checked: 2, hqChecked: 1 }) === "branch" &&
    rules.approvalStageOf({ lines: 2, checked: 2, hqChecked: 2 }) === "approved");
  check("HQ cannot approve before the Branch manager has checked",
    !rules.canApproveVisitHq({ check: { lines: 2, checked: 0, hqChecked: 0, checkedByUserId: null }, actorUserId: OTHER }).ok &&
    /Branch manager has to check/.test(rules.canApproveVisitHq({ check: { lines: 2, checked: 0, hqChecked: 0, checkedByUserId: null }, actorUserId: OTHER }).ok ? "" : (rules.canApproveVisitHq({ check: { lines: 2, checked: 0, hqChecked: 0, checkedByUserId: null }, actorUserId: OTHER }) as { reason: string }).reason));
  check("HQ cannot approve a half-checked visit", !rules.canApproveVisitHq({ check: { ...full, checked: 1 }, actorUserId: OTHER }).ok);
  check("HQ can approve a branch-checked visit by someone else", rules.canApproveVisitHq({ check: full, actorUserId: OTHER }).ok);
  check("HQ cannot be the person who gave the Branch check", !rules.canApproveVisitHq({ check: full, actorUserId: SAME }).ok);
  check("the superuser is exempt from the same-person rule", rules.canApproveVisitHq({ check: full, actorUserId: SAME, isSuperuser: true }).ok);
  check("HQ cannot approve twice", !rules.canApproveVisitHq({ check: { ...full, hqChecked: 2 }, actorUserId: OTHER }).ok);
  check("privilege HQ: owner only by default; admin, staff, dentist no; superuser yes",
    perms.effectivePermissions("owner").includes("transaction.verify_hq") &&
    !perms.effectivePermissions("admin").includes("transaction.verify_hq") &&
    !perms.effectivePermissions("staff").includes("transaction.verify_hq") &&
    !perms.effectivePermissions("dentist").includes("transaction.verify_hq") &&
    perms.effectivePermissions("superuser").includes("transaction.verify_hq"));
  check("privilege HQ can be given to an admin or taken from an owner (override)",
    perms.effectivePermissions("admin", [{ permission: "transaction.verify_hq", granted: true }]).includes("transaction.verify_hq") &&
    !perms.effectivePermissions("owner", [{ permission: "transaction.verify_hq", granted: false }]).includes("transaction.verify_hq"));
  check("both privileges are in the catalog and marked sensitive",
    perms.ALL_PERMISSIONS.includes("transaction.verify") && perms.ALL_PERMISSIONS.includes("transaction.verify_hq") &&
    perms.SENSITIVE_PERMISSIONS.includes("transaction.verify_hq"));
  check("query: hq and approved filters parse",
    parseTransactionsQuery({ checked: "hq" }).checked === "hq" &&
    parseTransactionsQuery({ checked: "approved" }).checked === "approved");
  check("query: checked filter parses and builds",
    parseTransactionsQuery({ checked: "yes" }).checked === "yes" &&
    parseTransactionsQuery({ checked: "no" }).checked === "no" &&
    parseTransactionsQuery({ checked: "x" }).checked === undefined &&
    buildTransactionsSearch(parseTransactionsQuery({}), { checked: "no" }) === "?checked=no");

  // Queue: Cleared visits drop off when the day ends
  const today = status.todayInManila();
  const yesterdayIso = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  check("queue: open visits always show", status.isOnQueueBoard({ status: "For Payment", visitDate: "2020-01-01", statusChangedAt: yesterdayIso }, today));
  check("queue: Cleared today shows", status.isOnQueueBoard({ status: "Cleared", visitDate: today, statusChangedAt: new Date().toISOString() }, today));
  check("queue: Cleared on an earlier day is gone", !status.isOnQueueBoard({ status: "Cleared", visitDate: "2020-01-01", statusChangedAt: yesterdayIso }, today));
  check("queue: an old visit cleared today still shows today", status.isOnQueueBoard({ status: "Cleared", visitDate: "2020-01-01", statusChangedAt: new Date().toISOString() }, today));

  // --- database ---
  const MAR = "1625aea3-62c8-4740-9159-81d72a5fb666";
  const ANT = "25c705b9-48f6-4631-a4a2-5d4e8afb3dcc";
  const ADMIN = "1b14c8a2-1788-4dbc-97d6-d7629b68cf61";
  const I1 = "c0c0c0c0-0000-0000-0000-000000000001"; // Cleared, Marikina, 2 lines
  const I2 = "c0c0c0c0-0000-0000-0000-000000000002"; // Arrived
  const I3 = "c0c0c0c0-0000-0000-0000-000000000003"; // Cleared, Antipolo
  const I4 = "c0c0c0c0-0000-0000-0000-000000000004"; // Cleared, placeholder only
  const cleanup = async () => {
    await db.execute(sql`delete from audit_log where invoice_id::text like 'c0c0c0c0-%'`);
    await db.execute(sql`delete from transactions where id like 'T-CK-%'`);
    await db.execute(sql`delete from invoices where id::text like 'c0c0c0c0-%'`);
  };
  await cleanup();
  const inv = (id: string, st: string, branch: string) =>
    db.execute(sql`insert into invoices (id, visit_date, branch_id, status) values (${id}::uuid, ${today}, ${branch}::uuid, ${st})`);
  const line = (id: string, invoice: string, proc: string, branch: string, n: number) =>
    db.execute(sql`insert into transactions (id, visit_id, date, month, year, transaction_type, patient_name, procedure, amount_paid, net_collection, invoice_id, branch_id, line_number, dentist) values (${id}, ${"V-" + id}, ${today}, '11', 2026, 'Visit', 'ZZ Check Patient', ${proc}, 500, 500, ${invoice}::uuid, ${branch}::uuid, ${n}, 'Dr Test')`);
  await inv(I1, "Cleared", MAR); await line("T-CK-1a", I1, "Cleaning", MAR, 1); await line("T-CK-1b", I1, "Consultation", MAR, 2);
  await inv(I2, "Arrived", MAR); await line("T-CK-2a", I2, "Consultation", MAR, 1);
  await inv(I3, "Cleared", ANT); await line("T-CK-3a", I3, "Cleaning", ANT, 1);
  await inv(I4, "Cleared", MAR); await line("T-CK-4a", I4, "No procedures yet", MAR, 1);

  try {
    check("table is there (SQL script run)", await lib.transactionChecksReady());
    const actor = { userId: ADMIN, name: "Sam Admin", allowedBranchIds: null as string[] | null };

    const before = await lib.getVisitChecks([I1, I2]);
    check("nothing checked yet; lines counted", before[I1]?.lines === 2 && before[I1]?.checked === 0 && before[I2]?.lines === 1, before);
    check("not locked before checking", (await lib.visitLockMessage(I1, { isSuperuser: false }, "edit")) === null);

    const r = await lib.checkVisits([I1, I2, I3, I4, "00000000-0000-0000-0000-00000000dead"], { ...actor, allowedBranchIds: [MAR] });
    check("checkVisits: ok", r.ok, r);
    if (r.ok) {
      check("only the Cleared visit of the person's clinic was checked", r.checked === 1, r);
      const reasons = Object.fromEntries(r.skipped.map((s) => [s.invoiceId, s.reason]));
      check("Arrived visit skipped: must be Cleared", /Clear the visit first/.test(reasons[I2] ?? ""), reasons[I2]);
      check("other clinic's visit skipped", /another clinic/.test(reasons[I3] ?? ""), reasons[I3]);
      check("placeholder-only visit skipped", /no procedures/i.test(reasons[I4] ?? ""), reasons[I4]);
      check("missing visit skipped", /no longer exists/.test(reasons["00000000-0000-0000-0000-00000000dead"] ?? ""));
    }
    const after = await lib.getVisitChecks([I1]);
    check("both lines of the visit are checked, with who and when", after[I1]?.checked === 2 && after[I1]?.checkedBy === "Sam Admin" && Boolean(after[I1]?.checkedAt), after);

    check("locked for anyone but the superuser: edit", /locked/i.test((await lib.visitLockMessage(I1, { isSuperuser: false }, "edit")) ?? ""));
    check("locked: remove, payment, status, file all report it",
      (await Promise.all(["remove", "record a payment", "change its status", "attach a file"].map((a) => lib.visitLockMessage(I1, { isSuperuser: false }, a)))).every((m) => /locked/i.test(m ?? "")));
    check("superuser is never blocked", (await lib.visitLockMessage(I1, { isSuperuser: true }, "edit")) === null);
    check("a single line of a locked visit is locked too", /locked/i.test((await lib.lineLockMessage("T-CK-1b", { isSuperuser: false }, "remove")) ?? ""));
    check("a line of an unchecked visit is not", (await lib.lineLockMessage("T-CK-2a", { isSuperuser: false }, "remove")) === null);
    check("an unchecked visit is not locked", (await lib.visitLockMessage(I2, { isSuperuser: false }, "edit")) === null);

    const again = await lib.checkVisits([I1], actor);
    check("checking again is skipped (already checked)", again.ok && again.checked === 0 && /Already checked/.test(again.skipped[0]?.reason ?? ""), again);


    // list filter
    const base = { limit: 100, offset: 0, from: today, to: today, branch: MAR, sort: "date" as const, dir: "desc" as const };
    const yes = await listTransactionsPage({ ...base, checked: "yes" });
    const no = await listTransactionsPage({ ...base, checked: "no" });
    const idsYes = yes.rows.map((x) => x.invoiceId);
    const idsNo = no.rows.map((x) => x.invoiceId);
    check("filter Checked lists the checked visit only", idsYes.includes(I1) && !idsYes.includes(I2), idsYes);
    check("filter To check lists the others", idsNo.includes(I2) && !idsNo.includes(I1), idsNo);

    // --- Headquarters: the second and last check ---
    const SUPER = "0cd13091-5ab6-4dfb-b82f-4dd0ac5bf4b8";
    const hq = { userId: SUPER, name: "Hana HQ", isSuperuser: false, allowedBranchIds: null as string[] | null };
    check("Headquarters table is there (SQL script run)", await lib.hqChecksReady());
    await lib.checkVisits([I3], { ...actor, allowedBranchIds: null }); // another clinic's visit, checked by the branch
    const early = await lib.approveVisitsHq([I2, I4], hq);
    check("HQ cannot approve a visit the branch has not checked", early.ok && early.checked === 0 && early.skipped.length === 2 && early.skipped.every((x) => /Branch manager has to check/.test(x.reason)), early);
    const same = await lib.approveVisitsHq([I1], { ...hq, userId: ADMIN });
    check("HQ cannot be the person who gave the Branch check", same.ok && same.checked === 0 && /gave the Branch manager check/.test(same.skipped[0]?.reason ?? ""), same);
    const clinic = await lib.approveVisitsHq([I1, I3], { ...hq, allowedBranchIds: [MAR] });
    check("HQ limited to a clinic skips another clinic's visit", clinic.ok && clinic.checked === 1 && /another clinic/.test(clinic.skipped[0]?.reason ?? ""), clinic);
    const afterHq = await lib.getVisitChecks([I1, I3]);
    check("Headquarters approval is stored on every line, with who and when; branch check untouched",
      afterHq[I1]?.hqChecked === 2 && afterHq[I1]?.hqCheckedBy === "Hana HQ" && Boolean(afterHq[I1]?.hqCheckedAt) && afterHq[I1]?.checked === 2 && afterHq[I1]?.checkedBy === "Sam Admin" && rules.approvalStageOf(afterHq[I1]) === "approved" && rules.approvalStageOf(afterHq[I3]) === "branch", afterHq);
    const hqAgain = await lib.approveVisitsHq([I1], hq);
    check("approving again is skipped", hqAgain.ok && hqAgain.checked === 0 && /Already approved/.test(hqAgain.skipped[0]?.reason ?? ""), hqAgain);
    check("an approved visit stays locked", /locked/i.test((await lib.visitLockMessage(I1, { isSuperuser: false }, "edit")) ?? ""));
    const hqList = await listTransactionsPage({ ...base, checked: "hq" });
    const apprList = await listTransactionsPage({ ...base, checked: "approved" });
    check("filter Waiting for HQ / Approved by HQ split the checked visits",
      !hqList.rows.map((x) => x.invoiceId).includes(I1) && apprList.rows.map((x) => x.invoiceId).includes(I1) && !apprList.rows.map((x) => x.invoiceId).includes(I2), { hq: hqList.rows.map((x) => x.invoiceId), appr: apprList.rows.map((x) => x.invoiceId) });
    const hqList2 = await listTransactionsPage({ ...base, branch: ANT, checked: "hq" });
    check("filter Waiting for HQ lists a branch-checked visit not yet approved", hqList2.rows.map((x) => x.invoiceId).includes(I3), hqList2.rows.map((x) => x.invoiceId));
    const hqAudit = await db.execute(sql`select user_name, summary from audit_log where invoice_id = ${I1}::uuid and action = 'visit.hq_checked'`) as unknown as { rows?: Array<{ user_name: string; summary: string }> } & Array<{ user_name: string; summary: string }>;
    const hqAuditRows = hqAudit.rows ?? hqAudit;
    check("audit trail has the Headquarters approval with the person's name", hqAuditRows.length === 1 && hqAuditRows[0].user_name === "Hana HQ" && /approved by Headquarters/.test(hqAuditRows[0].summary), hqAuditRows);

    // audit trail
    const audit1 = await db.execute(sql`select action, user_name, summary from audit_log where invoice_id = ${I1}::uuid and action = 'visit.checked'`) as unknown as { rows?: Array<{ user_name: string; summary: string }> } & Array<{ user_name: string; summary: string }>;
    const auditRows = audit1.rows ?? audit1;
    check("audit trail has one 'checked' entry with the person's name", auditRows.length === 1 && auditRows[0].user_name === "Sam Admin" && /checked and locked/.test(auditRows[0].summary), auditRows);

    // unlock
    const bad = await lib.uncheckVisit(I1, { userId: ADMIN, name: "Sam Admin", isSuperuser: false });
    check("an admin cannot unlock", !bad.ok && /superuser/.test(bad.ok ? "" : bad.message), bad);
    check("still locked after the refused unlock", /locked/i.test((await lib.visitLockMessage(I1, { isSuperuser: false }, "edit")) ?? ""));
    const good = await lib.uncheckVisit(I1, { userId: "0cd13091-5ab6-4dfb-b82f-4dd0ac5bf4b8", name: "Super User", isSuperuser: true });
    check("the superuser can unlock", good.ok, good);
    check("unlocked: editable again", (await lib.visitLockMessage(I1, { isSuperuser: false }, "edit")) === null);
    const unlocked = (await lib.getVisitChecks([I1]))[I1];
    check("unlocking removes both the Branch and the Headquarters check", unlocked?.checked === 0 && unlocked?.hqChecked === 0 && rules.approvalStageOf(unlocked) === "none", unlocked);
    const unlockAudit = await db.execute(sql`select summary from audit_log where invoice_id = ${I1}::uuid and action = 'visit.unchecked'`) as unknown as { rows?: Array<{ summary: string }> } & Array<{ summary: string }>;
    check("the unlock entry says the Headquarters approval went too", /Headquarters approval removed/.test((unlockAudit.rows ?? unlockAudit)[0]?.summary ?? ""));
    const unlockedAudit = await db.execute(sql`select count(*)::int as n from audit_log where invoice_id = ${I1}::uuid and action = 'visit.unchecked'`) as unknown as { rows?: Array<{ n: number }> } & Array<{ n: number }>;
    check("audit trail has the unlock", (unlockedAudit.rows ?? unlockedAudit)[0].n === 1);
    const twice = await lib.uncheckVisit(I1, { userId: null, name: "Super User", isSuperuser: true });
    check("unlocking a visit that isn't checked says so", !twice.ok && /isn't checked/.test(twice.ok ? "" : twice.message), twice);

    // deleting a line removes its check
    await lib.checkVisits([I1], actor);
    await db.execute(sql`delete from transactions where id = 'T-CK-1b'`);
    const left = await lib.getVisitChecks([I1]);
    check("deleting a line removes its check (cascade); the other stays", left[I1]?.lines === 1 && left[I1]?.checked === 1, left);

    // not-ready path
    await db.execute(sql`alter table transaction_checks rename to transaction_checks_off`);
    try {
      check("table missing: not ready, nothing locked, no crash", !(await lib.transactionChecksReady()) && Object.keys(await lib.getVisitChecks([I1])).length === 0 && (await lib.visitLockMessage(I1, { isSuperuser: false }, "edit")) === null);
      const refused = await lib.checkVisits([I1], actor);
      check("table missing: checking says to run the SQL script", !refused.ok && /transaction-checks\.sql/.test(refused.ok ? "" : refused.message), refused);
      const list = await listTransactionsPage({ ...base, checked: "yes" });
      check("table missing: the list still loads (filter ignored)", list.rows.length >= 1);
    } finally {
      await db.execute(sql`alter table transaction_checks_off rename to transaction_checks`);
    }

    // Headquarters table missing (its SQL script not run yet): the Branch check keeps working
    await db.execute(sql`alter table transaction_hq_checks rename to transaction_hq_checks_off`);
    try {
      check("HQ table missing: not ready, no crash, checks read as branch-only", !(await lib.hqChecksReady()) && (await lib.getVisitChecks([I1]))[I1]?.hqChecked === 0);
      const refusedHq = await lib.approveVisitsHq([I1], hq);
      check("HQ table missing: approving says to run the SQL script", !refusedHq.ok && /transaction-hq-checks\.sql/.test(refusedHq.ok ? "" : refusedHq.message), refusedHq);
      const okBranch = await lib.checkVisits([I1], actor);
      check("HQ table missing: the Branch manager check still works", okBranch.ok);
      const listHq = await listTransactionsPage({ ...base, checked: "hq" });
      check("HQ table missing: the list still loads (HQ filters ignored)", listHq.rows.length >= 1);
      const un = await lib.uncheckVisit(I1, { userId: null, name: "Super User", isSuperuser: true });
      check("HQ table missing: the superuser can still unlock", un.ok, un);
    } finally {
      await db.execute(sql`alter table transaction_hq_checks_off rename to transaction_hq_checks`);
    }
  } finally {
    await cleanup();
  }
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
