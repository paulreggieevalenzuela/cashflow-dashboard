import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userPreferences } from "@/lib/db/schema";

export type Theme = "light" | "dark";

const DEFAULT_THEME: Theme = "light";

export async function getUserTheme(userId: string): Promise<Theme> {
  const [row] = await db
    .select({ theme: userPreferences.theme })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return row?.theme ?? DEFAULT_THEME;
}

/** Upsert — a user's first theme change creates their preferences row. */
export async function setUserTheme(userId: string, theme: Theme): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ userId, theme })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { theme, updatedAt: new Date() },
    });
}
