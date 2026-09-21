"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PAGE_SIZE_OPTIONS, type PageSizeOption } from "@/lib/cashflow/pagination";

const NAV_BUTTON_CLASSES =
  "inline-flex items-center justify-center rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";

/**
 * Windowed page-number list with "…" gaps, e.g. `1 … 5 6 7 … 62` — the
 * standard pattern for a dataset with dozens of pages, where listing every
 * page number would overflow. Always includes the first and last page and a
 * `siblingCount`-wide band around the current page.
 */
function getPageWindow(current: number, total: number, siblingCount = 1): (number | "ellipsis")[] {
  const totalSlots = siblingCount * 2 + 5;
  if (total <= totalSlots) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(current - siblingCount, 1);
  const rightSibling = Math.min(current + siblingCount, total);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < total - 1;

  const pages: (number | "ellipsis")[] = [1];
  if (showLeftEllipsis) pages.push("ellipsis");
  for (let p = Math.max(leftSibling, 2); p <= Math.min(rightSibling, total - 1); p++) {
    pages.push(p);
  }
  if (showRightEllipsis) pages.push("ellipsis");
  if (total > 1) pages.push(total);
  return pages;
}

export function TransactionsPagination({
  page,
  pageSize,
  total,
  totalPages,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (total === 0) {
    return null;
  }

  function navigate(nextPage: number, nextPageSize: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    params.set("pageSize", String(nextPageSize));
    // `scroll: false` keeps the page from jumping back to the top on every
    // click — this is a soft, client-side re-render of just this route (the
    // top loading bar covers the brief data fetch), not a full page reload.
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pageWindow = getPageWindow(page, totalPages);

  return (
    <div className="flex flex-col gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
        <span>
          Showing <span className="font-medium text-zinc-700 dark:text-zinc-300">{start}–{end}</span>{" "}
          of <span className="font-medium text-zinc-700 dark:text-zinc-300">{total}</span>
        </span>

        <label className="flex items-center gap-2">
          <span className="hidden sm:inline">Rows per page</span>
          <select
            value={pageSize}
            onChange={(event) => navigate(1, Number(event.target.value) as PageSizeOption)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          type="button"
          onClick={() => navigate(1, pageSize)}
          disabled={page <= 1}
          aria-label="First page"
          title="First page"
          className={NAV_BUTTON_CLASSES}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M11.03 4.72a.75.75 0 0 1 0 1.06L6.81 10l4.22 4.22a.75.75 0 1 1-1.06 1.06l-4.75-4.75a.75.75 0 0 1 0-1.06l4.75-4.75a.75.75 0 0 1 1.06 0Z"
              clipRule="evenodd"
            />
            <path
              fillRule="evenodd"
              d="M15.03 4.72a.75.75 0 0 1 0 1.06L10.81 10l4.22 4.22a.75.75 0 1 1-1.06 1.06l-4.75-4.75a.75.75 0 0 1 0-1.06l4.75-4.75a.75.75 0 0 1 1.06 0Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => navigate(page - 1, pageSize)}
          disabled={page <= 1}
          className={NAV_BUTTON_CLASSES}
        >
          Previous
        </button>

        <div className="hidden items-center gap-1 sm:flex">
          {pageWindow.map((entry, index) =>
            entry === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="px-1.5 text-sm text-zinc-400 dark:text-zinc-600"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => navigate(entry, pageSize)}
                aria-current={entry === page ? "page" : undefined}
                className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md px-1.5 text-sm font-medium transition-colors ${
                  entry === page
                    ? "bg-amber-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                }`}
              >
                {entry}
              </button>
            ),
          )}
        </div>
        <span className="min-w-[92px] text-center text-sm text-zinc-500 dark:text-zinc-400 sm:hidden">
          Page {page} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => navigate(page + 1, pageSize)}
          disabled={page >= totalPages}
          className={NAV_BUTTON_CLASSES}
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => navigate(totalPages, pageSize)}
          disabled={page >= totalPages}
          aria-label="Last page"
          title="Last page"
          className={NAV_BUTTON_CLASSES}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M8.97 4.72a.75.75 0 0 1 1.06 0l4.75 4.75a.75.75 0 0 1 0 1.06l-4.75 4.75a.75.75 0 1 1-1.06-1.06L13.19 10 8.97 5.78a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
            <path
              fillRule="evenodd"
              d="M4.97 4.72a.75.75 0 0 1 1.06 0l4.75 4.75a.75.75 0 0 1 0 1.06l-4.75 4.75a.75.75 0 1 1-1.06-1.06L9.19 10 4.97 5.78a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </nav>
    </div>
  );
}
