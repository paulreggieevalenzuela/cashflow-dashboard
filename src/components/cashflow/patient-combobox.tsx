"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { searchPatientsAction } from "@/app/cashflow/patient-actions";
import type { PatientSummary } from "@/lib/db/patients";

const SEARCH_DELAY_MS = 250;

/**
 * Patient name field with a typeahead: as staff type, existing patients
 * whose names start with (then contain) the text are listed, with their last
 * visit date so two people with similar names are easy to tell apart. Pick
 * one to fill the name in exactly as it is on file, or keep typing a name
 * that isn't listed — it becomes a new patient when the transaction is
 * saved. The search runs on the server (the patient list can run to
 * thousands), debounced so it isn't called on every keystroke.
 *
 * Modelled on ProcedureCombobox: same keyboard handling and look.
 */
export function PatientCombobox({
  value,
  onChange,
  error,
  required,
}: {
  value: string;
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
  // Results are tagged with the text they were fetched for, so stale
  // results for an older query are simply ignored while a new one loads.
  const [results, setResults] = useState<{
    forQuery: string;
    patients: PatientSummary[];
  }>({
    forQuery: "",
    patients: [],
  });

  // Stay in sync when `value` changes from outside (a different transaction
  // is opened, or the form is reset after saving) — adjusted during render,
  // React's documented pattern for resetting state when a prop changes.
  const [trackedValue, setTrackedValue] = useState(value);
  if (value !== trackedValue) {
    setTrackedValue(value);
    setQuery(value);
  }

  // Lets the click-outside handler read the latest typed text without being
  // re-subscribed on every keystroke.
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  const trimmed = query.trim();

  useEffect(() => {
    if (!isOpen || !trimmed) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const patients = await searchPatientsAction(trimmed);
        if (!cancelled) {
          setResults({ forQuery: trimmed, patients });
        }
      } catch {
        if (!cancelled) {
          setResults({ forQuery: trimmed, patients: [] });
        }
      }
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, trimmed]);

  const matches = results.forQuery === trimmed ? results.patients : [];
  const isSearching = Boolean(trimmed) && results.forQuery !== trimmed;
  const hasExactMatch = matches.some(
    (patient) => patient.fullName.toLowerCase() === trimmed.toLowerCase(),
  );
  const showCreateOption = Boolean(trimmed) && !isSearching && !hasExactMatch;
  const optionCount = matches.length + (showCreateOption ? 1 : 0);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        // Clicking away keeps whatever was typed — a new patient's name.
        onChange(queryRef.current.trim());
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen, onChange]);

  function selectName(name: string) {
    setQuery(name);
    setTrackedValue(name);
    onChange(name);
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((index) =>
        Math.min(index + 1, Math.max(optionCount - 1, 0)),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      // Enter inside this field must never submit the whole form.
      event.preventDefault();
      if (highlightedIndex < matches.length) {
        selectName(matches[highlightedIndex].fullName);
      } else if (trimmed) {
        selectName(trimmed);
      }
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setQuery(value);
    }
  }

  const showList =
    isOpen && Boolean(trimmed) && (optionCount > 0 || isSearching);

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        Patient name
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
          aria-expanded={showList}
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
          placeholder="Search or type the patient's full name"
          className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors placeholder:text-zinc-400 focus:ring-2 focus:ring-offset-0 dark:bg-zinc-900 dark:text-zinc-50 ${
            error
              ? "border-red-400 focus:border-red-500 focus:ring-red-100 dark:focus:ring-red-900/40"
              : "border-zinc-300 focus:border-amber-500 focus:ring-amber-100 dark:border-zinc-700 dark:focus:ring-amber-900/40"
          }`}
        />

        {showList && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            {isSearching && matches.length === 0 && (
              <li className="px-3.5 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                Searching...
              </li>
            )}
            {matches.map((patient, index) => (
              <li key={patient.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={patient.fullName === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectName(patient.fullName)}
                  className={`flex w-full items-baseline justify-between gap-3 px-3.5 py-2 text-left text-sm transition-colors ${
                    index === highlightedIndex
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span>{patient.fullName}</span>
                  <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                    {patient.lastVisitDate
                      ? `last visit ${patient.lastVisitDate}`
                      : "no visits yet"}
                  </span>
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
                  onClick={() => selectName(trimmed)}
                  className={`flex w-full items-center gap-1.5 px-3.5 py-2 text-left text-sm font-medium text-amber-600 transition-colors dark:text-amber-400 ${
                    matches.length > 0
                      ? "border-t border-zinc-100 dark:border-zinc-800"
                      : ""
                  } ${
                    matches.length === highlightedIndex
                      ? "bg-amber-50 dark:bg-amber-950/40"
                      : "hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  }`}
                >
                  + New patient “{trimmed}”
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
