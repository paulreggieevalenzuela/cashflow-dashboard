import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoiceHmoDetails, invoices, patients } from "@/lib/db/schema";
import {
  resolveHmoDetails,
  type HmoDetails,
  MAX_HMO_ACCOUNT_LENGTH,
  MAX_HMO_EMPLOYER_LENGTH,
  MAX_PATIENT_HMOS,
  cleanHmoText,
  hmoKey,
  legacyHmoList,
  type PatientHmoEntry,
  type VisitHmoDetails,
} from "@/lib/cashflow/patient-hmo";
import { listPatientHmos, savePatientHmos } from "@/lib/db/patient-hmos";

let warned = false;

/** The `invoice_hmo_details` table doesn't exist yet (the SQL script wasn't run). */
export function visitHmoMissing(error: unknown): boolean {
  const text = String(error) + String((error as { cause?: unknown })?.cause ?? "");
  const missing = /invoice_hmo_details/.test(text) && /does not exist|relation/.test(text);
  if (missing && !warned) {
    warned = true;
    console.warn("Visit HMO details are off: run scripts/sql/2026-11-patient-hmos.sql.");
  }
  return missing;
}

/** The details typed on each visit. Empty while the table is missing. */
export async function getVisitHmoDetails(
  invoiceIds: readonly string[],
): Promise<Map<string, VisitHmoDetails>> {
  const result = new Map<string, VisitHmoDetails>();
  const ids = [...new Set(invoiceIds)];
  try {
    for (let i = 0; i < ids.length; i += 500) {
      const rows = await db
        .select()
        .from(invoiceHmoDetails)
        .where(inArray(invoiceHmoDetails.invoiceId, ids.slice(i, i + 500)));
      for (const row of rows) {
        result.set(row.invoiceId, {
          hmoName: row.hmoName,
          employer: row.employer,
          accountNumber: row.accountNumber,
        });
      }
    }
  } catch (error) {
    if (visitHmoMissing(error)) return new Map();
    throw error;
  }
  return result;
}

/**
 * Saves what was typed on a visit for its HMO. `null`, or details with
 * nothing in them, removes the row (a visit not paid through an HMO has
 * none). Returns false when the table is missing (nothing was saved).
 */
export async function saveVisitHmoDetails(
  invoiceId: string,
  details: VisitHmoDetails | null,
): Promise<boolean> {
  const clean =
    details === null
      ? null
      : {
          hmoName: details.hmoName.trim(),
          employer: cleanHmoText(details.employer, MAX_HMO_EMPLOYER_LENGTH),
          accountNumber: cleanHmoText(details.accountNumber, MAX_HMO_ACCOUNT_LENGTH),
        };
  try {
    if (!clean || clean.hmoName === "" || (clean.employer === "" && clean.accountNumber === "")) {
      await db.delete(invoiceHmoDetails).where(eq(invoiceHmoDetails.invoiceId, invoiceId));
      return true;
    }
    await db
      .insert(invoiceHmoDetails)
      .values({ invoiceId, ...clean })
      .onConflictDoUpdate({
        target: invoiceHmoDetails.invoiceId,
        set: { ...clean, updatedAt: new Date() },
      });
    return true;
  } catch (error) {
    if (visitHmoMissing(error)) return false;
    throw error;
  }
}

/**
 * The patient learns what was typed on a visit: an HMO they had no entry for
 * is added to their list, and blank details of an existing entry are filled.
 * Nothing the patient already has is overwritten. Does nothing when the list
 * table is not set up.
 */
export async function learnPatientHmo(
  invoiceId: string,
  details: VisitHmoDetails,
): Promise<void> {
  const hmoName = details.hmoName.trim();
  const employer = cleanHmoText(details.employer, MAX_HMO_EMPLOYER_LENGTH);
  const accountNumber = cleanHmoText(details.accountNumber, MAX_HMO_ACCOUNT_LENGTH);
  if (hmoName === "" || (employer === "" && accountNumber === "")) return;
  const [invoice] = await db
    .select({ patientId: invoices.patientId })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  const patientId = invoice?.patientId;
  if (!patientId) return;

  const listed = (await listPatientHmos([patientId])).get(patientId) ?? [];
  let entries: PatientHmoEntry[] = listed;
  if (entries.length === 0) {
    const [patient] = await db
      .select({ company: patients.hmoCompany, account: patients.hmoAccountNumber })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);
    entries = legacyHmoList(patient?.company ?? "", patient?.account ?? "");
  }
  const key = hmoKey(hmoName);
  const index = entries.findIndex((entry) => hmoKey(entry.company) === key);
  let next: PatientHmoEntry[];
  if (index >= 0) {
    const existing = entries[index];
    const filled = {
      ...existing,
      employer: existing.employer || employer,
      accountNumber: existing.accountNumber || accountNumber,
    };
    if (filled.employer === existing.employer && filled.accountNumber === existing.accountNumber) {
      return;
    }
    next = entries.map((entry, i) => (i === index ? filled : entry));
  } else {
    if (entries.length >= MAX_PATIENT_HMOS) return;
    next = [...entries, { company: hmoName, employer, accountNumber }];
  }
  await savePatientHmos(patientId, next);
}

/**
 * The company and account number to offer on the visit form: what was typed
 * on this visit for that HMO, otherwise the patient's own entry for it.
 */
export async function resolveVisitHmoDetails(input: {
  invoiceId?: string;
  patientId: string | null;
  hmoName: string;
}): Promise<HmoDetails> {
  const visit = input.invoiceId
    ? (await getVisitHmoDetails([input.invoiceId])).get(input.invoiceId)
    : undefined;
  let entries: PatientHmoEntry[] = [];
  let legacyAccountNumber = "";
  if (input.patientId) {
    entries = (await listPatientHmos([input.patientId])).get(input.patientId) ?? [];
    const [patient] = await db
      .select({ account: patients.hmoAccountNumber, company: patients.hmoCompany })
      .from(patients)
      .where(eq(patients.id, input.patientId))
      .limit(1);
    // The older single fields count only for the HMO they name.
    if (patient && hmoKey(patient.company) === hmoKey(input.hmoName)) {
      legacyAccountNumber = patient.account;
    }
  }
  return resolveHmoDetails({
    visit,
    entries,
    hmoName: input.hmoName,
    legacyAccountNumber,
  });
}
