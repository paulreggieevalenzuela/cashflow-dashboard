// Payment methods: the ways a visit can be paid. Pure rules (no database, no
// React), shared by the forms, the server and the reports.
//
// Two kinds:
//  - "hmo": an HMO / dental-insurance company billed directly. It gets its own
//    price column per procedure, an HMO billing tab, a Day end column and the
//    dentist's HMO commission rate.
//  - "other": paid by the patient (cash, e-wallet, card, bank).
//
// The built-in methods below are part of the code and can't be removed (past
// visits and the commission rules rely on them). Owners and admins can add more
// (stored in the `payment_methods` table) and hide the ones they added.
//
// The added methods are held in a small registry (`setCustomPaymentMethods`),
// filled from the database on the server (see lib/db/payment-methods.ts) and
// from the layout in the browser (PaymentMethodsProvider), so the pure helpers
// below, such as `isHmoPayment`, work the same everywhere.

export type PaymentMethodKind = "hmo" | "other";

export type PaymentMethod = {
  name: string;
  kind: PaymentMethodKind;
  /** Offered on new visits and payments (hidden ones stay valid for history). */
  active: boolean;
  builtIn: boolean;
  /** Database id of an added method (undefined for built-in ones). */
  id?: string;
  createdAt?: string;
  createdByName?: string;
};

/** An added method, as stored. */
export type CustomPaymentMethod = Omit<PaymentMethod, "builtIn">;

const BUILT_IN: readonly { name: string; kind: PaymentMethodKind }[] = [
  { name: "Asiancare", kind: "hmo" },
  { name: "Avega", kind: "hmo" },
  { name: "BDO", kind: "other" },
  { name: "Cash", kind: "other" },
  { name: "Elite Dental Network", kind: "hmo" },
  { name: "GCash", kind: "other" },
  { name: "GoTyme", kind: "other" },
  { name: "Intellicare", kind: "hmo" },
  { name: "Maxicare", kind: "hmo" },
  { name: "Medicard", kind: "hmo" },
  { name: "POS (BDO) - CREDIT", kind: "other" },
  { name: "POS (BDO) - DEBIT", kind: "other" },
  { name: "POS (GHL) - CREDIT", kind: "other" },
  { name: "POS (GHL) - DEBIT", kind: "other" },
  { name: "POS (MAYA) - CREDIT", kind: "other" },
  { name: "POS (MAYA) - DEBIT", kind: "other" },
  { name: "Valucare", kind: "hmo" },
];

export const BUILT_IN_PAYMENT_METHODS: readonly PaymentMethod[] = BUILT_IN.map(
  (method) => ({ ...method, active: true, builtIn: true }),
);

let custom: CustomPaymentMethod[] = [];

/** Replaces the added methods (called with the database's list). */
export function setCustomPaymentMethods(methods: readonly CustomPaymentMethod[]): void {
  custom = methods.map((method) => ({ ...method }));
}

export function getCustomPaymentMethods(): readonly CustomPaymentMethod[] {
  return custom;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** Every method: built-in and added, hidden ones included, by name. */
export function allPaymentMethods(): PaymentMethod[] {
  return [
    ...BUILT_IN_PAYMENT_METHODS,
    ...custom.map((method) => ({ ...method, builtIn: false })),
  ].sort(byName);
}

/**
 * The methods to offer when entering a new visit or payment (hidden ones left
 * out). Pass the method already on a record to keep it listed there even if it
 * has been hidden since.
 */
export function paymentTypeOptions(current?: string | null): string[] {
  const names = allPaymentMethods()
    .filter((method) => method.active)
    .map((method) => method.name);
  const wanted = (current ?? "").trim();
  if (wanted && !names.some((name) => name.toLowerCase() === wanted.toLowerCase())) {
    names.push(wanted);
    names.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  }
  return names;
}

/** Every method name, hidden ones included (for filters and history). */
export function paymentTypeNames(): string[] {
  return allPaymentMethods().map((method) => method.name);
}

/**
 * The HMO names, hidden ones included: a hidden HMO still counts as an HMO on
 * the visits already paid through it, and keeps its prices and billing.
 */
export function hmoPaymentNames(): string[] {
  return allPaymentMethods()
    .filter((method) => method.kind === "hmo")
    .map((method) => method.name);
}

/** The registered spelling of a name ("avega" -> "Avega"), or null. */
export function canonicalPaymentName(name: string | null | undefined): string | null {
  const wanted = (name ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return (
    allPaymentMethods().find((method) => method.name.toLowerCase() === wanted)?.name ?? null
  );
}

/** Is this payment type an HMO / dental-insurance company? */
export function isHmoPayment(paymentType: string | null | undefined): boolean {
  const wanted = (paymentType ?? "").trim().toLowerCase();
  if (!wanted) return false;
  return allPaymentMethods().some(
    (method) => method.kind === "hmo" && method.name.toLowerCase() === wanted,
  );
}

// ---------------------------------------------------------------------------
// Adding a method: the name rules
// ---------------------------------------------------------------------------

export const MIN_PAYMENT_METHOD_LENGTH = 2;
export const MAX_PAYMENT_METHOD_LENGTH = 40;

/** Names the Day end sheet already uses for its own columns / groups. */
const RESERVED_NAMES = new Set([
  "other / not stated",
  "other",
  "elite",
  "pos",
  "pos - debit",
  "pos - credit",
  "unpaid",
  "all",
]);

/** Letters, numbers, spaces and . , & ' ( ) / - only. */
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .,&'()/-]*$/u;

/** Tidies what was typed: trimmed, one space between words. */
export function cleanPaymentMethodName(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export type NameCheck = { ok: true; name: string } | { ok: false; message: string };

/**
 * May this name be added? It must be 2 to 40 characters, use plain characters,
 * not be one of the Day end sheet's reserved names, and be new (ignoring capital
 * letters) among every built-in, added and hidden method.
 */
export function checkNewPaymentMethodName(
  input: string,
  existing: readonly string[] = paymentTypeNames(),
): NameCheck {
  const name = cleanPaymentMethodName(input);
  if (name.length < MIN_PAYMENT_METHOD_LENGTH) {
    return { ok: false, message: "Enter the name of the payment method." };
  }
  if (name.length > MAX_PAYMENT_METHOD_LENGTH) {
    return {
      ok: false,
      message: `Keep the name to ${MAX_PAYMENT_METHOD_LENGTH} characters or fewer.`,
    };
  }
  if (!NAME_PATTERN.test(name)) {
    return {
      ok: false,
      message: "Use letters, numbers, spaces and . , & ' ( ) / - only.",
    };
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    return { ok: false, message: `"${name}" is used by the Day end sheet. Choose another name.` };
  }
  const clash = existing.find((value) => value.toLowerCase() === name.toLowerCase());
  if (clash) {
    return { ok: false, message: `"${clash}" already exists.` };
  }
  return { ok: true, name };
}

/** The key used to keep names unique ignoring capital letters. */
export function paymentMethodKey(name: string): string {
  return cleanPaymentMethodName(name).toLowerCase();
}
