import "dotenv/config";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
config({ path: ".env.local", override: true });

/**
 * Roles, privileges, clinics and Deleted items. Pure rules first, then the
 * database (on whatever DATABASE_URL points at: use a TEST database).
 */
async function main() {
  const { eq, inArray, sql } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db/client");
  const schema = await import("../src/lib/db/schema");
  const perms = await import("../src/lib/auth/permissions");
  const resetRules = await import("../src/lib/auth/reset-rules");
  const policy = await import("../src/lib/auth/branch-policy");
  const dayEnd = await import("../src/lib/db/day-end");
  const access = await import("../src/lib/db/user-access");
  const usersDb = await import("../src/lib/db/users");
  const inv = await import("../src/lib/db/invoices");
  const payDb = await import("../src/lib/db/payments");
  const expDb = await import("../src/lib/db/expenses");
  const attDb = await import("../src/lib/db/attachments");
  const txDb = await import("../src/lib/db/transactions");
  const trash = await import("../src/lib/db/deleted-items");
  const { listBranches } = await import("../src/lib/db/branches");

  let fails = 0;
  const check = (name: string, ok: boolean, extra?: unknown) => {
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`);
  };

  // ───────────────────────── pure rules ─────────────────────────
  const { ALL_PERMISSIONS, roleDefaults, effectivePermissions, overridesFor } = perms;
  check("25 privileges in the catalog", ALL_PERMISSIONS.length === 25, ALL_PERMISSIONS.length);
  check("no duplicate keys", new Set(ALL_PERMISSIONS).size === ALL_PERMISSIONS.length);
  check("superuser holds every privilege", roleDefaults("superuser").length === ALL_PERMISSIONS.length);
  check("owner and admin defaults are identical",
    JSON.stringify(roleDefaults("owner")) === JSON.stringify(roleDefaults("admin")));
  check("admin can delete visits, staff cannot",
    roleDefaults("admin").includes("visit.delete") && !roleDefaults("staff").includes("visit.delete"));
  check("staff can edit a Cleared visit, dentist cannot",
    roleDefaults("staff").includes("visit.edit_cleared") && !roleDefaults("dentist").includes("visit.edit_cleared"));
  check("dentist/staff cannot manage users",
    !roleDefaults("dentist").includes("user.manage") && !roleDefaults("staff").includes("user.manage"));
  check("everyone can add visits, payments, expenses, files",
    (["owner", "admin", "dentist", "staff"] as const).every((role) =>
      ["visit.create", "payment.add", "expense.add", "attachment.upload"].every((key) =>
        roleDefaults(role).includes(key as never))));
  check("CSV import is owner/admin only by default",
    roleDefaults("admin").includes("import.csv") && !roleDefaults("staff").includes("import.csv"));

  // overrides round-trip for every role and a spread of choices
  let roundTripOk = true;
  for (const role of ["owner", "admin", "dentist", "staff"] as const) {
    for (let trial = 0; trial < 40; trial++) {
      const chosen = ALL_PERMISSIONS.filter((_, index) => ((index * 7 + trial * 13) % 5) < 2);
      const eff = effectivePermissions(role, overridesFor(role, chosen));
      if (JSON.stringify([...eff].sort()) !== JSON.stringify([...chosen].sort())) roundTripOk = false;
    }
  }
  check("overridesFor → effectivePermissions round-trips", roundTripOk);
  check("no overrides when the choice equals the role defaults",
    overridesFor("staff", roleDefaults("staff")).length === 0);
  check("only differences are stored",
    overridesFor("staff", [...roleDefaults("staff"), "visit.delete"]).length === 1);
  check("unknown override keys are ignored",
    effectivePermissions("staff", [{ permission: "nope.nothing", granted: true }]).length === roleDefaults("staff").length);
  check("superuser ignores overrides",
    effectivePermissions("superuser", [{ permission: "visit.delete", granted: false }]).length === ALL_PERMISSIONS.length);

  // who manages whom
  const M = (a: string, b: string) => perms.canManageUser({ id: "a", role: a as never }, { id: "b", role: b as never }).ok;
  check("superuser manages owner/admin/dentist/staff", ["owner", "admin", "dentist", "staff"].every((r) => M("superuser", r)));
  check("owner manages admin/dentist/staff, not another owner", M("owner", "admin") && M("owner", "dentist") && M("owner", "staff") && !M("owner", "owner"));
  check("admin manages dentist/staff only", M("admin", "dentist") && M("admin", "staff") && !M("admin", "admin") && !M("admin", "owner"));
  check("nobody manages the superuser", ["superuser", "owner", "admin"].every((r) => !M(r, "superuser")));
  check("nobody manages themselves", !perms.canManageUser({ id: "x", role: "owner" }, { id: "x", role: "owner" }).ok);
  check("dentist/staff manage nobody", !M("dentist", "staff") && !M("staff", "dentist"));
  check("assignable roles", JSON.stringify(perms.assignableRolesFor("superuser")) === '["owner","admin","dentist","staff"]'
    && JSON.stringify(perms.assignableRolesFor("owner")) === '["admin","dentist","staff"]'
    && JSON.stringify(perms.assignableRolesFor("admin")) === '["dentist","staff"]'
    && perms.assignableRolesFor("staff").length === 0);
  check("owner/admin/superuser work in every clinic", ["owner", "admin", "superuser"].every((r) => perms.worksInEveryClinic(r as never)) && !perms.worksInEveryClinic("staff") && !perms.worksInEveryClinic("dentist"));

  // password reset rules incl. owner
  const R = (a: string, b: string) => resetRules.canResetPassword({ id: "a", role: a as never }, { id: "b", role: b as never }).ok;
  check("reset: owner can reset admin, not owner", R("owner", "admin") && !R("owner", "owner"));
  check("reset: admin cannot reset owner or admin", !R("admin", "owner") && !R("admin", "admin") && R("admin", "staff"));
  check("reset: superuser resets owner, nobody resets superuser", R("superuser", "owner") && !R("owner", "superuser"));
  check("reset requests: admin can't act on an owner's", !resetRules.canActOnRequestFor("admin", "owner") && resetRules.canActOnRequestFor("owner", "admin"));

  // clinics
  const allIds = ["A", "B", "C"];
  const p = (role: string, branchId: string | null, branchIds: string[] | null) =>
    policy.getBranchPolicy({ user: { id: "u", role, branchId, branchIds } }, allIds.map((id) => ({ id, name: `Clinic ${id}` })));
  const pAdmin = await p("admin", null, null);
  check("admin: chooses any clinic", pAdmin.canChoose && pAdmin.allowedBranchIds === null);
  const pOne = await p("staff", "A", ["A"]);
  check("one clinic: locked to it", !pOne.canChoose && pOne.branchId === "A" && pOne.allowedBranchIds?.join() === "A");
  const pTwo = await p("dentist", "B", ["A", "B"]);
  check("two clinics: chooses among them, home first", pTwo.canChoose && pTwo.branchId === "B" && pTwo.allowedBranchIds?.join() === "A,B");
  const pNone = await p("staff", null, []);
  check("no clinic ticked: cannot add visits", !pNone.canChoose && pNone.branchId === null);
  check("branch allowed / refused", policy.isBranchAllowed(pTwo, "A") && !policy.isBranchAllowed(pTwo, "C") && policy.isBranchAllowed(pAdmin, "C") && !policy.isBranchAllowed(pTwo, ""));
  const list = allIds.map((id) => ({ id }));
  check("queue: admin sees all or the requested clinic",
    policy.resolveQueueBranch({ policy: pAdmin, requested: undefined, branchList: list }) === null &&
    policy.resolveQueueBranch({ policy: pAdmin, requested: "C", branchList: list }) === "C");
  check("queue: multi-clinic user sees own clinic only",
    policy.resolveQueueBranch({ policy: pTwo, requested: "A", branchList: list }) === "A" &&
    policy.resolveQueueBranch({ policy: pTwo, requested: "C", branchList: list }) === "B" &&
    policy.resolveQueueBranch({ policy: pTwo, requested: undefined, branchList: list }) === "B");

  const scope = (role: string, branchId: string | null, branchIds: string[] | null, requested?: string) =>
    dayEnd.resolveDayEndScope({ userId: "u", role, branchId, branchIds, requested, branchList: list });
  const sAdmin = await scope("admin", null, null, "C");
  check("day end: admin picks any clinic", sAdmin.branchId === "C" && !sAdmin.locked && sAdmin.allowedBranchIds === null);
  const sOne = await scope("staff", "A", ["A"], "C");
  check("day end: one clinic is locked", sOne.branchId === "A" && sOne.locked);
  const sTwo = await scope("staff", "B", ["A", "B"], "A");
  check("day end: two clinics, picks among them", sTwo.branchId === "A" && !sTwo.locked);
  const sTwoBad = await scope("staff", "B", ["A", "B"], "C");
  check("day end: a clinic that isn't theirs falls back to home", sTwoBad.branchId === "B");
  check("day end: scope covers its clinics only", dayEnd.scopeCoversBranch(sTwo, "A") && !dayEnd.scopeCoversBranch(sTwo, "C") && dayEnd.scopeCoversBranch(sAdmin, "C") && !dayEnd.scopeCoversBranch(sTwo, null));

  // ───────────────────────── database ─────────────────────────
  const branches = await listBranches();
  if (branches.length < 2) {
    console.log("SKIP database tests: need at least two branches");
    process.exit(fails ? 1 : 0);
  }
  const [A, B] = branches;
  const actor = { userId: "1b14c8a2-1788-4dbc-97d6-d7629b68cf61", name: "Test Runner" };
  const ctx = { userId: actor.userId, userName: actor.name, isAdmin: true, canEditCleared: true };
  const PATIENT = "ZZ Roles Test";
  const MARK = "zz-roles-";

  const cleanup = async () => {
    const ids = await db
      .select({ id: schema.transactions.invoiceId })
      .from(schema.transactions)
      .where(eq(schema.transactions.patientName, PATIENT));
    const invoiceIds = [...new Set(ids.map((r) => r.id).filter(Boolean))] as string[];
    if (invoiceIds.length) {
      await db.delete(schema.transactions).where(inArray(schema.transactions.invoiceId, invoiceIds));
      await db.delete(schema.invoices).where(inArray(schema.invoices.id, invoiceIds));
    }
    await db.execute(sql`delete from transactions where patient_name = ${PATIENT}`);
    await db.execute(sql`delete from expenses where category = 'ZZ Roles Test'`);
    await db.execute(sql`delete from deleted_items where label like ${"%" + PATIENT + "%"} or label like 'ZZ Roles Test%' or label like 'zz-roles-%'`);
    await db.execute(sql`delete from users where email like ${MARK + "%@test.local"}`);
  };
  await cleanup();

  try {
    // ---- per-user access
    const u = await usersDb.createUser({
      name: "ZZ Roles Staff",
      email: `${MARK}${Date.now()}@test.local`,
      passwordHash: "x",
      role: "staff",
    });
    let profile = await access.getAccessProfile({ userId: u.id, role: "staff", branchId: null });
    check("new staff: role defaults, no clinic", profile.permissions.length === roleDefaults("staff").length && profile.branchIds?.length === 0, profile);

    await access.saveUserAccess({
      userId: u.id,
      role: "staff",
      branchIds: [A.id, B.id],
      permissions: [...roleDefaults("staff"), "visit.delete", "expense.edit"].filter((k) => k !== "attachment.upload"),
    });
    const stored = await access.getOverrides(u.id);
    check("only the differences are stored (2 extra, 1 removed)", stored.length === 3, stored);
    const dbUser = await usersDb.getUserById(u.id);
    profile = await access.getAccessProfile({ userId: u.id, role: "staff", branchId: dbUser?.branchId ?? null });
    check("effective = defaults + overrides",
      profile.permissions.includes("visit.delete") && profile.permissions.includes("expense.edit") && !profile.permissions.includes("attachment.upload"));
    check("clinics saved, first is home", profile.branchIds?.join() === `${A.id},${B.id}` && dbUser?.branchId === A.id, { profile, home: dbUser?.branchId });
    const byUser = await access.listBranchIdsByUser();
    check("list of clinics per user", (byUser.get(u.id) ?? []).length === 2);
    check("customized flag", (await access.listCustomizedUserIds([u.id])).has(u.id));

    await access.saveUserAccess({ userId: u.id, role: "staff", branchIds: [B.id], permissions: roleDefaults("staff") });
    check("back to defaults clears the overrides", (await access.getOverrides(u.id)).length === 0);
    check("not customized any more", !(await access.listCustomizedUserIds([u.id])).has(u.id));
    check("one clinic after update", (await access.getUserBranchIds(u.id, null)).join() === B.id);

    await access.saveUserAccess({ userId: u.id, role: "admin", branchIds: [A.id], permissions: roleDefaults("admin") });
    profile = await access.getAccessProfile({ userId: u.id, role: "admin", branchId: null });
    check("promoted to admin: every clinic, admin defaults", profile.branchIds === null && profile.permissions.includes("user.manage"));
    await access.saveUserAccess({ userId: u.id, role: "owner", branchIds: [], permissions: roleDefaults("owner") });
    check("owner role stored", (await usersDb.getUserById(u.id))?.role === "owner");

    // ---- deleted items: helpers
    const mkLine = (procedure: string, price: number) => ({
      id: "", procedure, unitPrice: price, quantity: 1, teeth: "", discountTypeId: "", discountReason: "",
      discountMode: "" as const, discountValue: 0, vatType: "non_vat" as const, loaNumber: "",
    });
    const baseVisit = (lines: ReturnType<typeof mkLine>[], invoiceNumber = "", branchId = A.id) => ({
      date: "2026-11-06", invoiceNumber, patientName: PATIENT, transactionType: "Visit", visitType: "" as const,
      branchId, remarks: "", discountIdType: "", discountIdNumber: "", recallDate: "", recallReason: "", loeNumber: "",
      dentist: "", transferDentist: "", lines,
      payment: { amount: 0, paymentType: "Cash", referenceNo: "" },
    });
    const countRows = async (invoiceId: string) => {
      const [t] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.transactions).where(eq(schema.transactions.invoiceId, invoiceId));
      const [i] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
      const [p] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.payments).where(eq(schema.payments.invoiceId, invoiceId));
      const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.attachments).where(eq(schema.attachments.invoiceId, invoiceId));
      return { lines: t.n, invoice: i.n, payments: p.n, files: a.n };
    };
    const lastArchive = async (kind: string) => {
      const rows = await trash.listDeletedItems({ kind: kind as never, showRestored: true, limit: 5 });
      return rows[0];
    };
    const fileOf = (invoiceId: string) => ({
      invoiceId, paymentId: null, kind: "invoice" as const, fileName: "zz-roles-file.pdf",
      contentType: "application/pdf", sizeBytes: 12, dataBase64: Buffer.from("hello world!").toString("base64"), createdByUserId: null,
    });

    // ---- visit: delete + restore (with payment, file, status history)
    const created = await inv.createInvoice(baseVisit([mkLine("Build Up", 1000), mkLine("Prophylaxis", 500)], "ZZRT-1"), ctx);
    if (!created.ok) throw new Error("setup: " + JSON.stringify(created));
    const visitId = created.invoiceId;
    await payDb.addPayment({ invoiceId: visitId, amount: 700, paymentType: "Cash", paidAt: new Date("2026-11-06T00:00:00"), referenceNo: "R1", notes: "" });
    const fileId = await attDb.addAttachment(fileOf(visitId));
    const before = await countRows(visitId);
    const beforeLines = await inv.listLinesForInvoice(visitId);
    const beforeTotal = beforeLines.reduce((s, l) => s + l.amountPaid, 0);
    check("setup: visit has 2 lines, 1 payment, 1 file", before.lines === 2 && before.payments === 1 && before.files === 1, before);

    await inv.deleteInvoice(visitId, actor);
    const gone = await countRows(visitId);
    check("visit delete removes every live row", gone.lines === 0 && gone.invoice === 0 && gone.payments === 0 && gone.files === 0, gone);
    const [sumAfter] = await db.select({ s: sql<string>`coalesce(sum(amount_paid),0)` }).from(schema.transactions).where(eq(schema.transactions.patientName, PATIENT));
    check("deleted visit no longer counts in totals", Number(sumAfter.s) === 0, sumAfter);
    const vArchive = await lastArchive("visit");
    check("archived as a visit with who/when", vArchive?.kind === "visit" && vArchive.deletedByName === "Test Runner" && vArchive.label.includes(PATIENT) && vArchive.entityId === visitId, vArchive);
    check("archive keeps the amount and branch", vArchive?.amount === beforeTotal && vArchive?.branchId === A.id, vArchive);

    // a same-number visit appears meanwhile -> clash is reported, forced restore works
    const other = await inv.createInvoice(baseVisit([mkLine("Filling", 300)], "ZZRT-1"), ctx);
    if (!other.ok) throw new Error("setup2: " + JSON.stringify(other));
    const clash = await trash.restoreDeletedItem(vArchive.id, actor);
    check("restore warns about a reused invoice number", !clash.ok && clash.canForce === true, clash);
    check("nothing was restored by the refused attempt", (await countRows(visitId)).invoice === 0);
    await inv.deleteInvoice(other.invoiceId, actor);

    const restored = await trash.restoreDeletedItem(vArchive.id, actor);
    check("restore brings the visit back", restored.ok, restored);
    const after = await countRows(visitId);
    check("every row is back", after.lines === 2 && after.invoice === 1 && after.payments === 1 && after.files === 1, after);
    const afterLines = await inv.listLinesForInvoice(visitId);
    check("amounts and numbers identical", afterLines.reduce((s, l) => s + l.amountPaid, 0) === beforeTotal && afterLines.every((l, i) => l.id === beforeLines[i].id && l.visitId === beforeLines[i].visitId && l.date === beforeLines[i].date), { afterLines, beforeLines });
    const [restoredPay] = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, visitId));
    check("payment restored with real dates", restoredPay.paidAt instanceof Date && Number(restoredPay.amount) === 700 && restoredPay.referenceNo === "R1", restoredPay);
    const file = await attDb.getAttachmentFile(fileId);
    check("file content restored byte for byte", Buffer.from(file?.dataBase64 ?? "", "base64").toString() === "hello world!");
    const vRow = (await trash.listDeletedItems({ kind: "visit", showRestored: true, limit: 20 })).find((i) => i.id === vArchive.id)!;
    check("archive row marked restored", vRow.restoredAt !== null && vRow.restoredByName === "Test Runner", vRow);
    const again = await trash.restoreDeletedItem(vRow.id, actor);
    check("restoring twice is refused", !again.ok && /already restored/.test(again.message), again);
    check("restored items hidden from the default list", !(await trash.listDeletedItems({})).some((i) => i.id === vRow.id));

    // ---- line: delete one of two, restore; last line takes the visit
    const lineIds = afterLines.map((l) => l.id);
    await txDb.deleteTransaction(lineIds[0], actor);
    const afterOne = await countRows(visitId);
    check("deleting one line keeps the visit", afterOne.lines === 1 && afterOne.invoice === 1 && afterOne.payments === 1, afterOne);
    const lArchive = await lastArchive("line");
    check("archived as a line", lArchive?.kind === "line" && lArchive.entityId === lineIds[0], lArchive);
    const lr = await trash.restoreDeletedItem(lArchive.id, actor);
    check("line restored", lr.ok && (await countRows(visitId)).lines === 2, lr);
    await txDb.deleteTransaction(lineIds[0], actor);
    await txDb.deleteTransaction(lineIds[1], actor);
    const lastGone = await countRows(visitId);
    check("deleting the last line archives the whole visit", lastGone.invoice === 0 && lastGone.payments === 0 && lastGone.files === 0, lastGone);
    const wholeAgain = await lastArchive("visit");
    check("…as a visit entry with its payment and file", wholeAgain.entityId === visitId && wholeAgain.restoredAt === null && /1 payment/.test(wholeAgain.summary) && /1 file/.test(wholeAgain.summary), wholeAgain);
    // restoring the orphan line entry now must say the visit is missing
    const orphanLine = (await trash.listDeletedItems({ kind: "line", limit: 5 }))[0];
    if (orphanLine) {
      const orphan = await trash.restoreDeletedItem(orphanLine.id, actor);
      check("restoring a line whose visit is gone is refused", !orphan.ok && /visit/.test(orphan.message), orphan);
    }
    const whole = await trash.restoreDeletedItem(wholeAgain.id, actor);
    check("whole visit restored (the last line, as it was when deleted)", whole.ok && (await countRows(visitId)).lines === 1, whole);
    if (orphanLine) {
      const second = await trash.restoreDeletedItem(orphanLine.id, actor);
      check("the earlier line can now be restored onto it", second.ok && (await countRows(visitId)).lines === 2, second);
    }

    // ---- payment (with a proof file)
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, visitId));
    const proofId = await attDb.addAttachment({ ...fileOf(visitId), paymentId: pay.id, kind: "receipt", fileName: "zz-roles-proof.png" });
    const removedFor = await payDb.deletePayment(pay.id, actor);
    check("deletePayment returns its visit", removedFor === visitId);
    const [stillPay] = await db.select().from(schema.payments).where(eq(schema.payments.id, pay.id));
    const [stillProof] = await db.select().from(schema.attachments).where(eq(schema.attachments.id, proofId));
    check("payment and its proof are removed", !stillPay && !stillProof);
    const pArchive = await lastArchive("payment");
    check("archived as a payment", pArchive?.kind === "payment" && pArchive.amount === 700 && /1 file/.test(pArchive.summary), pArchive);
    const pr = await trash.restoreDeletedItem(pArchive.id, actor);
    const [backPay] = await db.select().from(schema.payments).where(eq(schema.payments.id, pay.id));
    const [backProof] = await db.select().from(schema.attachments).where(eq(schema.attachments.id, proofId));
    check("payment and proof restored", pr.ok && Number(backPay?.amount) === 700 && Boolean(backProof), pr);

    // ---- single file
    await attDb.deleteAttachment(fileId, actor);
    const [noFile] = await db.select().from(schema.attachments).where(eq(schema.attachments.id, fileId));
    check("file removed", !noFile);
    const fArchive = await lastArchive("attachment");
    check("archived as a file", fArchive?.kind === "attachment" && fArchive.label === "zz-roles-file.pdf", fArchive);
    const fr = await trash.restoreDeletedItem(fArchive.id, actor);
    check("file restored", fr.ok && Boolean(await attDb.getAttachmentFile(fileId)), fr);

    // ---- expense + receipt
    const expenseId = randomUUID();
    await expDb.createExpense({
      id: expenseId, date: "2026-11-06", category: "ZZ Roles Test", description: "zz", amount: 250, paymentMethod: "Cash",
      branchId: A.id, createdByUserId: null, supplierId: null, referenceNo: "", remarks: "", nature: "", vatType: "non_vat", vatableAmount: 250, vatAmount: 0,
    });
    const receiptId = await attDb.addAttachment({ invoiceId: null, expenseId, paymentId: null, kind: "receipt", fileName: "zz-roles-receipt.jpg", contentType: "image/jpeg", sizeBytes: 5, dataBase64: Buffer.from("abcde").toString("base64"), createdByUserId: null });
    await expDb.deleteExpense(expenseId, actor);
    check("expense and its receipt removed", !(await expDb.getExpenseById(expenseId)) && !(await attDb.getAttachmentFile(receiptId)));
    const eArchive = await lastArchive("expense");
    check("archived as an expense", eArchive?.kind === "expense" && eArchive.amount === 250 && eArchive.branchId === A.id, eArchive);
    const er = await trash.restoreDeletedItem(eArchive.id, actor);
    const backExp = await expDb.getExpenseById(expenseId);
    check("expense restored", er.ok && backExp?.amount === 250 && backExp.date === "2026-11-06", er);
    check("receipt restored", Boolean(await attDb.getAttachmentFile(receiptId)));

    // ---- count + purge
    check("count of waiting items is a number", typeof (await trash.countDeletedItems()) === "number");
    await expDb.deleteExpense(expenseId, actor);
    const toPurge = await lastArchive("expense");
    check("purge removes the entry for good", (await trash.purgeDeletedItem(toPurge.id)) === true && (await trash.purgeDeletedItem(toPurge.id)) === false);
    check("purged entry is gone", !(await trash.listDeletedItems({ showRestored: true })).some((i) => i.id === toPurge.id));

    // ---- 30-day retention
    const retention = await import("../src/lib/cashflow/deleted-retention");
    const day = 24 * 60 * 60 * 1000;
    const ago = (days: number) => new Date(Date.now() - days * day);
    check("retention is 30 days", retention.DELETED_ITEMS_RETENTION_DAYS === 30);
    check("a fresh delete has 30 days left", retention.deletedItemDaysLeft(new Date()) === 30);
    check("a delete from 25 days ago has 5 days left", retention.deletedItemDaysLeft(ago(25)) === 5);
    check("an old delete never shows negative days", retention.deletedItemDaysLeft(ago(80)) === 0);
    const seed = async (label: string, deletedAt: Date, restoredAt: Date | null) => {
      const [row] = await db
        .insert(schema.deletedItems)
        .values({ kind: "expense", entityId: randomUUID(), label, snapshot: restoredAt ? {} : { expenses: [] }, deletedAt, restoredAt, deletedByName: "Test Runner" })
        .returning({ id: schema.deletedItems.id });
      return row.id;
    };
    const oldId = await seed("zz-roles-old", ago(31), null);
    const edgeId = await seed("zz-roles-edge", ago(29), null);
    const freshId = await seed("zz-roles-fresh", ago(1), null);
    const oldRestoredId = await seed("zz-roles-restored-old", ago(60), ago(31));
    const newRestoredId = await seed("zz-roles-restored-new", ago(60), ago(5));
    const exists = async (id: string) =>
      (await db.select({ id: schema.deletedItems.id }).from(schema.deletedItems).where(eq(schema.deletedItems.id, id))).length === 1;
    check("expiring-soon count includes the 29-day item", (await trash.countExpiringSoon(7)) >= 2);
    const removedCount = await trash.purgeExpiredDeletedItems({ force: true });
    check("clean-up removed the 31-day-old item and the old restored record", removedCount >= 2, removedCount);
    check("31-day-old item is gone", !(await exists(oldId)));
    check("29-day-old item is kept", await exists(edgeId));
    check("1-day-old item is kept", await exists(freshId));
    check("restored record older than 30 days is removed", !(await exists(oldRestoredId)));
    check("recently restored record is kept", await exists(newRestoredId));
    const cleanedAudit = await db.execute(sql`select 1 from audit_log where action = 'deleted_items.purged' and created_at > now() - interval '1 minute'`);
    check("the clean-up is written to the audit trail", cleanedAudit.rows.length >= 1);
    // Throttle: a second call without force does nothing, even with an old item.
    const lateId = await seed("zz-roles-late", ago(40), null);
    check("clean-up without force is limited to once an hour", (await trash.purgeExpiredDeletedItems()) === 0 && (await exists(lateId)));
    // Deleting something triggers the clean-up path without failing the delete.
    check("forced clean-up removes the late item", (await trash.purgeExpiredDeletedItems({ force: true })) >= 1 && !(await exists(lateId)));
    check("count of waiting items ignores restored ones", (await trash.countDeletedItems())! >= 2);

    // ---- access review data
    const reviewUser = await usersDb.createUser({
      name: "ZZ Roles Review", email: `${MARK}review@test.local`, role: "staff", branchId: A.id, passwordHash: "x",
    });
    await access.saveUserAccess({
      userId: reviewUser.id, role: "staff", branchIds: [A.id],
      permissions: [...perms.roleDefaults("staff"), "visit.delete", "hmo.void"].filter((p, i, all) => p !== "payment.add" && all.indexOf(p) === i),
    });
    const allOverrides = await access.listAllOverrides();
    const mine = allOverrides.get(reviewUser.id) ?? [];
    check("review lists extra privileges", mine.some((o) => o.permission === "visit.delete" && o.granted) && mine.some((o) => o.permission === "hmo.void" && o.granted), mine);
    check("review lists removed privileges", mine.some((o) => o.permission === "payment.add" && !o.granted), mine);
    check("sensitive list is part of the catalog", perms.SENSITIVE_PERMISSIONS.every((p) => perms.ALL_PERMISSIONS.includes(p)));
    check("visit.delete and hmo.void count as sensitive", perms.SENSITIVE_PERMISSIONS.includes("visit.delete") && perms.SENSITIVE_PERMISSIONS.includes("hmo.void"));
    const audit = await import("../src/lib/db/audit");
    await audit.logAudit({ action: "user.access_changed", entityType: "user", entityId: reviewUser.id, summary: "Test Runner changed the access of ZZ Roles Review: added: x", actor });
    const changed = await audit.lastAccessChanges();
    check("last access change is found with who made it", changed.get(reviewUser.id)?.by === "Test Runner", changed.get(reviewUser.id));
  } finally {
    await cleanup();
  }

  console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
