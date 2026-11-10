import type { AuditChange } from "@/lib/cashflow/audit-diff";

// Pure types and labels, safe to import from client components.
// (Keep database code out of this file.)
export type AuditAction =
  | "visit.created"
  | "visit.updated"
  | "visit.deleted"
  | "visit.restored"
  | "line.restored"
  | "payment.restored"
  | "expense.restored"
  | "attachment.restored"
  | "user.access_changed"
  | "deleted_items.purged"
  | "visit.imported"
  | "payment.added"
  | "payment.removed"
  | "status.changed"
  | "patient.created"
  | "patient.updated"
  | "patient.merged"
  | "expense.updated"
  | "expense.deleted"
  | "hmo_billing.created"
  | "hmo_billing.voided"
  | "user.created"
  | "user.password_reset"
  | "user.reset_dismissed"
  | "auth.password_changed"
  | "auth.reset_requested";

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
  "visit.restored": "Visit restored",
  "line.restored": "Procedure line restored",
  "payment.restored": "Payment restored",
  "expense.restored": "Expense restored",
  "attachment.restored": "File restored",
  "user.access_changed": "Access changed",
  "deleted_items.purged": "Deleted items cleaned up",
  "visit.imported": "Visits imported",
  "payment.added": "Payment added",
  "payment.removed": "Payment removed",
  "status.changed": "Status changed",
  "patient.created": "Patient added",
  "patient.updated": "Patient edited",
  "patient.merged": "Patients merged",
  "expense.updated": "Expense edited",
  "expense.deleted": "Expense deleted",
  "hmo_billing.created": "HMO billing generated",
  "hmo_billing.voided": "HMO billing voided",
  "user.created": "User created",
  "user.password_reset": "Password reset",
  "user.reset_dismissed": "Reset request dismissed",
  "auth.password_changed": "Password changed",
  "auth.reset_requested": "Password reset requested",
};
