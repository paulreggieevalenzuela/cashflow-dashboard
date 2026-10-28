"use client";

import { useEffect } from "react";

/**
 * A page inside the app failed. The menu stays (it lives in the layout), so
 * the person can try again or open another page without losing their place.
 */
export default function CashflowError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/30"
    >
      <h1 className="text-lg font-semibold text-red-900 dark:text-red-200">
        This page could not be loaded
      </h1>
      <p className="mt-2 text-sm text-red-800 dark:text-red-300">
        Nothing was lost. It is usually a short connection problem: try again.
        If it keeps happening, tell your admin and give them the reference below.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-red-700/70 dark:text-red-300/70">
          Reference: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
      >
        Try again
      </button>
    </div>
  );
}
