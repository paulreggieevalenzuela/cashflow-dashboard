import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { purgeExpiredDeletedItems } from "@/lib/db/deleted-items";

export const dynamic = "force-dynamic";

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Optional daily clean-up of Deleted items older than 30 days. The app also
 * cleans up by itself (whenever something is deleted and when the superuser
 * opens Deleted items), so this is only a safety net for quiet periods.
 *
 * Needs a CRON_SECRET environment variable; the scheduler (for example a
 * Vercel Cron Job, which sends it as a Bearer token) must present it. With
 * no secret set the route is switched off, so it can never be called openly.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not set up." }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ") || !sameSecret(header.slice(7), secret)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  const removed = await purgeExpiredDeletedItems({ force: true });
  return NextResponse.json({ ok: true, removed });
}
