"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  NO_FILTERS,
  filtersActive,
  matchesFilters,
  matchesSearch,
  searchTerms,
  type CardFacts,
  type QueueFilters,
} from "@/lib/cashflow/queue-search";

export type QueueBoardCard = {
  id: string;
  /** Normalised text the search looks in (see `buildSearchText`). */
  searchText: string;
  /** What the quick filters look at. */
  facts: CardFacts;
  /** The visit card, rendered on the server. */
  node: ReactNode;
};

export type QueueBoardColumn = {
  status: string;
  hint: string;
  cards: QueueBoardCard[];
  /** Show this many cards, then a "Show more" button. Omit to show all. */
  initialLimit?: number;
};

/** How many more cards each press of "Show more" reveals. */
const MORE_STEP = 20;

/** The yes/no filters, in the order they are shown. */
const TOGGLES: Array<{
  key: "hasBalance" | "loaPending" | "earlier";
  label: string;
  hint: string;
}> = [
  {
    key: "hasBalance",
    label: "Has balance due",
    hint: "Visits that still owe money",
  },
  {
    key: "loaPending",
    label: "LOA pending",
    hint: "HMO visits still waiting for their LOA number",
  },
  {
    key: "earlier",
    label: "Earlier visits",
    hint: "Visits from a previous day that are still on the board",
  },
];

/** The "no dentist yet" choice in the dentist list. */
const NO_DENTIST = "__none__";

const chipBase =
  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors";
const chipOff =
  "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";
const chipOn =
  "border-amber-600 bg-amber-50 text-amber-800 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300";

/**
 * The columns of the Queue, with a search box and quick filters above them.
 * Searching and filtering hide the visits that do not match, instantly and
 * without reloading, and what was typed or picked stays put when the board
 * refreshes itself every 30 seconds. Each column scrolls on its own so a busy
 * day does not make the page endless.
 */
export function QueueBoard({ columns }: { columns: QueueBoardColumn[] }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<QueueFilters>(NO_FILTERS);
  // How many cards a capped column has been asked to show, by status.
  const [limits, setLimits] = useState<Record<string, number>>({});

  const terms = useMemo(() => searchTerms(query), [query]);
  const searching = terms.length > 0;
  const filtering = filtersActive(filters);
  const narrowed = searching || filtering;

  const allCards = columns.flatMap((column) => column.cards);
  const total = allCards.length;

  // The dentists on the board right now (plus the one picked, should they
  // have left the board since).
  const dentists = useMemo(() => {
    const names = new Set<string>();
    for (const card of allCards) {
      if (card.facts.dentist !== "") {
        names.add(card.facts.dentist);
      }
    }
    if (filters.dentist) {
      names.add(filters.dentist);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, filters.dentist]);
  const hasUnassigned = allCards.some((card) => card.facts.dentist === "");

  const count = (key: "hasBalance" | "loaPending" | "earlier") =>
    allCards.filter((card) => card.facts[key]).length;

  const filtered = columns.map((column) => ({
    column,
    matches: narrowed
      ? column.cards.filter(
          (card) =>
            matchesFilters(card.facts, filters) &&
            matchesSearch(card.searchText, terms),
        )
      : column.cards,
  }));
  const matched = filtered.reduce((sum, item) => sum + item.matches.length, 0);

  function clearAll() {
    setQuery("");
    setFilters(NO_FILTERS);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative max-w-md">
          <label htmlFor="queue-search" className="sr-only">
            Search the queue
          </label>
          <input
            id="queue-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
              }
            }}
            placeholder="Search patient, procedure or dentist"
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-3 pr-16 text-sm text-zinc-900 placeholder:text-zinc-400 [&::-webkit-search-cancel-button]:appearance-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
          />
          {query !== "" && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              Clear
            </button>
          )}
        </div>

        <div
          role="group"
          aria-label="Quick filters"
          className="flex flex-wrap items-center gap-2"
        >
          <label className="sr-only" htmlFor="queue-dentist">
            Dentist
          </label>
          <select
            id="queue-dentist"
            value={
              filters.dentist === null
                ? ""
                : filters.dentist === ""
                  ? NO_DENTIST
                  : filters.dentist
            }
            onChange={(event) => {
              const value = event.target.value;
              setFilters((current) => ({
                ...current,
                dentist:
                  value === "" ? null : value === NO_DENTIST ? "" : value,
              }));
            }}
            className={`select-chevron rounded-full border py-1.5 pl-3 pr-8 text-xs font-medium ${
              filters.dentist === null ? chipOff : chipOn
            }`}
          >
            <option value="">All dentists</option>
            {dentists.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {(hasUnassigned || filters.dentist === "") && (
              <option value={NO_DENTIST}>No dentist yet</option>
            )}
          </select>

          {TOGGLES.map((toggle) => (
            <button
              key={toggle.key}
              type="button"
              aria-pressed={filters[toggle.key]}
              title={toggle.hint}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  [toggle.key]: !current[toggle.key],
                }))
              }
              className={`${chipBase} ${filters[toggle.key] ? chipOn : chipOff}`}
            >
              {toggle.label}{" "}
              <span className="tabular-nums opacity-70">
                ({count(toggle.key)})
              </span>
            </button>
          ))}

          {narrowed && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Clear search and filters
            </button>
          )}
        </div>

        <p
          aria-live="polite"
          className="min-h-4 text-xs text-zinc-500 dark:text-zinc-400"
        >
          {narrowed
            ? matched === 0
              ? "No visit matches."
              : `${matched} of ${total} ${total === 1 ? "visit matches" : "visits match"}.`
            : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {filtered.map(({ column, matches }) => {
          // A search or filter always shows every match, so a Cleared
          // patient is found even when the column is trimmed to its first
          // cards.
          const limit =
            !narrowed && column.initialLimit !== undefined
              ? (limits[column.status] ?? column.initialLimit)
              : matches.length;
          const visible = matches.slice(0, limit);
          const hidden = matches.length - visible.length;
          return (
            <section
              key={column.status}
              aria-label={column.status}
              className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <header className="mb-3 flex items-baseline justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {column.status}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {column.hint}
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-800">
                  {narrowed
                    ? `${matches.length} of ${column.cards.length}`
                    : column.cards.length}
                </span>
              </header>

              <ul
                // Scrolls on its own; focusable so the keyboard can scroll it.
                tabIndex={0}
                aria-label={`${column.status} visits`}
                className="max-h-[70vh] space-y-2 overflow-y-auto pr-1"
              >
                {visible.length === 0 && (
                  <li className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                    {narrowed && column.cards.length > 0
                      ? "No match"
                      : "Empty"}
                  </li>
                )}
                {visible.map((card) => (
                  <li
                    key={card.id}
                    className="rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    {card.node}
                  </li>
                ))}
                {hidden > 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={() =>
                        setLimits((current) => ({
                          ...current,
                          [column.status]: visible.length + MORE_STEP,
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Show {Math.min(hidden, MORE_STEP)} more ({hidden} hidden)
                    </button>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
