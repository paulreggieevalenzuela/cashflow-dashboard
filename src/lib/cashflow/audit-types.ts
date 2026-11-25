import type { AuditChange } from "@/lib/cashflow/audit-diff";

// Pure types and labels, safe to import from client components.
// (Keep database code out of this file.)
export type AuditAction =
  | "visit.created"
  | "visit.updated"
  | "visit.deleted"
  | "visit.checked"
  | "visit.hq_checked"
  | "visit.unchecked"
  | "visit.restored"
  | "line.restored"
  | "payment.restored"
  | "expense.restored"
  | "attachment.restored"
  | "user.access_changed"
  | "deleted_items.purged"
  | "payment_method.added"
  | "payment_method.changed"
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
  | "auth.reset_requested"
  | "commission.rate_set"
  | "commission.rate_removed"
  | "commission.tier_assigned"
  | "commission.tier_rate_set"
  | "commission.tier_rate_removed"
  | "commission.rates_cleared"
  | "commission.recalculated";

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
  "visit.checked": "Visit checked and locked (Branch manager)",
  "visit.hq_checked": "Visit approved by Headquarters",
  "visit.unchecked": "Visit unlocked",
  "visit.restored": "Visit restored",
  "line.restored": "Procedure line restored",
  "payment.restored": "Payment restored",
  "expense.restored": "Expense restored",
  "attachment.restored": "File restored",
  "user.access_changed": "Access changed",
  "deleted_items.purged": "Deleted items cleaned up",
  "payment_method.added": "Payment method added",
  "payment_method.changed": "Payment method changed",
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
  "commission.rate_set": "Own commission rate set",
  "commission.rate_removed": "Own commission rate removed",
  "commission.tier_assigned": "Commission tier changed",
  "commission.tier_rate_set": "Tier rate set",
  "commission.tier_rate_removed": "Tier rate removed",
  "commission.rates_cleared": "Own commission rates cleared",
  "commission.recalculated": "Commissions recalculated",
};
