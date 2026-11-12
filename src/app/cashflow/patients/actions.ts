"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/access";
import { can } from "@/lib/auth/guards";
import { patientHasCheckedLines } from "@/lib/db/transaction-checks";
import { logAudit } from "@/lib/db/audit";
import {
  BIRTH_DATE_INVALID_MESSAGE,
  MAX_HMO_ACCOUNT_LENGTH,
  MAX_HMO_COMPANY_LENGTH,
  cleanHmoList,
  cleanHmoText,
  isValidBirthDate,
} from "@/lib/cashflow/patient-hmo";
import { PATIENT_HMOS_NOT_READY, patientHmosReady } from "@/lib/db/patient-hmos";
import {
  createPatient,
  mergePatients,
  updatePatient,
  type PatientInput,
} from "@/lib/db/patient-admin";

type Result =
  | { ok: true; id: string }
  | { ok: false; message: string; existingId?: string };

/**
 * Tidies what the form sent. The HMO list wins when it was sent: the first
 * entry also fills the older single fields, so the rest of the app (Day end,
 * HMO billing, search) keeps reading a sensible first HMO.
 */
async function clean(
  input: PatientInput,
): Promise<{ ok: true; data: PatientInput } | { ok: false; message: string }> {
  let hmos: PatientInput["hmos"];
  let company = cleanHmoText(input.hmoCompany, MAX_HMO_COMPANY_LENGTH);
  let account = cleanHmoText(input.hmoAccountNumber, MAX_HMO_ACCOUNT_LENGTH);
  if (input.hmos !== undefined) {
    const cleaned = cleanHmoList(input.hmos);
    if (!cleaned.ok) return cleaned;
    hmos = cleaned.list;
    company = hmos[0]?.company ?? "";
    account = hmos[0]?.accountNumber ?? "";
    if (!(await patientHmosReady())) {
      // Without the list table only one HMO fits (the older single fields).
      if (hmos.length > 1) {
        return { ok: false, message: PATIENT_HMOS_NOT_READY };
      }
      hmos = undefined;
    }
  }
  return {
    ok: true,
    data: {
      fullName: String(input.fullName ?? "").slice(0, 200),
      contactNumber: String(input.contactNumber ?? "").slice(0, 60),
      notes: String(input.notes ?? "").slice(0, 2000),
      birthDate: String(input.birthDate ?? "").trim(),
      hmoCompany: company,
      hmoAccountNumber: account,
      hmos,
    },
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
  const cleaned = await clean(input);
  if (!cleaned.ok) return cleaned;
  const data = cleaned.data;
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
  const cleaned = await clean(input);
  if (!cleaned.ok) return cleaned;
  const data = cleaned.data;
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
    summary: `${data.fullName}${data.contactNumber ? ` · ${data.contactNumber}` : ""}${data.hmos && data.hmos.length > 0 ? ` · HMO: ${data.hmos.map((entry) => entry.company).join(", ")}` : data.hmoCompany ? ` · ${data.hmoCompany}` : ""}`,
    actor: who.actor,
  });
  revalidate();
  return result;
}

/** Combines a duplicate record into another patient (needs the merge privilege). */
export async function mergePatientsAction(
  sourceId: string,
  targetId: string,
): Promise<{ ok: true; targetId: string } | { ok: false; message: string }> {
  const who = await actorOrNull();
  if (!who) {
    return { ok: false, message: "You must be signed in." };
  }
  if (!can(who.session, "patient.merge")) {
    return { ok: false, message: "You don't have permission to merge patients." };
  }
  // Merging renames the duplicate's visits, which would change checked
  // (locked) visits: only the superuser may.
  if (!who.session.user.isSuperuser && (await patientHasCheckedLines(sourceId))) {
    return {
      ok: false,
      message:
        "This patient has checked (locked) visits, so only the superuser can merge the record.",
    };
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
