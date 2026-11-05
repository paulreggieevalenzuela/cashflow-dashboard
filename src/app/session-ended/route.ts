import { NextResponse } from "next/server";
import { signOut } from "@/auth";

/**
 * Ends a sign-in the server no longer accepts (password changed or reset
 * elsewhere, or the account was removed) and shows the sign-in page with an
 * explanation. A page cannot clear the cookie itself, and sending the person
 * to the sign-in page directly would bounce them back (the cookie still
 * looks valid there), so this route does both.
 */
export async function GET(request: Request) {
  await signOut({ redirect: false });
  return NextResponse.redirect(new URL("/login?reason=ended", request.url));
}
