import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Tier-sheet audit: checks the clinic's "LIST - TIER" sheet (CSV) against
 * what the app pays today. READ-ONLY: it never writes anything.
 *
 *   npx tsx scripts/audit-tier-sheet.ts "LIST - TIER 1.csv" [out.csv]
 *
 * For every dentist that has a tier, and every procedure on the sheet, it
 * asks the app's own commission code (`resolveRateSetting` +
 * `computeCommission`, the same code used when a visit is saved) what a
 * sample cash payment earns, and compares it with the sheet:
 *
 *   OK                 the app pays what the sheet says
 *   MISSING            the sheet has a rate, the app pays nothing
 *   DIFFERENT          both pay, but not the same amount
 *   NOT ON PRICE LIST  the sheet procedure does not exist in the app yet
 *
 * It also lists price-list procedures the sheet does not mention (they earn
 * nothing), dentists whose tier differs from the sheet, and individual
 * rates that override a tier.
 *
 * How the sheet is read: it is a merged-cell sheet. A rate written once
 * applies to every row below it until the next rate, and a rate with empty
 * cells to its right applies to those tiers too (Consultation 10% = all
 * tiers; "25% | 20% | (empty)" = Tier 3 25%, Tier 2 and Tier 1 20%).
 */

import { readFileSync, writeFileSync } from "node:fs";
import Papa from "papaparse";

const SAMPLE_NET = 11200; // ₱10,000 commission base (÷ 1.12); Ortho uses ₱11,200.

/** Sheet name -> price-list name(s); anything else must match exactly. */
const ALIASES: Record<string, string[]> = {
  op: ["Oral Prophylaxis (MILD)", "Oral Prophylaxis (MODERATE)", "Oral Prophylaxis (SEVERE)", "Oral Prophylaxis (PEDIA)"],
  pf: ["Permanent Filling (Posterior)", "Permanent Filling (Anterior)", "Permanent Filling - Per Surface (Voco)"],
  tf: ["Temporary Filling"],
  simpleextraction: ["Simple Tooth Extraction"],
  flouride: ["Fluoride (Pedia Only)", "Flouride Varnish"],
  orthoinstall: ["Ortho Package (Simple Case)", "Ortho Package (Complex Case)"],
  lossbracket: ["Lost Bracket"],
  biteplane: ["Bite Raiser per arch"],
  retainers: ["Retainers (Hawley)-per arch", "Retainers (Invisible)-per arch"],
  complicatedextraction: ["Complicated Tooth Extraction w/ suture (silk)"],
  teethwhitening: ["Teeth Whitening (3 cycles)"],
  directcompositeveneers: ["Veneers (Direct composite) per tooth (warranty of 1 visit)"],
  rootcanaltreatmentanteriorposterior: ["Root Canal Treatment (Anterior)", "Root Canal Treatment (Posterior)"],
  postcoreperpost: ["Post & Core (per post)"],
  flexibledentures: ["Flexible Denture - Partial (Per Arch) 1-8 pontics"],
  plasticdentures: [
    "Plastic Denture - Partial (Per Arch) 1-3 pontics",
    "Plastic Denture - Partial 4 pontics up to full",
    "Plastic Denture - Complete",
  ],
  ivocapdentures: ["Denture (IVOCAP) - Per Arch"],
  jacketcrownpfm: ["Jacket Crown (PFM)- Samurai Europe made"],
  jacketcrownpfmtilite: ["Jacket Crown (PFM)-Tilite (Samurai) (Europe made)", "Jacket Crown (PFM)-Tilite (Swiss or JR)"],
  jacketcrownemax: ["Jacket Crown (Emax)- Samurai (Europe made)"],
  jacketcrownzirconia: ["Jacket Crown (Zirconia)- Samurai"],
  veneersemax: ["Veneers (Emax)-Samurai Europe made"],
  veneerszirconia: ["Veneers (Zirconia)-Samurai Europe made"],
  onlayceramage: ["Onlay Ceramage (Samurai)"],
  denturesrepair: ["Denture Repair"],
  surgery: ["Wisdom Tooth Removal"],
  panoramicxray: ["Panoramic Xray w/ hard copy"],
  periapicalxray: ["Periapical Xray"],
};

/** Added by the clinic after the sheet was made (9 Nov 2026): same as the
 * basic 10% procedures, every tier. */
const EXTRA_EXPECTED = [{ name: "Pedia Handling Fee", rates: [10, 10, 10] }];

type Rate = { kind: "percent" | "peso"; value: number };
type SheetRow = { name: string; tiers: Record<1 | 2 | 3, Rate | null> };

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const squash = (value: string) => value.replace(/\s+/g, " ").trim();

function parseRate(raw: string): Rate | null {
  const text = squash(raw);
  if (!text) return null;
  const value = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(value)) return null;
  return /php|₱/i.test(text) ? { kind: "peso", value } : { kind: "percent", value };
}

function parseSheet(csv: string): { rows: SheetRow[]; tierDentists: Record<number, string> } {
  const grid = Papa.parse<string[]>(csv, { skipEmptyLines: false }).data;
  const header = grid.findIndex((row) => row.some((cell) => /tier\s*3/i.test(cell)));
  if (header < 0) throw new Error("Could not find the TIER 3 / TIER 2 / TIER 1 header row.");
  const names = grid[header + 1] ?? [];
  const tierDentists: Record<number, string> = { 3: squash(names[2] ?? ""), 2: squash(names[3] ?? ""), 1: squash(names[4] ?? "") };
  const state: Record<1 | 2 | 3, Rate | null> = { 3: null, 2: null, 1: null };
  const rows: SheetRow[] = [];
  for (let i = header + 2; i < grid.length; i++) {
    const name = squash(grid[i][1] ?? "");
    if (!name) continue;
    const c3 = parseRate(grid[i][2] ?? "");
    const c2 = parseRate(grid[i][3] ?? "");
    const c1 = parseRate(grid[i][4] ?? "");
    if (c3) state[3] = c3;
    if (c2) state[2] = c2;
    if (c1) state[1] = c1;
    // Cells to the right of a rate that start a new group are merged with it.
    if (c3 && !c2 && !c1) {
      state[2] = c3;
      state[1] = c3;
    } else if (c3 && c2 && !c1) {
      state[1] = c2;
    } else if (!c3 && c2 && !c1) {
      state[1] = c2;
    }
    rows.push({ name: name.replace(/\(per post$/i, "(per post)"), tiers: { 3: state[3], 2: state[2], 1: state[1] } });
  }
  return { rows, tierDentists };
}

type Out = {
  dentist: string;
  tier: string;
  sheetProcedure: string;
  appProcedure: string;
  sheet: string;
  app: string;
  status: "OK" | "MISSING" | "DIFFERENT" | "NOT ON PRICE LIST";
};
const money = (value: number) => `₱${value.toFixed(2)}`;
const rateText = (rate: Rate | null) => (!rate ? "no rate" : rate.kind === "peso" ? money(rate.value) : `${rate.value}%`);

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx scripts/audit-tier-sheet.ts "LIST - TIER 1.csv" [out.csv]');
    process.exit(1);
  }
  const outFile = process.argv[3] ?? "tier-audit.csv";
  const { rows: sheet, tierDentists } = parseSheet(readFileSync(file, "utf8"));

  const { db } = await import("../src/lib/db/client");
  const { procedures, users } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { getDentistTierMap, getTierRateMap } = await import("../src/lib/db/commission-tiers");
  const { getCommissionRateMap } = await import("../src/lib/db/commission-rates");
  const { resolveRateSetting } = await import("../src/lib/cashflow/commission-tiers");
  const { computeCommission, commissionBase, DEFAULT_COMMISSION_PERCENT } = await import("../src/lib/cashflow/pricing");

  const [dentists, procs, tierOf, tierRates, individual] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "dentist")),
    db.select({ id: procedures.id, name: procedures.name }).from(procedures),
    getDentistTierMap(),
    getTierRateMap(),
    getCommissionRateMap(),
  ]);
  const procByNorm = new Map(procs.map((p) => [norm(p.name), p]));
  const tiered = dentists.filter((d) => tierOf.has(d.id));

  const appPays = (dentistId: string, procId: string, procName: string) => {
    const tier = tierOf.get(dentistId);
    const rate = resolveRateSetting({
      individual: individual.get(`${dentistId}:${procId}`),
      tierRate: tier === undefined ? undefined : tierRates.get(`${tier}:${procId}`),
    });
    return computeCommission(SAMPLE_NET, "Cash", rate, { procedureName: procName, defaultPercent: DEFAULT_COMMISSION_PERCENT });
  };

  const expected = [
    ...sheet.map((row) => ({ sheetName: row.name, names: ALIASES[norm(row.name)] ?? [row.name], tiers: row.tiers })),
    ...EXTRA_EXPECTED.map((extra) => ({
      sheetName: `${extra.name} (added 9 Nov)`,
      names: [extra.name],
      tiers: { 3: { kind: "percent", value: extra.rates[0] }, 2: { kind: "percent", value: extra.rates[1] }, 1: { kind: "percent", value: extra.rates[2] } } as SheetRow["tiers"],
    })),
  ];

  const out: Out[] = [];
  const covered = new Set<string>();
  for (const row of expected) {
    const matched = row.names.map((n) => procByNorm.get(norm(n))).filter((p): p is { id: string; name: string } => Boolean(p));
    matched.forEach((p) => covered.add(p.id));
    if (matched.length === 0) {
      out.push({ dentist: "(all)", tier: "all", sheetProcedure: row.sheetName, appProcedure: "(not on the price list)", sheet: `T3 ${rateText(row.tiers[3])} / T2 ${rateText(row.tiers[2])} / T1 ${rateText(row.tiers[1])}`, app: "—", status: "NOT ON PRICE LIST" });
      continue;
    }
    for (const dentist of tiered) {
      const tier = tierOf.get(dentist.id) as 1 | 2 | 3;
      const rate = row.tiers[tier];
      for (const proc of matched) {
        const base = commissionBase(SAMPLE_NET, proc.name);
        const want = !rate ? 0 : rate.kind === "peso" ? rate.value : Math.round(base * rate.value) / 100;
        const got = appPays(dentist.id, proc.id, proc.name);
        out.push({
          dentist: dentist.name,
          tier: `Tier ${tier}`,
          sheetProcedure: row.sheetName,
          appProcedure: proc.name,
          sheet: rateText(rate),
          app: got === 0 ? "pays nothing" : `${money(got)} (${((got / base) * 100).toFixed(2)}%)`,
          status: Math.abs(want - got) < 0.01 ? "OK" : got === 0 ? "MISSING" : "DIFFERENT",
        });
      }
    }
  }

  const count = (s: Out["status"]) => out.filter((r) => r.status === s).length;
  console.log(`\nTier sheet: ${file}`);
  console.log(`Sheet tiers: T3 = ${tierDentists[3]} | T2 = ${tierDentists[2]} | T1 = ${tierDentists[1]}`);
  console.log(`App tiers:   ${tiered.map((d) => `${d.name} = T${tierOf.get(d.id)}`).join("; ")}`);
  console.log(`Sheet rows: ${sheet.length} (+${EXTRA_EXPECTED.length} added) · dentists with a tier: ${tiered.length}`);
  console.log(`OK ${count("OK")} · MISSING ${count("MISSING")} · DIFFERENT ${count("DIFFERENT")} · NOT ON PRICE LIST ${count("NOT ON PRICE LIST")}\n`);

  const show = (title: string, status: Out["status"], collapse: boolean) => {
    const list = out.filter((r) => r.status === status);
    if (list.length === 0) return;
    console.log(`== ${title} (${list.length})`);
    const seen = new Set<string>();
    for (const r of list) {
      const key = collapse ? `${r.sheetProcedure}|${r.appProcedure}|${r.tier}|${r.sheet}|${r.app}` : `${r.dentist}|${r.sheetProcedure}|${r.appProcedure}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  ${collapse ? r.tier : r.dentist} · ${r.sheetProcedure} -> ${r.appProcedure} · sheet ${r.sheet} · app ${r.app}`);
    }
  };
  show("NOT ON THE PRICE LIST (add the procedure, then its tier rate)", "NOT ON PRICE LIST", false);
  show("MISSING (sheet has a rate, the app pays nothing)", "MISSING", true);
  show("DIFFERENT (the app pays another amount)", "DIFFERENT", false);

  const notOnSheet = procs.filter((p) => !covered.has(p.id)).map((p) => p.name).sort();
  console.log(`\n== On the price list but NOT on the tier sheet (${notOnSheet.length}): they earn commission only if a rate is set in the app`);
  for (const name of notOnSheet) {
    const hasRate = [1, 2, 3].some((t) => tierRates.has(`${t}:${procs.find((p) => p.name === name)?.id}`));
    console.log(`  - ${name}${hasRate ? "  (has a tier rate in the app)" : ""}`);
  }

  const overrides = [...individual.keys()].filter((k) => tierOf.has(k.split(":")[0]));
  if (overrides.length > 0) {
    console.log(`\n== Individual rates on dentists who have a tier (${overrides.length}); they beat the tier, the sheet has none`);
    for (const key of overrides) {
      const [dentistId, procId] = key.split(":");
      console.log(`  - ${dentists.find((d) => d.id === dentistId)?.name} · ${procs.find((p) => p.id === procId)?.name}: ${JSON.stringify(individual.get(key))}`);
    }
  }
  writeFileSync(outFile, Papa.unparse([["Dentist", "Tier", "Sheet procedure", "App procedure", "Sheet says", "App pays", "Status"], ...out.map((r) => [r.dentist, r.tier, r.sheetProcedure, r.appProcedure, r.sheet, r.app, r.status])]));
  console.log(`\nFull list written to ${outFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
