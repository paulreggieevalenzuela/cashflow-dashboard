import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your Postgres connection string (on Vercel: Settings → Environment Variables, for this environment).",
    );
  }
  return drizzle(neon(url), { schema });
}

type Database = ReturnType<typeof connect>;
let instance: Database | null = null;

/**
 * The database, connected on first use rather than when this file is
 * imported. `next build` imports every route to collect its settings, and a
 * build machine may have no DATABASE_URL (or a different one): connecting
 * lazily keeps the build from failing there, while any query without a
 * DATABASE_URL still fails at once with the message above.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    instance ??= connect();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
