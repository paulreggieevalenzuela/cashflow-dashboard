/**
 * Shown the instant a menu item is clicked, while the server builds the page,
 * so navigation feels immediate (better perceived speed and INP) instead of
 * the old page sitting frozen. Generic on purpose: a title, a row of cards,
 * and a table-like block fit every page in the app.
 */
export default function CashflowLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="animate-pulse space-y-6">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-56 rounded-lg bg-zinc-200/80 dark:bg-zinc-800" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/80" />
        ))}
      </div>
      <div className="space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-9 rounded-md bg-zinc-200/60 dark:bg-zinc-800/70" />
        ))}
      </div>
    </div>
  );
}
