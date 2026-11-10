import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Commission audit: checks the clinic's "LIST - COMMISSION" sheet (CSV)
 * against what the app would pay today. READ-ONLY: it only reads the
 * dentists, tiers, rates and procedures, and never writes anything.
 *
 *   npx tsx scripts/audit-commission-sheet.ts "LIST - COMMISSION.csv" [out.csv]
 *
 * For every dentist on the sheet and every procedure the sheet gives a
 * rate for (cash percentage, HMO percentage, HMO peso value), it asks the
 * app's own commission code (`resolveRateSetting` + `computeCommission`,
 * the same functions used when a visit is saved) what a sample payment
 * would earn, and compares the two:
 *
 *   OK         the app pays what the sheet says
 *   MISSING    the sheet gives a rate, the app pays nothing (no tier rate,
 *              or the procedure is not on the price list)
 *   DIFFERENT  both pay, but not the same amount
 *   EXTRA      the sheet gives no rate, the app pays something (info only)
 *
 * It also lists the price-list procedures that have no tier rate at all,
 * and individual rates that override a tier.
 */

import { readFileSync, writeFileSync } from "node:fs";
import Papa from "papaparse";

// Sample payment: ₱11,200 net -> ₱10,000 commission base (÷ 1.12); Ortho
// uses the full ₱11,200.
const SAMPLE_NET = 11200;
const CASH = "Cash";
const HMO = "Maxicare";

/** Sheet name -> price-list name(s). A name not listed here must match a
 * price-list name exactly (ignoring case and punctuation). */
const ALIASES: Record<string, string[]> = {
  op: [
    "Oral Prophylaxis (MILD)",
    "Oral Prophylaxis (MODERATE)",
    "Oral Prophylaxis (SEVERE)",
    "Oral Prophylaxis (PEDIA)",
  ],
  pf: [
    "Permanent Filling (Posterior)",
    "Permanent Filling (Anterior)",
    "Permanent Filling - Per Surface (Voco)",
  ],
  tf: ["Temporary Filling"],
  simpleextraction: ["Simple Tooth Extraction"],
  flouride: ["Fluoride (Pedia Only)", "Flouride Varnish"],
  orthoinstall: ["Ortho Package (Simple Case)", "Ortho Package (Complex Case)"],
  lossbracket: ["Lost Bracket"],
  biteplane: ["Bite Raiser per arch"],
  retainers: ["Retainers (Hawley)-per arch", "Retainers (Invisible)-per arch"],
  complicatedextraction: ["Complicated Tooth Extraction w/ suture (silk)"],
  teethwhitening: ["Teeth Whitening (3 cycles)"],
  directcompositeveneers: [
    "Veneers (Direct composite) per tooth (warranty of 1 visit)",
  ],
  rootcanaltreatmentanteriorposterior: [
    "Root Canal Treatment (Anterior)",
    "Root Canal Treatment (Posterior)",
  ],
  postcoreperpost: ["Post & Core (per post)"],
  flexibledentures: ["Flexible Denture - Partial (Per Arch) 1-8 pontics"],
  plasticdentures: [
    "Plastic Denture - Partial (Per Arch) 1-3 pontics",
    "Plastic Denture - Partial 4 pontics up to full",
    "Plastic Denture - Complete",
  ],
  ivocapdentures: ["Denture (IVOCAP) - Per Arch"],
  jacketcrownpfm: ["Jacket Crown (PFM)- Samurai Europe made"],
  jacketcrownpfmtilite: [
    "Jacket Crown (PFM)-Tilite (Samurai) (Europe made)",
    "Jacket Crown (PFM)-Tilite (Swiss or JR)",
  ],
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

type SheetEntry = {
  dentist: string;
  sheetName: string;
  mode: "cash" | "hmo";
  kind: "percent" | "peso" | "none";
  value: number;
};

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const squash = (value: string) => value.replace(/\s+/g, " ").trim();
const cleanName = (value: string) => squash(value).replace(/\s*\($/, "");

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[%\s₱,]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Reads the sheet: blocks of 5 columns per dentist, a name row, a
 * "Procedure- CASH PAYING | Percentage | HMO" row, then the procedures. */
function parseSheet(csv: string): SheetEntry[] {
  const rows = Papa.parse<string[]>(csv, { skipEmptyLines: false }).data;
  const entries: SheetEntry[] = [];
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c + 3 < (rows[r]?.length ?? 0); c += 5) {
      const name = squash(rows[r][c] ?? "");
      const next = rows[r + 1]?.[c] ?? "";
      if (!name || !/^procedure/i.test(next)) continue;
      let pesoSection = false;
      // The sheet merges a rate cell over the rows below it, so a blank
      // rate means "same as the rate above" until the next rate appears.
      let cashRate: number | null = null;
      let hmoRate: number | null = null;
      for (let i = r + 2; i < rows.length; i++) {
        const row = rows[i];
        const cash = squash(row[c] ?? "");
        const pct = parseNumber(row[c + 1] ?? "");
        const hmoName = squash(row[c + 2] ?? "");
        const hmoValue = parseNumber(row[c + 3] ?? "");
        if (!cash && !hmoName) break;
        if (cash) {
          if (pct !== null) cashRate = pct;
          entries.push({
            dentist: name,
            sheetName: cleanName(cash),
            mode: "cash",
            kind: cashRate && cashRate > 0 ? "percent" : "none",
            value: cashRate ?? 0,
          });
        }
        if (hmoName) {
          if (/^peso value/i.test(hmoName)) {
            pesoSection = true;
          } else if (pesoSection) {
            entries.push({
              dentist: name,
              sheetName: cleanName(hmoName),
              mode: "hmo",
              kind: hmoValue && hmoValue > 0 ? "peso" : "none",
              value: hmoValue ?? 0,
            });
          } else {
            if (hmoValue !== null) hmoRate = hmoValue;
            entries.push({
              dentist: name,
              sheetName: cleanName(hmoName),
              mode: "hmo",
              kind: hmoRate && hmoRate > 0 ? "percent" : "none",
              value: hmoRate ?? 0,
            });
          }
        }
      }
    }
  }
  return entries;
}

type Row = {
  dentist: string;
  tier: string;
  sheetProcedure: string;
  appProcedure: string;
  mode: string;
  sheet: string;
  app: string;
  status: "OK" | "MISSING" | "DIFFERENT" | "EXTRA" | "NOT ON PRICE LIST";
};

const money = (value: number) => `₱${value.toFixed(2)}`;

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx scripts/audit-commission-sheet.ts "LIST - COMMISSION.csv" [out.csv]');
    process.exit(1);
  }
  const outFile = process.argv[3] ?? "commission-audit.csv";
  const sheet = parseSheet(readFileSync(file, "utf8"));

  const { db } = await import("../src/lib/db/client");
  const { procedures, users } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { getDentistTierMap, getTierRateMap } = await import("../src/lib/db/commission-tiers");
  const { getCommissionRateMap } = await import("../src/lib/db/commission-rates");
  const { resolveRateSetting } = await import("../src/lib/cashflow/commission-tiers");
  const { computeCommission, commissionBase, DEFAULT_COMMISSION_PERCENT } = await import(
    "../src/lib/cashflow/pricing"
  );

  const [dentists, procs, tierOf, tierRates, individual] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "dentist")),
    db.select({ id: procedures.id, name: procedures.name }).from(procedures),
    getDentistTierMap(),
    getTierRateMap(),
    getCommissionRateMap(),
  ]);
  const procByNorm = new Map(procs.map((p) => [norm(p.name), p]));
  const dentistByNorm = new Map(dentists.map((d) => [norm(d.name), d]));

  /** What the app pays for one sample payment. */
  function appAmount(dentistId: string, procId: string, procName: string, mode: "cash" | "hmo") {
    const tier = tierOf.get(dentistId);
    const rate = resolveRateSetting({
      individual: individual.get(`${dentistId}:${procId}`),
      tierRate: tier === undefined ? undefined : tierRates.get(`${tier}:${procId}`),
    });
    return computeCommission(SAMPLE_NET, mode === "hmo" ? HMO : CASH, rate, {
      procedureName: procName,
      defaultPercent: DEFAULT_COMMISSION_PERCENT,
    });
  }

  const out: Row[] = [];
  const unknownDentists = new Set<string>();
  for (const entry of sheet) {
    const dentist = dentistByNorm.get(norm(entry.dentist));
    if (!dentist) {
      unknownDentists.add(entry.dentist);
      continue;
    }
    const tier = tierOf.get(dentist.id);
    const key = norm(entry.sheetName);
    const names = ALIASES[key] ?? [entry.sheetName];
    const matched = names
      .map((name) => procByNorm.get(norm(name)))
      .filter((p): p is { id: string; name: string } => Boolean(p));
    const base = (name: string) => commissionBase(SAMPLE_NET, name);
    const expected = (name: string) =>
      entry.kind === "percent"
        ? Math.round(base(name) * entry.value) / 100
        : entry.kind === "peso"
          ? entry.value
          : 0;
    const sheetText =
      entry.kind === "percent"
        ? `${entry.value}%`
        : entry.kind === "peso"
          ? money(entry.value)
          : "no rate";
    if (matched.length === 0) {
      if (entry.kind !== "none") {
        out.push({
          dentist: dentist.name,
          tier: tier ? `Tier ${tier}` : "no tier",
          sheetProcedure: entry.sheetName,
          appProcedure: "(not on the price list)",
          mode: entry.mode.toUpperCase(),
          sheet: sheetText,
          app: "—",
          status: "NOT ON PRICE LIST",
        });
      }
      continue;
    }
    for (const proc of matched) {
      const want = expected(proc.name);
      const got = appAmount(dentist.id, proc.id, proc.name, entry.mode);
      const status: Row["status"] =
        entry.kind === "none"
          ? got > 0
            ? "EXTRA"
            : "OK"
          : Math.abs(want - got) < 0.01
            ? "OK"
            : got === 0
              ? "MISSING"
              : "DIFFERENT";
      if (entry.kind === "none" && got === 0) continue; // nothing to report
      const base2 = base(proc.name);
      out.push({
        dentist: dentist.name,
        tier: tier ? `Tier ${tier}` : "no tier",
        sheetProcedure: entry.sheetName,
        appProcedure: proc.name,
        mode: entry.mode.toUpperCase(),
        sheet: sheetText,
        app: got === 0 ? "pays nothing" : `${money(got)} (${((got / base2) * 100).toFixed(2)}% of ${money(base2)})`,
        status,
      });
    }
  }

  // Report ------------------------------------------------------------
  const count = (s: Row["status"]) => out.filter((r) => r.status === s).length;
  console.log(`\nSheet: ${file}`);
  console.log(`Sheet entries read: ${sheet.length} (${new Set(sheet.map((s) => s.dentist)).size} dentists)`);
  if (unknownDentists.size > 0) {
    console.log(`Dentists on the sheet with no matching dentist account: ${[...unknownDentists].join(", ")}`);
  }
  console.log(
    `OK ${count("OK")} · MISSING ${count("MISSING")} · DIFFERENT ${count("DIFFERENT")} · NOT ON PRICE LIST ${count("NOT ON PRICE LIST")} · EXTRA (info) ${count("EXTRA")}\n`,
  );
  const show = (title: string, status: Row["status"]) => {
    const rows = out.filter((r) => r.status === status);
    if (rows.length === 0) return;
    console.log(`== ${title} (${rows.length})`);
    console.table(
      rows.map((r) => ({
        Dentist: r.dentist,
        Tier: r.tier,
        "Sheet procedure": r.sheetProcedure,
        "App procedure": r.appProcedure,
        Paid: r.mode,
        "Sheet says": r.sheet,
        "App pays": r.app,
      })),
    );
  };
  show("MISSING: the sheet has a rate, the app pays nothing", "MISSING");
  show("DIFFERENT: the app pays another amount", "DIFFERENT");
  show("NOT ON THE PRICE LIST: add the procedure first", "NOT ON PRICE LIST");

  const rated = new Set<string>();
  for (const key of tierRates.keys()) rated.add(key.split(":")[1]);
  const withoutTier = procs.filter((p) => !rated.has(p.id)).map((p) => p.name).sort();
  console.log(`== Price-list procedures with NO tier rate (${withoutTier.length}): they earn nothing unless an individual rate or the default % applies`);
  console.log(withoutTier.map((n) => `  - ${n}`).join("\n"));

  const overrides = [...individual.keys()].filter((k) => tierOf.has(k.split(":")[0]));
  if (overrides.length > 0) {
    console.log(`\n== Individual rates on dentists who also have a tier (${overrides.length}): they win over the tier`);
    for (const key of overrides) {
      const [dentistId, procId] = key.split(":");
      console.log(
        `  - ${dentists.find((d) => d.id === dentistId)?.name} · ${procs.find((p) => p.id === procId)?.name}: ${JSON.stringify(individual.get(key))}`,
      );
    }
  }
  console.log(`\nDefault % for procedures with no rate: ${DEFAULT_COMMISSION_PERCENT ?? "not set (they earn nothing)"}`);

  const csvLines = [
    ["Dentist", "Tier", "Sheet procedure", "App procedure", "Paid", "Sheet says", "App pays", "Status"],
    ...out.map((r) => [r.dentist, r.tier, r.sheetProcedure, r.appProcedure, r.mode, r.sheet, r.app, r.status]),
  ];
  writeFileSync(outFile, Papa.unparse(csvLines));
  console.log(`\nFull list written to ${outFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
