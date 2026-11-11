import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local", override: true });

/**
 * Payment methods: the built-in list (Asiancare included), the rules for a new
 * name, and adding / hiding / removing a method in the database (use a TEST
 * database).
 */
async function main() {
  const { sql } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db/client");
  const pm = await import("../src/lib/cashflow/payment-methods");
  const pricing = await import("../src/lib/cashflow/pricing");
  const dayEnd = await import("../src/lib/cashflow/day-end");
  const lib = await import("../src/lib/db/payment-methods");
  const perms = await import("../src/lib/auth/permissions");

  let fails = 0;
  const check = (name: string, ok: boolean, extra?: unknown) => {
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`);
  };

  // ───────── built-in list ─────────
  pm.setCustomPaymentMethods([]);
  check("Asiancare is a built-in HMO", pm.isHmoPayment("Asiancare") && pm.hmoPaymentNames().includes("Asiancare"));
  check("HMO check ignores capitals and spaces", pm.isHmoPayment("  asiancare ") && pricing.isHmoPayment("MAXICARE"));
  check("Cash and GCash are not HMOs", !pm.isHmoPayment("Cash") && !pm.isHmoPayment("GCash") && !pm.isHmoPayment(""));
  check("7 built-in HMOs", pm.hmoPaymentNames().length === 7, pm.hmoPaymentNames());
  check("17 built-in methods, all offered", pm.paymentTypeOptions().length === 17, pm.paymentTypeOptions().length);
  check("Asiancare is offered on new visits", pm.paymentTypeOptions().includes("Asiancare"));
  check("the list is in name order", JSON.stringify(pm.paymentTypeNames()) === JSON.stringify([...pm.paymentTypeNames()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))));
  check("hmoNameFor gives the proper spelling", dayEnd.hmoNameFor("asiancare") === "Asiancare");
  check("Asiancare has its own Day end column", dayEnd.breakdownColumnFor("Asiancare") === "Asiancare");
  check("POS still goes to the POS columns", dayEnd.breakdownColumnFor("POS (MAYA) - DEBIT") === "POS - Debit" && dayEnd.breakdownColumnFor("POS (GHL) - CREDIT") === "POS - Credit");
  check("a name that only starts with 'pos' is not a POS machine", dayEnd.breakdownColumnFor("Posh Dental") === dayEnd.BREAKDOWN_OTHER);
  check("an unknown method falls to Other", dayEnd.breakdownColumnFor("Mystery Card") === dayEnd.BREAKDOWN_OTHER);

  // ───────── name rules ─────────
  const ok = (s: string) => pm.checkNewPaymentMethodName(s);
  check("a normal name is accepted and tidied", (() => { const r = ok("  Pacific   Cross "); return r.ok && r.name === "Pacific Cross"; })());
  check("empty is refused", !ok("   ").ok);
  check("one letter is refused", !ok("A").ok);
  check("41 characters are refused", !ok("x".repeat(41)).ok && ok("x".repeat(40)).ok);
  check("odd characters are refused", !ok("<b>Evil</b>").ok && !ok("Pay;DROP").ok);
  check("a built-in name is refused, ignoring capitals", !ok("cash").ok && !ok("ASIANCARE").ok);
  check("a Day end reserved name is refused", !ok("Elite").ok && !ok("Other / not stated").ok && !ok("POS - Debit").ok);
  check("accented and punctuated names are fine", ok("Cigna & Co. (PH)").ok && ok("Caja de Ahorro-1").ok);

  // ───────── the new privilege ─────────
  check("payment_method.manage exists", perms.ALL_PERMISSIONS.includes("payment_method.manage" as never));
  check("owner and admin have it by default; dentist and staff do not",
    perms.roleDefaults("owner").includes("payment_method.manage" as never) &&
    perms.roleDefaults("admin").includes("payment_method.manage" as never) &&
    !perms.roleDefaults("dentist").includes("payment_method.manage" as never) &&
    !perms.roleDefaults("staff").includes("payment_method.manage" as never));
  check("the superuser has it", perms.roleDefaults("superuser").includes("payment_method.manage" as never));

  // ───────── database ─────────
  const MARK = "ZZ PM Test";
  const cleanup = async () => {
    await db.execute(sql`delete from payment_methods where name like ${MARK + "%"}`);
    await db.execute(sql`delete from transactions where id like 'T-PM-%'`);
  };
  await cleanup();
  pm.setCustomPaymentMethods([]);

  try {
    const added = await lib.addPaymentMethod({ name: `${MARK} Health`, kind: "hmo", actorName: "Test Runner" });
    check("an HMO is added", added.ok, added);
    check("it is known right away on this server", pm.isHmoPayment(`${MARK} Health`) && pm.hmoPaymentNames().includes(`${MARK} Health`));
    check("it is offered on new visits", pm.paymentTypeOptions().includes(`${MARK} Health`));
    check("it gets its own Day end column", dayEnd.breakdownColumnFor(`${MARK} health`) === `${MARK} Health`);

    const dup = await lib.addPaymentMethod({ name: `${MARK.toLowerCase()} HEALTH`, kind: "hmo", actorName: "Test Runner" });
    check("the same name with other capitals is refused", !dup.ok, dup);
    const builtInDup = await lib.addPaymentMethod({ name: "maxicare", kind: "hmo", actorName: "Test Runner" });
    check("a built-in name is refused", !builtInDup.ok, builtInDup);
    const badKind = await lib.addPaymentMethod({ name: `${MARK} Bad`, kind: "weird" as never, actorName: "Test Runner" });
    check("an unknown kind is refused", !badKind.ok, badKind);

    const wallet = await lib.addPaymentMethod({ name: `${MARK} Wallet`, kind: "other", actorName: "Test Runner" });
    check("an e-wallet is added and is not an HMO", wallet.ok && !pm.isHmoPayment(`${MARK} Wallet`) && pm.paymentTypeOptions().includes(`${MARK} Wallet`), wallet);

    const rows = await lib.listCustomPaymentMethods();
    const hmoRow = rows.find((row) => row.name === `${MARK} Health`)!;
    const walletRow = rows.find((row) => row.name === `${MARK} Wallet`)!;
    check("stored with who added it", hmoRow?.createdByName === "Test Runner" && hmoRow.kind === "hmo" && hmoRow.active, hmoRow);

    // hide / show
    const hidden = await lib.setPaymentMethodActive(walletRow.id!, false);
    check("a method can be hidden", hidden.ok, hidden);
    check("a hidden method is not offered on new visits", !pm.paymentTypeOptions().includes(`${MARK} Wallet`));
    check("…but stays offered on a record that already has it", pm.paymentTypeOptions(`${MARK} Wallet`).includes(`${MARK} Wallet`));
    check("…and is still listed for filters and history", pm.paymentTypeNames().includes(`${MARK} Wallet`));
    const hiddenHmo = await lib.setPaymentMethodActive(hmoRow.id!, false);
    check("a hidden HMO still counts as an HMO", hiddenHmo.ok && pm.isHmoPayment(`${MARK} Health`) && pm.hmoPaymentNames().includes(`${MARK} Health`));
    check("a hidden method keeps its Day end column when it has money", (() => {
      const report = { date: "2026-11-11", rows: [{ kind: "payment", date: "2026-11-11", visitId: "v", patientName: "p", dentist: "d", procedure: "x", paymentType: `${MARK} Health`, amountPaid: 500, vatExclusive: 0, vatAmount: 0, invoiceNumber: "", remarks: "", merchantFee: 0, withholdingTax: 0, netCollection: 500, isReservation: false, hmo: "", hmoAccountNumber: "", loaNumber: "", loeNumber: "", toothNumbers: "", hmoBilled: 0 }] } as never;
      const summary = dayEnd.summarizeDayEnd(report);
      return summary.breakdown.some((item) => item.label === `${MARK} Health` && item.amount === 500) && summary.totals.hmo === 500;
    })());
    const shownAgain = await lib.setPaymentMethodActive(walletRow.id!, true);
    check("a method can be shown again", shownAgain.ok && pm.paymentTypeOptions().includes(`${MARK} Wallet`));
    const missing = await lib.setPaymentMethodActive("00000000-0000-0000-0000-000000000000", true);
    check("a method that no longer exists is reported", !missing.ok);

    // remove: unused vs used
    const used = await lib.listPaymentMethodsWithUse();
    check("the management list has built-in and added methods with use counts", used.ready && used.methods.length === 19 && used.methods.find((m) => m.name === "Cash")?.builtIn === true && used.methods.find((m) => m.name === `${MARK} Wallet`)?.uses === 0, used.methods.length);

    await db.execute(sql`insert into transactions (id, visit_id, date, month, year, transaction_type, patient_name, procedure, amount_paid, net_collection, payment_type) values ('T-PM-1', 'T-PM-V1', '2026-11-11', 11, 2026, 'Visit', ${MARK}, 'Test', 0, 0, ${`${MARK} Wallet`})`);
    const refused = await lib.deletePaymentMethod(walletRow.id!);
    check("a method used on a visit can't be removed", !refused.ok && pm.paymentTypeNames().includes(`${MARK} Wallet`), refused);
    const counted = await lib.listPaymentMethodsWithUse();
    check("the use count shows it", counted.methods.find((m) => m.name === `${MARK} Wallet`)?.uses === 1);
    await db.execute(sql`delete from transactions where id = 'T-PM-1'`);
    const removed = await lib.deletePaymentMethod(walletRow.id!);
    check("an unused method is removed", removed.ok && !pm.paymentTypeNames().includes(`${MARK} Wallet`), removed);
    const again = await lib.deletePaymentMethod(walletRow.id!);
    check("removing it twice is reported", !again.ok);

    // a second server learns of it through ensure
    pm.setCustomPaymentMethods([]);
    await lib.ensurePaymentMethods({ force: true });
    check("a server that didn't know picks it up from the database", pm.isHmoPayment(`${MARK} Health`));
  } finally {
    await cleanup();
    pm.setCustomPaymentMethods([]);
  }

  console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
