import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-amber-600">404</p>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Page not found
      </h1>
      <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-300">
        The page you are looking for does not exist or has moved.
      </p>
      <Link
        href="/cashflow"
        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
      >
        Go to the dashboard
      </Link>
    </main>
  );
}
