/**
 * Rules for a password a person chooses for themselves. Pure (no database,
 * no Node-only code) so the Change password form can show the same messages
 * live as the server enforces.
 */

export const MIN_PASSWORD_LENGTH = 10;
/** bcrypt only looks at the first 72 BYTES; anything longer is silently cut. */
export const MAX_PASSWORD_BYTES = 72;

// The most common passwords (and the clinic's own names), compared without
// case and without spaces or punctuation.
const COMMON = new Set([
  "password", "password1", "password12", "password123", "password1234",
  "passw0rd", "p@ssw0rd", "qwerty", "qwerty123", "qwertyuiop", "qwerty12345",
  "123456", "1234567", "12345678", "123456789", "1234567890", "0123456789",
  "11111111", "111111111", "1111111111", "00000000", "0000000000",
  "abc123", "abcd1234", "abcdefgh", "abcdefghij", "iloveyou", "welcome",
  "welcome1", "welcome123", "letmein", "letmein123", "admin", "admin123",
  "admin1234", "administrator", "changeme", "changeme123", "default",
  "monkey", "dragon", "football", "baseball", "sunshine", "princess",
  "superman", "master", "login", "secret", "trustno1", "zaq12wsx",
  "adtdental", "adtdentalclinic", "adtclinic", "adtdental123", "adt12345",
  "cashflow", "cashflow123", "dentalclinic", "dentist123", "clinic123",
  "philippines", "manila123", "temporary", "temppassword",
]);

function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9@]/g, "");
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** What the live checklist on the form shows. */
export type PasswordRuleCheck = { label: string; ok: boolean };

export function passwordChecklist(password: string): PasswordRuleCheck[] {
  return [
    {
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      ok: [...password].length >= MIN_PASSWORD_LENGTH,
    },
    { label: "Not too long", ok: utf8Length(password) <= MAX_PASSWORD_BYTES },
    { label: "Not a common password", ok: !COMMON.has(squash(password)) },
  ];
}

/**
 * Returns the first problem with a proposed new password, or null when it is
 * acceptable. `current` is the password being replaced (the temporary one, or
 * the old one).
 */
export function validateNewPassword(
  password: string,
  context: { email?: string | null; name?: string | null; current?: string | null } = {},
): string | null {
  if ([...password].length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters. A few ordinary words together make a good, easy-to-remember password.`;
  }
  if (utf8Length(password) > MAX_PASSWORD_BYTES) {
    return "That password is too long. Use 72 characters or fewer.";
  }
  if (new Set([...password]).size < 4) {
    return "Use a password with more variety than that.";
  }
  if (context.current && password === context.current) {
    return "Choose a password that is different from your current one.";
  }
  const squashed = squash(password);
  if (COMMON.has(squashed)) {
    return "That password is too common. Choose something harder to guess.";
  }
  const email = context.email?.trim().toLowerCase();
  if (email) {
    const local = email.split("@")[0] ?? "";
    if (squashed === squash(email) || (local.length >= 4 && squashed === squash(local))) {
      return "Your password should not be your e-mail address.";
    }
  }
  const name = context.name ? squash(context.name) : "";
  if (name.length >= 4 && squashed === name) {
    return "Your password should not be your name.";
  }
  return null;
}
