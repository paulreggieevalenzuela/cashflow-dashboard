"use client";

import { usePathname, useRouter } from "next/navigation";
import type { PublicUser } from "@/lib/db/users";

export function DentistFilter({
  dentists,
  selectedDentistId,
}: {
  dentists: PublicUser[];
  selectedDentistId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
      <span>Dentist</span>
      <select
        value={selectedDentistId ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          router.push(value ? `${pathname}?dentist=${value}` : pathname, { scroll: false });
        }}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
      >
        <option value="">All dentists (combined)</option>
        {dentists.map((dentist) => (
          <option key={dentist.id} value={dentist.id}>
            {dentist.name}
          </option>
        ))}
      </select>
    </label>
  );
}
