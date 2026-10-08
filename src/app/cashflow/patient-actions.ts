"use server";

import { auth } from "@/auth";
import {
  computeVisitType,
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
): Promise<{ patient: PatientSummary | null; visitType: "NEW" | "RETURNING" }> {
  const session = await auth();
  if (!session?.user || !name.trim()) {
    return { patient: null, visitType: "NEW" };
  }
  const patient = (await lookupPatientByName(name)) ?? null;
  const visitType = await computeVisitType(patient?.id, visitDate, excludeInvoiceId);
  return { patient, visitType };
}
