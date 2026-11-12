/**
 * Search on the Queue board. Pure, so it can be tested without the screen.
 *
 * The person types a few words; a visit matches when EVERY word is found
 * somewhere in the visit's text (patient, procedures, dentist, clinic), in
 * any order and ignoring capital letters and accents. "maria clean" finds
 * Maria's cleaning; "cruz santos" finds Santos, Cruz as well.
 */

/** Lower case, accents removed, extra spaces collapsed. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The text a visit is searched by (already normalised). */
export function buildSearchText(parts: Array<string | null | undefined>): string {
  return normalizeSearch(parts.filter(Boolean).join(" "));
}

/** The words of a typed search; empty when nothing useful was typed. */
export function searchTerms(query: string): string[] {
  const normalized = normalizeSearch(query);
  return normalized === "" ? [] : normalized.split(" ");
}

/** True when every word of the search appears in the (normalised) text. */
export function matchesSearch(searchText: string, terms: string[]): boolean {
  return terms.every((term) => searchText.includes(term));
}

/** What the quick filters look at on a visit. */
export type CardFacts = {
  dentist: string;
  /** Money still owed on the visit. */
  hasBalance: boolean;
  /** HMO visit still waiting for its LOA number. */
  loaPending: boolean;
  /** A visit from an earlier day that is still on the board. */
  earlier: boolean;
};

/** The quick filters above the Queue columns. */
export type QueueFilters = {
  /** Only this dentist's visits ("" = visits with no dentist yet). */
  dentist: string | null;
  hasBalance: boolean;
  loaPending: boolean;
  earlier: boolean;
};

export const NO_FILTERS: QueueFilters = {
  dentist: null,
  hasBalance: false,
  loaPending: false,
  earlier: false,
};

/** True when at least one quick filter is on. */
export function filtersActive(filters: QueueFilters): boolean {
  return (
    filters.dentist !== null ||
    filters.hasBalance ||
    filters.loaPending ||
    filters.earlier
  );
}

/** A visit passes when it satisfies EVERY filter that is on. */
export function matchesFilters(
  facts: CardFacts,
  filters: QueueFilters,
): boolean {
  return (
    (filters.dentist === null || facts.dentist === filters.dentist) &&
    (!filters.hasBalance || facts.hasBalance) &&
    (!filters.loaPending || facts.loaPending) &&
    (!filters.earlier || facts.earlier)
  );
}
