/**
 * Transaction numbers look like "1021261430-MAR-K7M3Q":
 *
 *   102126 1430 - MAR - K7M3Q
 *   MMDDYY HHMM   branch  random code
 *
 * The date and 24-hour time (clinic time, to the minute) the transaction was
 * recorded, the branch's code, and a random code. The random code has no
 * meaning and no order — nothing has to be counted, so deleting a visit or
 * saving two at once cannot make two numbers equal; the time and branch
 * narrow it further (two branches can never clash, and neither can two
 * saves in different minutes).
 *
 * Older numbers ("091726-0001", "102126-K7M3Q") keep working; they are
 * simply other shapes of the same field.
 */

/** No 0/O, 1/I/L or U: easy to read out loud and copy from a printout. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const CODE_LENGTH = 5;

const clinicParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** MMDDYYHHMM for the clinic's calendar day and 24-hour time (not the
 * server's time zone). */
export function transactionNumberPrefix(recordDate: Date): string {
  const parts = Object.fromEntries(
    clinicParts.formatToParts(recordDate).map((part) => [part.type, part.value]),
  );
  return `${parts.month}${parts.day}${parts.year}${parts.hour}${parts.minute}`;
}

/** Used in the number when a visit has no branch. */
export const NO_BRANCH_CODE = "NB";

/**
 * A short code for a branch, worked out from its name: the first three
 * letters of a one-word name ("Marikina" → MAR, "Antipolo" → ANT, "Cainta" →
 * CAI) or the initials of a longer one ("Head Office" → HO). No branch →
 * NB. Letters only; accents and symbols are ignored.
 */
export function branchCode(name: string | null | undefined): string {
  const words = (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
  if (words.length === 0) return NO_BRANCH_CODE;
  if (words.length === 1) return words[0].slice(0, 3);
  return words
    .map((word) => word[0])
    .join("")
    .slice(0, 3);
}

/** A random code. `pick(n)` must return an integer in [0, n) — the caller
 * supplies a cryptographic source; tests supply a fixed one. */
export function randomCode(pick: (n: number) => number, length = CODE_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[pick(CODE_ALPHABET.length)];
  }
  return code;
}

/** True for the current shape ("1021261430-MAR-K7M3Q"). */
export function isRandomTransactionNumber(value: string): boolean {
  return new RegExp(
    `^\\d{10}-[A-Z]{2,3}-[${CODE_ALPHABET}]{${CODE_LENGTH}}$`,
  ).test(value);
}
