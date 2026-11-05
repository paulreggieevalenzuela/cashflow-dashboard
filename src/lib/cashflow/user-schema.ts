import { z } from "zod";

/** Roles an admin can hand out (the "Add user" and "Change role" lists). */
export const USER_ROLES = ["admin", "dentist", "staff"] as const;
export type AssignableRole = (typeof USER_ROLES)[number];

/**
 * The role a signed-in session carries. The superuser is a stored role of its
 * own, but in a session it counts as "admin" (full access) plus the
 * `isSuperuser` flag, so every existing admin check keeps working.
 */
export type SessionRole = AssignableRole;

/** What is stored in the database: the three above plus the one superuser. */
export type UserRole = AssignableRole | "superuser";

export function sessionRoleOf(role: UserRole): SessionRole {
  return role === "superuser" ? "admin" : role;
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  superuser: "Superuser",
  admin: "Admin",
  dentist: "Dentist",
  staff: "Staff",
};

export const CreateUserInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a full name.").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter an email address.")
    .email("Enter a valid email address."),
  // No password here: the system generates a temporary one that the admin
  // sees once (see src/lib/auth/temp-password.ts).
  role: z.enum(USER_ROLES),
  // Empty string means "no branch" — normalized to null in the action.
  branchId: z.string().optional().default(""),
});

export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;
