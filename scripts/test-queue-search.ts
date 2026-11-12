/**
 * Queue search: every typed word must be found in the visit's text, in any
 * order, ignoring capitals and accents.
 * Run: npx tsx scripts/test-queue-search.ts
 */
import {
  NO_FILTERS,
  buildSearchText,
  filtersActive,
  matchesFilters,
  matchesSearch,
  normalizeSearch,
  searchTerms,
} from "../src/lib/cashflow/queue-search";

let failed = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}

const visit = buildSearchText([
  "Santos, María Cruz",
  "Oral prophylaxis",
  "Composite filling",
  "Dr. Reyes",
  "Makati",
  null,
  undefined,
]);

check("normalizes accents and case", normalizeSearch("  MARÍA   Cruz ") === "maria cruz");
check("empty search has no terms", searchTerms("   ").length === 0);
check("matches patient name", matchesSearch(visit, searchTerms("santos")));
check("accent-insensitive", matchesSearch(visit, searchTerms("maria")));
check("any order", matchesSearch(visit, searchTerms("cruz santos")));
check("partial words", matchesSearch(visit, searchTerms("prophy")));
check("matches a later procedure", matchesSearch(visit, searchTerms("composite")));
check("matches dentist", matchesSearch(visit, searchTerms("reyes")));
check("matches clinic", matchesSearch(visit, searchTerms("makati")));
check("name + procedure together", matchesSearch(visit, searchTerms("maria filling")));
check("all words must match", !matchesSearch(visit, searchTerms("maria extraction")));
check("other patient does not match", !matchesSearch(visit, searchTerms("garcia")));
check("no terms matches everything", matchesSearch(visit, searchTerms("")));
check("skips empty parts", !visit.includes("null") && !visit.includes("undefined"));

// --- quick filters ---
const facts = { dentist: "Dr Reyes", hasBalance: true, loaPending: false, earlier: false };
check("no filters: inactive and matches all", !filtersActive(NO_FILTERS) && matchesFilters(facts, NO_FILTERS));
check("dentist filter on", filtersActive({ ...NO_FILTERS, dentist: "Dr Reyes" }));
check("dentist filter matches that dentist", matchesFilters(facts, { ...NO_FILTERS, dentist: "Dr Reyes" }));
check("dentist filter excludes others", !matchesFilters(facts, { ...NO_FILTERS, dentist: "Dr Lim" }));
check("empty-string dentist filter = no dentist yet", matchesFilters({ ...facts, dentist: "" }, { ...NO_FILTERS, dentist: "" }) && !matchesFilters(facts, { ...NO_FILTERS, dentist: "" }));
check("has balance filter", matchesFilters(facts, { ...NO_FILTERS, hasBalance: true }) && !matchesFilters({ ...facts, hasBalance: false }, { ...NO_FILTERS, hasBalance: true }));
check("LOA pending filter", !matchesFilters(facts, { ...NO_FILTERS, loaPending: true }) && matchesFilters({ ...facts, loaPending: true }, { ...NO_FILTERS, loaPending: true }));
check("earlier visits filter", !matchesFilters(facts, { ...NO_FILTERS, earlier: true }) && matchesFilters({ ...facts, earlier: true }, { ...NO_FILTERS, earlier: true }));
check("filters combine with AND", !matchesFilters(facts, { dentist: "Dr Reyes", hasBalance: true, loaPending: true, earlier: false }) && matchesFilters({ ...facts, loaPending: true }, { dentist: "Dr Reyes", hasBalance: true, loaPending: true, earlier: false }));

if (failed > 0) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll passed");
