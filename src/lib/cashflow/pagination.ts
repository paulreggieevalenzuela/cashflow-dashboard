/**
 * Shared pagination defaults for the transactions table. Kept separate from
 * `constants.ts` (which is about CSV/domain field options) since this is
 * purely a UI/display concern.
 */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_PAGE_SIZE: PageSizeOption = 25;

export function parsePageSize(value: string | undefined): PageSizeOption {
  const parsed = Number(value);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
    ? (parsed as PageSizeOption)
    : DEFAULT_PAGE_SIZE;
}

export function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
