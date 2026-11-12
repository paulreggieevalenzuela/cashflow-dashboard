/**
 * Who may do what. Pure (no database, no React): the sign-in session, the
 * server actions, the pages and the "Access & Permissions" screen all read
 * this one file.
 *
 * Two layers:
 *   1. The ROLE gives a default set of privileges (`ROLE_DEFAULTS`).
 *   2. A person can differ from their role: a few privileges ticked on or off
 *      for that one person (stored as "overrides"). The effective set is the
 *      role's defaults with the overrides applied.
 *
 * The superuser always holds every privilege and is not customizable.
 */

import type { UserRole } from "@/lib/cashflow/user-schema";

export type PermissionDef = {
  key: string;
  label: string;
  hint?: string;
};

export type PermissionGroup = {
  title: string;
  permissions: readonly PermissionDef[];
};

export const PERMISSION_GROUPS = [
  {
    title: "Visits & Queue",
    permissions: [
      { key: "visit.create", label: "Add visits and check patients in" },
      { key: "visit.edit", label: "Edit visits that are not Cleared yet" },
      { key: "visit.edit_cleared", label: "Edit visits that are already Cleared" },
      {
        key: "visit.status_override",
        label: "Move a visit back or skip a step",
        hint: "With a reason, in the visit's status.",
      },
      {
        key: "visit.delete",
        label: "Delete visits and transaction lines",
        hint: "Deleted items are kept for 30 days: only the superuser can restore them.",
      },
      { key: "import.csv", label: "Import transactions from a CSV file" },
      {
        key: "transaction.verify",
        label: "Check transactions: Branch manager (first check)",
        hint: "Ticks a Cleared visit as reviewed and locks it: only the superuser can edit, remove or unlock it.",
      },
      {
        key: "transaction.verify_hq",
        label: "Check transactions: Headquarters (second check)",
        hint: "Approves a visit the Branch manager has already checked. It must be a different person from the one who gave the Branch check.",
      },
    ],
  },
  {
    title: "Payments & Files",
    permissions: [
      { key: "payment.add", label: "Record a payment" },
      { key: "payment.delete", label: "Remove a payment" },
      { key: "attachment.upload", label: "Attach photos and files" },
      { key: "attachment.delete", label: "Remove attached files" },
    ],
  },
  {
    title: "Patients",
    permissions: [
      { key: "patient.merge", label: "Merge duplicate patients" },
      { key: "patient.ids_reveal", label: "See PWD / Senior ID numbers in full" },
    ],
  },
  {
    title: "Expenses",
    permissions: [
      { key: "expense.add", label: "Add expenses" },
      { key: "expense.edit", label: "Correct expenses" },
      { key: "expense.delete", label: "Delete expenses" },
    ],
  },
  {
    title: "Reports",
    permissions: [
      { key: "commission.report", label: "Commission report and downloads" },
      { key: "audit.view", label: "Audit trail (edit history)" },
      { key: "hmo.void", label: "Void an HMO billing" },
      { key: "performance.view_all", label: "See everyone's performance" },
    ],
  },
  {
    title: "Rates & Targets",
    permissions: [
      { key: "procedure.manage", label: "Edit the price list and procedures" },
      {
        key: "payment_method.manage",
        label: "Add and hide payment methods (HMOs, cards, e-wallets)",
        hint: "Methods already used on visits can be hidden, not removed.",
      },
      { key: "commission.manage", label: "Edit commission rates and tiers" },
      { key: "targets.edit", label: "Edit sales targets" },
    ],
  },
  {
    title: "Administration",
    permissions: [
      { key: "user.manage", label: "Manage users, roles and access" },
      { key: "branch.manage", label: "Manage clinics (branches)" },
    ],
  },
] as const satisfies readonly PermissionGroup[];

export type Permission =
  (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap(
  (group) => group.permissions.map((permission) => permission.key),
);

/**
 * Privileges that change money, remove records, reveal identities or hand out
 * access. When one of these is an "extra" on someone (beyond their role), the
 * access review highlights it so it gets a second look.
 */
export const SENSITIVE_PERMISSIONS: readonly Permission[] = [
  "user.manage",
  "branch.manage",
  "visit.delete",
  "payment.delete",
  "expense.delete",
  "attachment.delete",
  "visit.status_override",
  "visit.edit_cleared",
  "transaction.verify",
  "transaction.verify_hq",
  "import.csv",
  "patient.merge",
  "patient.ids_reveal",
  "hmo.void",
  "commission.manage",
  "audit.view",
];

const EVERYONE = ["owner", "admin", "dentist", "staff"] as const;
const OWNER_ADMIN = ["owner", "admin"] as const;

/** Which stored roles get each privilege by default (the superuser gets all). */
const DEFAULT_ROLES: Record<Permission, readonly UserRole[]> = {
  "visit.create": EVERYONE,
  "visit.edit": EVERYONE,
  // Staff correct Cleared visits today; dentists do not.
  "visit.edit_cleared": ["owner", "admin", "staff"],
  "visit.status_override": OWNER_ADMIN,
  "visit.delete": OWNER_ADMIN,
  "import.csv": OWNER_ADMIN,
  "transaction.verify": OWNER_ADMIN,
  // Headquarters is a separate hat: owners by default, anyone else by ticking it.
  "transaction.verify_hq": ["owner"],
  "payment.add": EVERYONE,
  "payment.delete": OWNER_ADMIN,
  "attachment.upload": EVERYONE,
  "attachment.delete": OWNER_ADMIN,
  "patient.merge": OWNER_ADMIN,
  "patient.ids_reveal": OWNER_ADMIN,
  "expense.add": EVERYONE,
  "expense.edit": OWNER_ADMIN,
  "expense.delete": OWNER_ADMIN,
  "commission.report": OWNER_ADMIN,
  "audit.view": OWNER_ADMIN,
  "hmo.void": OWNER_ADMIN,
  "performance.view_all": OWNER_ADMIN,
  "procedure.manage": OWNER_ADMIN,
  "payment_method.manage": OWNER_ADMIN,
  "commission.manage": OWNER_ADMIN,
  "targets.edit": OWNER_ADMIN,
  "user.manage": OWNER_ADMIN,
  "branch.manage": OWNER_ADMIN,
};

/** The privileges a role has before anyone is customized. */
export function roleDefaults(role: UserRole): Permission[] {
  if (role === "superuser") return [...ALL_PERMISSIONS];
  return ALL_PERMISSIONS.filter((permission) =>
    DEFAULT_ROLES[permission].includes(role),
  );
}

export type PermissionOverride = { permission: string; granted: boolean };

function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * What one person can do: the role's defaults with their overrides applied.
 * The superuser always has everything. Unknown override keys (a privilege that
 * was later removed from the list) are ignored.
 */
export function effectivePermissions(
  role: UserRole,
  overrides: readonly PermissionOverride[] = [],
): Permission[] {
  if (role === "superuser") return [...ALL_PERMISSIONS];
  const granted = new Set<Permission>(roleDefaults(role));
  for (const override of overrides) {
    if (!isPermission(override.permission)) continue;
    if (override.granted) granted.add(override.permission);
    else granted.delete(override.permission);
  }
  return ALL_PERMISSIONS.filter((permission) => granted.has(permission));
}

/**
 * The overrides that turn a role's defaults into the chosen set — only the
 * differences, so a later change to a role default still reaches everyone who
 * was not customized.
 */
export function overridesFor(
  role: UserRole,
  chosen: readonly string[],
): PermissionOverride[] {
  const defaults = new Set<string>(roleDefaults(role));
  const picked = new Set(chosen.filter(isPermission));
  const overrides: PermissionOverride[] = [];
  for (const permission of ALL_PERMISSIONS) {
    const has = picked.has(permission);
    if (has !== defaults.has(permission)) {
      overrides.push({ permission, granted: has });
    }
  }
  return overrides;
}

/** Does this list of privileges include one? */
export function hasPermission(
  permissions: readonly string[] | undefined,
  permission: Permission,
): boolean {
  return Boolean(permissions?.includes(permission));
}

// ---------------------------------------------------------------------------
// Who may manage whom
// ---------------------------------------------------------------------------

/** Higher number = higher level. */
const LEVEL: Record<UserRole, number> = {
  superuser: 4,
  owner: 3,
  admin: 2,
  dentist: 1,
  staff: 1,
};

/**
 * The level a signed-in person manages users at: superuser, owner or admin,
 * and null for anyone else. Having the "Manage users" privilege ticked is not
 * enough on its own: only an admin, an owner or the superuser may manage users,
 * so a dentist or staff member given that tick still gets nothing.
 */
export function managerRoleOf(user: {
  role?: string;
  isSuperuser?: boolean;
  isOwner?: boolean;
}): UserRole | null {
  if (user.isSuperuser) return "superuser";
  if (user.isOwner) return "owner";
  return user.role === "admin" ? "admin" : null;
}

/** The roles a person may give to somebody else. */
export function assignableRolesFor(actorRole: UserRole): UserRole[] {
  if (actorRole === "superuser") return ["owner", "admin", "dentist", "staff"];
  if (actorRole === "owner") return ["admin", "dentist", "staff"];
  if (actorRole === "admin") return ["dentist", "staff"];
  return [];
}

export type ManageDecision = { ok: true } | { ok: false; reason: string };

/**
 * May `actor` change the details, role, clinics and privileges of `target`?
 * Only an admin, an owner or the superuser may manage users at all. An admin
 * manages other admins and below, an owner manages other owners and below, the
 * superuser manages everyone. Nobody manages their own access (so nobody locks
 * themselves out), nobody manages the superuser, and nobody manages somebody
 * ABOVE their level (an admin can't manage an owner).
 */
export function canManageUser(
  actor: { id: string; role: UserRole },
  target: { id: string; role: UserRole },
): ManageDecision {
  if (target.role === "superuser") {
    return { ok: false, reason: "The superuser can't be changed from here." };
  }
  if (actor.id === target.id) {
    return { ok: false, reason: "You can't change your own access." };
  }
  if (actor.role === "superuser") return { ok: true };
  if (actor.role === "owner") return { ok: true };
  if (actor.role === "admin") {
    return LEVEL[target.role] > LEVEL.admin
      ? { ok: false, reason: "Only an owner or the superuser can manage an owner." }
      : { ok: true };
  }
  return { ok: false, reason: "Only an admin, an owner or the superuser can manage users." };
}

/**
 * May `actor` remove the account of `target`? Stricter than managing: someone
 * at the same level can be edited but not removed (an owner can't remove
 * another owner, an admin can't remove another admin).
 */
export function canRemoveUser(
  actor: { id: string; role: UserRole },
  target: { id: string; role: UserRole },
): ManageDecision {
  const manage = canManageUser(actor, target);
  if (!manage.ok) return manage;
  if (actor.role !== "superuser" && LEVEL[target.role] >= LEVEL[actor.role]) {
    return {
      ok: false,
      reason:
        target.role === "owner"
          ? "Only the superuser can remove an owner."
          : "Only an owner or the superuser can remove an admin.",
    };
  }
  return { ok: true };
}

/** Roles that work in every clinic and are not tied to ticked clinics. */
export function worksInEveryClinic(role: UserRole): boolean {
  return role === "owner" || role === "admin" || role === "superuser";
}
