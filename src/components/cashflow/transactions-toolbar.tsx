"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_TYPES, TRANSACTION_TYPES } from "@/lib/cashflow/constants";
import { buildTransactionsSearch, type TransactionsQueryParams } from "@/lib/cashflow/transactions-query";

const FIELD_CLASSES =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40";

/**
 * Search + filter controls for the transactions table. Reads the current
 * query from a prop (passed down from the server page, which already
 * resolved `searchParams`) rather than calling `useSearchParams()` itself —
 * that keeps this component's data flow one-directional and avoids needing
 * its own Suspense boundary.
 */
export function TransactionsToolbar({
  query,
  dentistOptions,
}: {
  query: TransactionsQueryParams;
  dentistOptions: string[];
}) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(query.q ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stay in sync if the query changes from elsewhere (e.g. "Clear filters",
  // browser back/forward) rather than from typing in this input. Adjusted
  // during render (React's documented pattern for resetting state when a
  // prop changes) instead of an effect, which would cause an extra
  // cascading render.
  const [trackedQ, setTrackedQ] = useState(query.q);
  if (query.q !== trackedQ) {
    setTrackedQ(query.q);
    setSearchInput(query.q ?? "");
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function navigate(overrides: Partial<TransactionsQueryParams>) {
    const search = buildTransactionsSearch(query, { page: 1, ...overrides });
    router.push(`/cashflow/transactions${search}`, { scroll: false });
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigate({ q: value || undefined });
    }, 350);
  }

  const hasActiveFilters = Boolean(
    query.q || query.type || query.payment || query.dentist || query.from || query.to,
  );

  function clearFilters() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchInput("");
    navigate({ q: undefined, type: undefined, payment: undefined, dentist: undefined, from: undefined, to: undefined });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:min-w-[240px] sm:flex-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.55 4.3l3.32 3.33a.75.75 0 1 1-1.06 1.06l-3.32-3.32A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
        <input
          type="search"
          value={searchInput}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Search patient, dentist, procedure, invoice..."
          aria-label="Search transactions"
          className={`w-full py-2 pl-9 pr-3 ${FIELD_CLASSES}`}
        />
      </div>

      <select
        value={query.type ?? ""}
        onChange={(event) => navigate({ type: event.target.value || undefined })}
        aria-label="Filter by transaction type"
        className={FIELD_CLASSES}
      >
        <option value="">All types</option>
        {TRANSACTION_TYPES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <select
        value={query.payment ?? ""}
        onChange={(event) => navigate({ payment: event.target.value || undefined })}
        aria-label="Filter by payment method"
        className={FIELD_CLASSES}
      >
        <option value="">All payment methods</option>
        {PAYMENT_TYPES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      {dentistOptions.length > 0 && (
        <select
          value={query.dentist ?? ""}
          onChange={(event) => navigate({ dentist: event.target.value || undefined })}
          aria-label="Filter by dentist"
          className={FIELD_CLASSES}
        >
          <option value="">All dentists</option>
          {dentistOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-2">
        <input
          type="date"
          value={query.from ?? ""}
          onChange={(event) => navigate({ from: event.target.value || undefined })}
          aria-label="From date"
          className={FIELD_CLASSES}
        />
        <span className="text-zinc-400" aria-hidden="true">
          –
        </span>
        <input
          type="date"
          value={query.to ?? ""}
          onChange={(event) => navigate({ to: event.target.value || undefined })}
          aria-label="To date"
          className={FIELD_CLASSES}
        />
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="text-sm font-medium text-amber-700 transition-colors hover:text-amber-800 hover:underline dark:text-amber-400 dark:hover:text-amber-300"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
