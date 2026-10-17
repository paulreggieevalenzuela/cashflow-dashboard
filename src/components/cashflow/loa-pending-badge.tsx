import {
  LOA_PENDING_LABEL,
  LOA_PENDING_STYLE,
} from "@/lib/cashflow/hmo";

/** Small "LOA pending" chip for an HMO visit still waiting for its LOA. */
export function LoaPendingBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="HMO visit: the LOA number is not entered yet. It can be added later (Edit transaction), but the visit can't be Cleared without it."
      className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${LOA_PENDING_STYLE} ${className}`}
    >
      {LOA_PENDING_LABEL}
    </span>
  );
}
