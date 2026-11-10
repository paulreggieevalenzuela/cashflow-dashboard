"use client";

import { useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";

function fileNameFrom(response: Response, fallback: string): string {
  const header = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] ?? fallback;
}

/**
 * A button that downloads a generated file (Excel, CSV...). While the server
 * builds it the button shows a spinner and "Preparing…", it cannot be pressed
 * twice, and a failure is shown next to it instead of leaving a blank tab.
 */
export function DownloadButton({
  href,
  fileName,
  children,
  busyLabel = "Preparing…",
  variant = "secondary",
}: {
  href: string;
  /** Used only if the server does not name the file. */
  fileName: string;
  children: ReactNode;
  busyLabel?: string;
  variant?: "primary" | "secondary";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) {
        let message = "The file could not be prepared. Please try again.";
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // not JSON: keep the generic message
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameFrom(response, fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The file could not be prepared. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const style =
    variant === "primary"
      ? "bg-amber-600 text-white hover:bg-amber-700"
      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-busy={busy}
        className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium disabled:cursor-wait disabled:opacity-70 ${style}`}
      >
        {busy && <Spinner />}
        <span>{busy ? busyLabel : children}</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {busy ? busyLabel : ""}
      </span>
      {error && (
        <span role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </span>
      )}
    </span>
  );
}
