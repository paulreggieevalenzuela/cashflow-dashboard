// Pure helpers (safe for client components): how long Deleted items are kept.

/** Deleted items are kept this many days, then removed for good. */
export const DELETED_ITEMS_RETENTION_DAYS = 30;

/** Shown in red / amber when this few days (or fewer) are left. */
export const DELETED_ITEMS_WARN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When an item deleted at `deletedAt` is removed for good. */
export function deletedItemExpiry(deletedAt: Date | string | number): Date {
  return new Date(new Date(deletedAt).getTime() + DELETED_ITEMS_RETENTION_DAYS * DAY_MS);
}

/** Whole days left before removal (0 = goes in the next clean-up, never negative). */
export function deletedItemDaysLeft(
  deletedAt: Date | string | number,
  now: Date | number = new Date(),
): number {
  const left = deletedItemExpiry(deletedAt).getTime() - new Date(now).getTime();
  return Math.max(0, Math.ceil(left / DAY_MS));
}
