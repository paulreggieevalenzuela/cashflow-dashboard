import { z } from "zod";

/** Roles an admin can hand out (the "Add user" and "Change role" lists). */
export const USER_ROLES = ["owner", "admin", "dentist", "staff"] as const;
export type AssignableRole = (typeof USER_ROLES)[number];

/**
 * The role a signed-in session carries. The superuser and the owner are stored
 * roles of their own, but in a session they count as "admin" (full access)
 * plus the `isSuperuser` / `isOwner` flag, so every existing admin check keeps
 * working. What a person may actually do is decided by their privileges
 * (see `src/lib/auth/permissions.ts`).
 */
export type SessionRole = "admin" | "dentist" | "staff";

/** What is stored in the database: the four above plus the one superuser. */
export type UserRole = AssignableRole | "superuser";

export function sessionRoleOf(role: UserRole): SessionRole {
  return role === "superuser" || role === "owner" ? "admin" : role;
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  superuser: "Superuser",
  owner: "Owner",
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
  // The clinics the person works in (ignored for owners and admins, who work
  // in every clinic). The first one becomes their home clinic.
  branchIds: z.array(z.string()).max(50).optional().default([]),
});

export const UpdateProfileInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a full name.").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter an email address.")
    .email("Enter a valid email address."),
});

export const SaveAccessInputSchema = z.object({
  role: z.enum(USER_ROLES),
  branchIds: z.array(z.string()).max(50),
  permissions: z.array(z.string()).max(100),
});

export type SaveAccessInput = z.infer<typeof SaveAccessInputSchema>;

export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;
