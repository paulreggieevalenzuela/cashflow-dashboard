"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateThemeAction } from "@/app/cashflow/profile/actions";
import type { Theme } from "@/lib/db/user-preferences";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle({ initialTheme }: { initialTheme: Theme }) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function applyClassImmediately(next: Theme) {
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  function handleSelect(next: Theme) {
    if (next === theme || isPending) {
      return;
    }

    const previous = theme;
    setError(null);
    setTheme(next);
    // Flip the class right away so it feels instant — the server action
    // below is what actually persists it (and what every other page/device
    // will read going forward).
    applyClassImmediately(next);

    startTransition(async () => {
      const result = await updateThemeAction(next);
      if (!result.ok) {
        setTheme(previous);
        applyClassImmediately(previous);
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="inline-flex rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
      >
        {OPTIONS.map((option) => {
          const isSelected = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isPending}
              onClick={() => handleSelect(option.value)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                isSelected
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
