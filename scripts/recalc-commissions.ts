import { config } from "dotenv";
config({ path: ".env.local", override: true });

/**
 * Works out every saved procedure line's commission again from today's
 * rates and rules (the same as Commissions -> Recalculate all commissions),
 * checked and approved visits included, and writes one audit-trail line.
 *
 *   yarn db:recalc-commissions            recalculate and save
 *   yarn db:recalc-commissions --dry-run  only show what would change
 *
 * Run once after installing v0.10.0 (staging first, then production).
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { recalculateCommissions } = await import("../src/lib/db/commission-recalc");
  const { logAudit } = await import("../src/lib/db/audit");

  const result = await recalculateCommissions({}, { dryRun });
  console.log(
    `${dryRun ? "[dry run] " : ""}${result.lines} lines checked, ${result.changed} changed, ${result.linked} linked by name, total change ${result.difference >= 0 ? "+" : ""}${result.difference.toFixed(2)}`,
  );
  for (const line of result.samples) {
    console.log(`  ${line.date}  ${line.procedure.padEnd(32)} ${line.from.toFixed(2).padStart(10)} -> ${line.to.toFixed(2).padStart(10)}`);
  }
  if (!dryRun) {
    await logAudit({
      action: "commission.recalculated",
      entityType: "commission",
      summary: `Every saved commission recalculated by the db:recalc-commissions script: ${result.lines} lines checked, ${result.changed} changed (${result.difference >= 0 ? "+" : "−"}₱${Math.abs(result.difference).toFixed(2)})`,
      actor: { userId: null, name: "System (recalculation script)" },
    });
  }
  process.exit(0);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
