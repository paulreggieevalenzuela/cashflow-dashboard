import Link from "next/link";

export default function CashflowNotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-950">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Not found</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        That record does not exist, or you do not have access to it.
      </p>
      <Link
        href="/cashflow"
        className="mt-4 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
