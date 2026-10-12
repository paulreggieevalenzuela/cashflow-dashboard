import { STATUS_STYLES, isVisitStatus } from "@/lib/cashflow/visit-status";

/** The coloured label for a visit's internal tracking status. */
export function StatusPill({ status }: { status: string }) {
  const known = isVisitStatus(status);
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        known
          ? STATUS_STYLES[status]
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      {status}
    </span>
  );
}
