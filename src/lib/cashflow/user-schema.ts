import { z } from "zod";

export const USER_ROLES = ["admin", "dentist", "staff"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
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
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password must be 72 characters or fewer."),
  role: z.enum(USER_ROLES),
  // Empty string means "no branch" — normalized to null in the action.
  branchId: z.string().optional().default(""),
});

export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;
