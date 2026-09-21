/**
 * Shared query-string handling for the transactions table's search, filter
 * and sort controls. Kept as plain, hook-free functions (no `useSearchParams`)
 * so both the server page component and the client toolbar/table can build
 * and read the same shape without an extra Suspense boundary — the current
 * query is threaded down as a prop from the page instead.
 */
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, type PageSizeOption } from "@/lib/cashflow/pagination";

export const TRANSACTIONS_SORT_KEYS = ["date", "patientName", "dentist", "amountPaid", "netCollection"] as const;
export type TransactionSortKey = (typeof TRANSACTIONS_SORT_KEYS)[number];

export type TransactionsQueryParams = {
  page: number;
  pageSize: PageSizeOption;
  q?: string;
  type?: string;
  payment?: string;
  dentist?: string;
  from?: string;
  to?: string;
  sort: TransactionSortKey;
  dir: "asc" | "desc";
};

function cleanString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isSortKey(value: string | undefined): value is TransactionSortKey {
  return !!value && (TRANSACTIONS_SORT_KEYS as readonly string[]).includes(value);
}

/** Parses the transactions page's raw `searchParams` into a normalized,
 * fully-defaulted query object — the single source of truth every other
 * helper/component here builds on. */
export function parseTransactionsQuery(raw: {
  page?: string;
  pageSize?: string;
  q?: string;
  type?: string;
  payment?: string;
  dentist?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
}): TransactionsQueryParams {
  const parsedPage = Number(raw.page);
  const parsedPageSize = Number(raw.pageSize);

  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsedPageSize)
      ? (parsedPageSize as PageSizeOption)
      : DEFAULT_PAGE_SIZE,
    q: cleanString(raw.q),
    type: cleanString(raw.type),
    payment: cleanString(raw.payment),
    dentist: cleanString(raw.dentist),
    from: cleanString(raw.from),
    to: cleanString(raw.to),
    sort: isSortKey(raw.sort) ? raw.sort : "date",
    // Latest transactions first by default — an explicit `dir=asc` in the
    // URL (from clicking a column header) is the only way to flip it.
    dir: raw.dir === "asc" ? "asc" : "desc",
  };
}

/** True when any search/filter (not sort/pagination) is active — used to
 * tell "no transactions yet" apart from "no matches for these filters". */
export function hasActiveTransactionFilters(query: TransactionsQueryParams): boolean {
  return Boolean(query.q || query.type || query.payment || query.dentist || query.from || query.to);
}

/** Builds the `?...` query string for the transactions page from the
 * current query plus a set of overrides, always as a full replacement
 * (never a partial URLSearchParams mutation) so stale params can't linger. */
export function buildTransactionsSearch(
  current: TransactionsQueryParams,
  overrides: Partial<TransactionsQueryParams>,
): string {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.page > 1) params.set("page", String(merged.page));
  if (merged.pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(merged.pageSize));
  if (merged.q) params.set("q", merged.q);
  if (merged.type) params.set("type", merged.type);
  if (merged.payment) params.set("payment", merged.payment);
  if (merged.dentist) params.set("dentist", merged.dentist);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.sort !== "date") params.set("sort", merged.sort);
  if (merged.dir !== "desc") params.set("dir", merged.dir);

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
