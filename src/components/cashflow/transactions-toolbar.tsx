"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import type { Branch } from "@/lib/db/branches";
import { PAYMENT_TYPES, TRANSACTION_TYPES } from "@/lib/cashflow/constants";
import {
  ALL_BRANCHES,
  buildTransactionsSearch,
  type TransactionsQueryParams,
} from "@/lib/cashflow/transactions-query";

const FIELD_CLASSES =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40";

const LABEL_CLASSES =
  "flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300";

type FilterDraft = {
  type: string;
  payment: string;
  dentist: string;
  branch: string;
  from: string;
  to: string;
};

function draftFrom(query: TransactionsQueryParams): FilterDraft {
  return {
    type: query.type ?? "",
    payment: query.payment ?? "",
    dentist: query.dentist ?? "",
    branch: query.branch ?? ALL_BRANCHES,
    from: query.from ?? "",
    to: query.to ?? "",
  };
}

/**
 * Search box plus a filter button. The search stays on the page; the other
 * filters (type, payment method, dentist, branch, date range) live in a pop-up so
 * the page isn't taken up by a row of dropdowns. Applied filters show as
 * small removable chips under the search box.
 *
 * Reads the current query from a prop (passed down from the server page,
 * which already resolved `searchParams`) rather than calling
 * `useSearchParams()` itself — that keeps this component's data flow
 * one-directional and avoids needing its own Suspense boundary.
 */
export function TransactionsToolbar({
  query,
  dentistOptions,
  branches,
  defaultBranchId,
}: {
  query: TransactionsQueryParams;
  dentistOptions: string[];
  branches: Branch[];
  /** The signed-in user's branch. With none, "all branches" is the normal
   * view and needs no mark in the address. */
  defaultBranchId: string | null;
}) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(query.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<FilterDraft>(() => draftFrom(query));
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

  // "All branches" must be written into the address when the user has a
  // branch of their own (otherwise it would fall back to their branch).
  function branchParam(value: string): string | undefined {
    return value === ALL_BRANCHES && !defaultBranchId ? undefined : value;
  }

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

  function openFilters() {
    setDraft(draftFrom(query));
    setFiltersOpen(true);
  }

  function applyFilters() {
    navigate({
      type: draft.type || undefined,
      payment: draft.payment || undefined,
      dentist: draft.dentist || undefined,
      branch: branchParam(draft.branch || ALL_BRANCHES),
      from: draft.from || undefined,
      to: draft.to || undefined,
    });
    setFiltersOpen(false);
  }

  function clearFilters() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchInput("");
    navigate({
      q: undefined,
      type: undefined,
      payment: undefined,
      dentist: undefined,
      branch: branchParam(ALL_BRANCHES),
      from: undefined,
      to: undefined,
    });
    setFiltersOpen(false);
  }

  // Applied filters other than the search text, for the chips and the badge.
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (query.type) {
    chips.push({
      key: "type",
      label: `Type: ${query.type}`,
      clear: () => navigate({ type: undefined }),
    });
  }
  if (query.payment) {
    chips.push({
      key: "payment",
      label: `Payment: ${query.payment}`,
      clear: () => navigate({ payment: undefined }),
    });
  }
  if (query.dentist) {
    chips.push({
      key: "dentist",
      label: `Dentist: ${query.dentist}`,
      clear: () => navigate({ dentist: undefined }),
    });
  }
  if (query.branch && query.branch !== ALL_BRANCHES) {
    const branchName =
      query.branch === "none"
        ? "No branch"
        : (branches.find((branch) => branch.id === query.branch)?.name ??
          "Unknown branch");
    chips.push({
      key: "branch",
      label: `Branch: ${branchName}${query.branch === defaultBranchId ? " (your branch)" : ""}`,
      clear: () => navigate({ branch: branchParam(ALL_BRANCHES) }),
    });
  }
  if (query.from || query.to) {
    chips.push({
      key: "dates",
      label:
        query.from && query.to
          ? `${query.from} to ${query.to}`
          : query.from
            ? `From ${query.from}`
            : `Until ${query.to}`,
      clear: () => navigate({ from: undefined, to: undefined }),
    });
  }
  const hasActiveFilters = chips.length > 0 || Boolean(query.q);
  const badgeCount = chips.length;

  const dateRangeInvalid = Boolean(
    draft.from && draft.to && draft.from > draft.to,
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
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

        <button
          type="button"
          onClick={openFilters}
          aria-label={
            badgeCount > 0 ? `Filters (${badgeCount} applied)` : "Filters"
          }
          title="Filters"
          className={`relative inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border shadow-sm transition-colors ${
            badgeCount > 0
              ? "border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-300"
              : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z"
              clipRule="evenodd"
            />
          </svg>
          {badgeCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-semibold leading-4 text-white">
              {badgeCount}
            </span>
          )}
        </button>
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 py-1 pl-3 pr-1.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.clear}
                aria-label={`Remove filter: ${chip.label}`}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-amber-200/70 dark:hover:bg-amber-900"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3 w-3"
                  aria-hidden="true"
                >
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-medium text-amber-700 transition-colors hover:text-amber-800 hover:underline dark:text-amber-400 dark:hover:text-amber-300"
          >
            Clear all
          </button>
        </div>
      )}

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        description="Narrow the list by type, payment method, dentist, branch or date. The search box stays on the page."
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={LABEL_CLASSES}>
              Transaction type
              <select
                value={draft.type}
                onChange={(event) =>
                  setDraft({ ...draft, type: event.target.value })
                }
                className={`${FIELD_CLASSES} select-chevron`}
              >
                <option value="">All types</option>
                {TRANSACTION_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className={LABEL_CLASSES}>
              Payment method
              <select
                value={draft.payment}
                onChange={(event) =>
                  setDraft({ ...draft, payment: event.target.value })
                }
                className={`${FIELD_CLASSES} select-chevron`}
              >
                <option value="">All payment methods</option>
                {PAYMENT_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={LABEL_CLASSES}>
            Branch
            <select
              value={draft.branch}
              onChange={(event) =>
                setDraft({ ...draft, branch: event.target.value })
              }
              className={`${FIELD_CLASSES} select-chevron`}
            >
              <option value={ALL_BRANCHES}>All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
              <option value="none">No branch</option>
            </select>
          </label>

          {dentistOptions.length > 0 && (
            <label className={LABEL_CLASSES}>
              Dentist
              <select
                value={draft.dentist}
                onChange={(event) =>
                  setDraft({ ...draft, dentist: event.target.value })
                }
                className={`${FIELD_CLASSES} select-chevron`}
              >
                <option value="">All dentists</option>
                {dentistOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={LABEL_CLASSES}>
              From date
              <input
                type="date"
                value={draft.from}
                onChange={(event) =>
                  setDraft({ ...draft, from: event.target.value })
                }
                className={FIELD_CLASSES}
              />
            </label>
            <label className={LABEL_CLASSES}>
              To date
              <input
                type="date"
                value={draft.to}
                onChange={(event) =>
                  setDraft({ ...draft, to: event.target.value })
                }
                className={FIELD_CLASSES}
              />
            </label>
          </div>
          {dateRangeInvalid && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              The “From” date is after the “To” date.
            </p>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={() =>
                setDraft({
                  type: "",
                  payment: "",
                  dentist: "",
                  branch: defaultBranchId ?? ALL_BRANCHES,
                  from: "",
                  to: "",
                })
              }
              className="text-sm font-medium text-zinc-500 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Reset
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={dateRangeInvalid}
                onClick={applyFilters}
                className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
