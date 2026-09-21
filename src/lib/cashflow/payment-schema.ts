import { z } from "zod";

/**
 * Input for recording a payment against a transaction (see
 * `payments-manager.tsx`). `paidAt` is a plain YYYY-MM-DD date from a
 * date input, converted to a Date server-side — mirrors how the
 * transaction form handles `date`.
 */
export const PaymentInputSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero."),
  paymentType: z.string().optional().default(""),
  paidAt: z.string().min(1, "Date is required."),
  notes: z.string().optional().default(""),
});

export type PaymentInput = z.infer<typeof PaymentInputSchema>;
