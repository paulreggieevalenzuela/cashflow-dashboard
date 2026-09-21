"use client";

import { usePathname, useRouter } from "next/navigation";
import type { PublicUser } from "@/lib/db/users";

export function StaffFilter({
  staff,
  selectedStaffId,
}: {
  staff: PublicUser[];
  selectedStaffId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
      <span>Staff</span>
      <select
        value={selectedStaffId ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          router.push(value ? `${pathname}?staff=${value}` : pathname, { scroll: false });
        }}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
      >
        <option value="">All staff (combined)</option>
        {staff.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
    </label>
  );
}
