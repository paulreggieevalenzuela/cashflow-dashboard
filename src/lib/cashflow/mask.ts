/** Hides all but the last four characters of an ID number ("••••1234"). */
export function maskId(value: string): string {
  const text = value.trim();
  if (text.length <= 4) {
    return "••••";
  }
  return `••••${text.slice(-4)}`;
}
