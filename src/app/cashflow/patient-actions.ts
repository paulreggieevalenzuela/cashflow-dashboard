"use server";

import { auth } from "@/auth";
import {
  computeVisitType,
  findOtherPatientsUsingId,
  getSavedDiscountId,
  lookupPatientByName,
  searchPatients,
  type PatientSummary,
} from "@/lib/db/patients";

/** Typeahead for the patient field: matches as the user types. */
export async function searchPatientsAction(query: string): Promise<PatientSummary[]> {
  const session = await auth();
  if (!session?.user) {
    return [];
  }
  return searchPatients(query);
}

/**
 * Is this name a known patient, and is a visit on `visitDate` their first
 * (NEW) or a later one (RETURNING)? Drives the badge next to the patient
 * field; the same rule is applied again on the server when saving.
 */
export async function lookupPatientAction(
  name: string,
  visitDate: string,
  excludeInvoiceId?: string,
): Promise<{
  patient: PatientSummary | null;
  visitType: "NEW" | "RETURNING";
  /** A PWD / Senior ID is on file for this patient (last 4 characters only;
   * the full number is fetched when staff choose to use it). */
  savedId: { type: string; last4: string } | null;
}> {
  const session = await auth();
  if (!session?.user || !name.trim()) {
    return { patient: null, visitType: "NEW", savedId: null };
  }
  const patient = (await lookupPatientByName(name)) ?? null;
  const visitType = await computeVisitType(patient?.id, visitDate, excludeInvoiceId);
  const saved = patient ? await getSavedDiscountId(patient.id) : undefined;
  return {
    patient,
    visitType,
    savedId: saved
      ? { type: saved.type, last4: saved.number.trim().slice(-4) }
      : null,
  };
}

/** Fills the ID fields from the patient's last PWD / Senior ID, when staff
 * press "Use ID on file". */
export async function getSavedDiscountIdAction(
  name: string,
): Promise<{ id: { type: string; number: string } | null }> {
  const session = await auth();
  if (!session?.user || !name.trim()) {
    return { id: null };
  }
  const patient = await lookupPatientByName(name);
  const saved = patient ? await getSavedDiscountId(patient.id) : undefined;
  return { id: saved ?? null };
}

/** Warns when this ID number was already used for a different patient. */
export async function checkDiscountIdAction(
  idNumber: string,
  patientName: string,
): Promise<{ others: string[] }> {
  const session = await auth();
  if (!session?.user) {
    return { others: [] };
  }
  const patient = patientName.trim() ? await lookupPatientByName(patientName) : undefined;
  return { others: await findOtherPatientsUsingId(idNumber, patient?.id ?? null) };
}
