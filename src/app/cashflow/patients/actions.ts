"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { logAudit } from "@/lib/db/audit";
import {
  BIRTH_DATE_INVALID_MESSAGE,
  MAX_HMO_ACCOUNT_LENGTH,
  MAX_HMO_COMPANY_LENGTH,
  cleanHmoText,
  isValidBirthDate,
} from "@/lib/cashflow/patient-hmo";
import {
  createPatient,
  mergePatients,
  updatePatient,
  type PatientInput,
} from "@/lib/db/patient-admin";

type Result =
  | { ok: true; id: string }
  | { ok: false; message: string; existingId?: string };

function clean(input: PatientInput): PatientInput {
  return {
    fullName: String(input.fullName ?? "").slice(0, 200),
    contactNumber: String(input.contactNumber ?? "").slice(0, 60),
    notes: String(input.notes ?? "").slice(0, 2000),
    birthDate: String(input.birthDate ?? "").trim(),
    hmoCompany: cleanHmoText(input.hmoCompany, MAX_HMO_COMPANY_LENGTH),
    hmoAccountNumber: cleanHmoText(
      input.hmoAccountNumber,
      MAX_HMO_ACCOUNT_LENGTH,
    ),
  };
}

async function actorOrNull() {
  const session = await auth();
  if (!session?.user) return null;
  return {
    session,
    actor: {
      userId: session.user.id,
      name: session.user.name ?? session.user.email ?? "",
    },
  };
}

function revalidate() {
  revalidatePath("/cashflow/patients", "layout");
  revalidatePath("/cashflow/transactions", "layout");
}

/** Any signed-in role can add or correct a patient's details. */
export async function createPatientAction(
  input: PatientInput,
): Promise<Result> {
  const who = await actorOrNull();
  if (!who) {
    return { ok: false, message: "You must be signed in." };
  }
  const data = clean(input);
  if (data.birthDate && !isValidBirthDate(data.birthDate)) {
    return { ok: false, message: BIRTH_DATE_INVALID_MESSAGE };
  }
  const result = await createPatient(data);
  if (!result.ok) {
    return result;
  }
  await logAudit({
    action: "patient.created",
    entityType: "patient",
    entityId: result.id,
    patientId: result.id,
    summary: data.fullName,
    actor: who.actor,
  });
  revalidate();
  return result;
}

export async function updatePatientAction(
  id: string,
  input: PatientInput,
): Promise<Result> {
  const who = await actorOrNull();
  if (!who) {
    return { ok: false, message: "You must be signed in." };
  }
  const data = clean(input);
  if (data.birthDate && !isValidBirthDate(data.birthDate)) {
    return { ok: false, message: BIRTH_DATE_INVALID_MESSAGE };
  }
  const result = await updatePatient(id, data);
  if (!result.ok) {
    return result;
  }
  await logAudit({
    action: "patient.updated",
    entityType: "patient",
    entityId: id,
    patientId: id,
    summary: `${data.fullName}${data.contactNumber ? ` · ${data.contactNumber}` : ""}${data.hmoCompany ? ` · ${data.hmoCompany}` : ""}`,
    actor: who.actor,
  });
  revalidate();
  return result;
}

/** Combines a duplicate record into another patient. Admin only. */
export async function mergePatientsAction(
  sourceId: string,
  targetId: string,
): Promise<{ ok: true; targetId: string } | { ok: false; message: string }> {
  const who = await actorOrNull();
  if (!who) {
    return { ok: false, message: "You must be signed in." };
  }
  if (who.session.user.role !== "admin") {
    return { ok: false, message: "Only admins can merge patients." };
  }
  const result = await mergePatients(sourceId, targetId);
  if (!result.ok) {
    return result;
  }
  await logAudit({
    action: "patient.merged",
    entityType: "patient",
    entityId: sourceId,
    patientId: targetId,
    summary: `A duplicate record was merged in (${result.movedVisits} ${result.movedVisits === 1 ? "invoice" : "invoices"} moved)`,
    actor: who.actor,
  });
  revalidate();
  return { ok: true, targetId };
}
