import type { AuditChange } from "@/lib/cashflow/audit-diff";

// Pure types and labels, safe to import from client components.
// (Keep database code out of this file.)
export type AuditAction =
  | "visit.created"
  | "visit.updated"
  | "visit.deleted"
  | "visit.imported"
  | "payment.added"
  | "payment.removed"
  | "status.changed"
  | "patient.created"
  | "patient.updated"
  | "patient.merged";

export type AuditEntry = {
  id: string;
  createdAt: string; // ISO
  userName: string;
  action: string;
  entityType: string;
  invoiceId: string | null;
  patientId: string | null;
  summary: string;
  changes: AuditChange[];
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "visit.created": "Visit created",
  "visit.updated": "Visit edited",
  "visit.deleted": "Visit removed",
  "visit.imported": "Visits imported",
  "payment.added": "Payment added",
  "payment.removed": "Payment removed",
  "status.changed": "Status changed",
  "patient.created": "Patient added",
  "patient.updated": "Patient edited",
  "patient.merged": "Patients merged",
};
