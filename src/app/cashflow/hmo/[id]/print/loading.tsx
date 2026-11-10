import { Spinner } from "@/components/ui/spinner";

/** Shown while the print page is being prepared. */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex max-w-[1000px] items-center justify-center gap-3 p-16 text-sm text-zinc-600 dark:text-zinc-300"
    >
      <Spinner className="h-5 w-5" />
      Preparing the billing for print…
    </div>
  );
}
