"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

/**
 * A searchable Procedure field: type to filter the known procedure list,
 * click/arrow-keys/Enter to pick one, or keep typing a name that isn't in
 * the list yet and it's offered as "+ Add ... as a new procedure" (the
 * procedure gets created for real the first time a transaction using it is
 * saved — see `getOrCreateProcedureByName` in `db/procedures.ts`). Replaces
 * the previous plain `<select>` + separate "add new" text-input toggle
 * with one control that does both.
 */
export function ProcedureCombobox({
  value,
  options,
  onChange,
  error,
  required,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  error?: string | null;
  required?: boolean;
}) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Stay in sync when `value` changes from outside (e.g. switching which
  // transaction is being edited) — adjusted during render, React's
  // documented pattern for resetting state when a prop changes, rather
  // than an effect (which would cause an extra cascading render).
  const [trackedValue, setTrackedValue] = useState(value);
  if (value !== trackedValue) {
    setTrackedValue(value);
    setQuery(value);
  }

  // The click-outside listener below is only re-subscribed when `isOpen`
  // flips, not on every keystroke, so it would otherwise close over a
  // stale `query` from whenever the dropdown opened. Mirroring it into a
  // ref (kept current on every render) lets that handler read the latest
  // typed text without re-subscribing constantly.
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => option.toLowerCase().includes(term));
  }, [query, options]);

  const trimmed = query.trim();
  const hasExactMatch = options.some((option) => option.toLowerCase() === trimmed.toLowerCase());
  const showCreateOption = trimmed.length > 0 && !hasExactMatch;
  const optionCount = filtered.length + (showCreateOption ? 1 : 0);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Clicking away commits whatever was typed (free text is allowed),
        // same as a plain text field would on blur.
        onChange(queryRef.current.trim());
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen, onChange]);

  function selectOption(name: string) {
    setQuery(name);
    setTrackedValue(name);
    onChange(name);
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((index) => Math.min(index + 1, Math.max(optionCount - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlightedIndex < filtered.length) {
        const picked = filtered[highlightedIndex];
        if (picked) selectOption(picked);
      } else if (showCreateOption) {
        selectOption(trimmed);
      }
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setQuery(value);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Procedure
        {required && (
          <span className="ml-0.5 text-red-500" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div ref={containerRef} className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-invalid={Boolean(error)}
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={options.length > 0 ? "Search or type a procedure" : "Type a procedure name"}
          className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors placeholder:text-zinc-400 focus:ring-2 focus:ring-offset-0 dark:bg-zinc-900 dark:text-zinc-50 ${
            error
              ? "border-red-400 focus:border-red-500 focus:ring-red-100 dark:focus:ring-red-900/40"
              : "border-zinc-300 focus:border-amber-500 focus:ring-amber-100 dark:border-zinc-700 dark:focus:ring-amber-900/40"
          }`}
        />

        {isOpen && optionCount > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            {filtered.map((option, index) => (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                  className={`flex w-full items-center px-3.5 py-2 text-left text-sm transition-colors ${
                    index === highlightedIndex
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {option}
                </button>
              </li>
            ))}
            {showCreateOption && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(trimmed)}
                  className={`flex w-full items-center gap-1.5 border-t border-zinc-100 px-3.5 py-2 text-left text-sm font-medium text-amber-600 transition-colors dark:border-zinc-800 dark:text-amber-400 ${
                    filtered.length === highlightedIndex
                      ? "bg-amber-50 dark:bg-amber-950/40"
                      : "hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  }`}
                >
                  + Add “{trimmed}” as a new procedure
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {options.length === 0
          ? "No procedures yet — type a name to add the first one."
          : "Type to search, or add a new procedure if it isn't listed."}
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
