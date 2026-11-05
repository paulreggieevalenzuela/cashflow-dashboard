import { randomInt } from "node:crypto";

/**
 * Temporary passwords: made by the system, shown to the admin once, valid for
 * a few days, and replaced by the person at their first sign-in. Server only
 * (uses Node's crypto); the pure rules live in password-policy.ts.
 */

export const TEMP_PASSWORD_DAYS = 3;

// No 0/O, 1/I/L look-alikes, so it can be read out over the phone.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUPS = 3;
const GROUP_SIZE = 4;

/** For example "K7M3-QX9P-RD4T" (12 characters, about 59 bits). */
export function generateTempPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    let group = "";
    for (let i = 0; i < GROUP_SIZE; i += 1) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/**
 * People type the temporary password with or without the dashes, in any
 * case. Returns the canonical "XXXX-XXXX-XXXX" form when the input looks like
 * one, otherwise null.
 */
export function canonicalTempPassword(input: string): string | null {
  const squashed = input.replace(/[\s-]/g, "").toUpperCase();
  if (squashed.length !== GROUPS * GROUP_SIZE) return null;
  if ([...squashed].some((ch) => !ALPHABET.includes(ch))) return null;
  const parts: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    parts.push(squashed.slice(g * GROUP_SIZE, (g + 1) * GROUP_SIZE));
  }
  return parts.join("-");
}

export function tempPasswordExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + TEMP_PASSWORD_DAYS * 24 * 60 * 60 * 1000);
}

export function isTempPasswordExpired(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return Boolean(expiresAt) && now.getTime() >= (expiresAt as Date).getTime();
}
