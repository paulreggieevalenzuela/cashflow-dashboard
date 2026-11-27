/**
 * The commission of one saved procedure line, from the rates in force now.
 * Pure (no database): used when a visit is saved, when rates change and all
 * lines are recalculated, and by the Commission report's Rate column, so the
 * three always agree.
 */

import { resolveRateSetting } from "@/lib/cashflow/commission-tiers";
import { splitCommission } from "@/lib/cashflow/commission-split";
import {
  commissionAmountBase,
  computeCommissionDetail,
  DEFAULT_COMMISSION_PERCENT,
  describeCommissionDetail,
  type CommissionDetail,
  type CommissionRateSetting,
  type ProcedureVatType,
} from "@/lib/cashflow/pricing";

/** Every rate, as loaded once for a batch of lines. */
export type CommissionRateMaps = {
  /** `dentistUserId:procedureId` -> the dentist's own rate. */
  individual: Map<string, CommissionRateSetting>;
  /** `tier:procedureId` -> the tier's rate. */
  tier: Map<string, CommissionRateSetting>;
  /** dentistUserId -> tier. */
  dentistTier: Map<string, number>;
  /**
   * procedureId -> its VAT type on the price list. A line whose procedure
   * is not in here (not linked) uses the name rule.
   */
  procedureVat?: Map<string, ProcedureVatType>;
};

export type CommissionLineInput = {
  dentistUserId: string | null;
  procedureId: string | null;
  procedure: string;
  paymentType: string | null | undefined;
  /** Line total after discount. */
  amountPaid: number;
  /** The line's VAT type ("vat_exempt" = VAT already removed). */
  vatType: string | null | undefined;
  /** The line's discount reason (PWD / Senior = VAT already removed). */
  discountReason?: string | null;
  withholdingTax?: number | null;
  /** The dentist the patient was transferred to (50/50), if any. */
  transferDentistUserId?: string | null;
};

export type CommissionLineResult = {
  /** The main dentist's commission (their half when transferred). */
  main: number;
  /** The transferred dentist's half (0 when not transferred). */
  transfer: number;
  /** The whole commission before any split. */
  total: number;
  detail: CommissionDetail;
  /** The rate used, as the Rate column shows it ("" when none). */
  rateLabel: string;
  /** True when the line is shared 50/50 with a transferred dentist. */
  transferred: boolean;
};

/** The rate a dentist gets for a procedure: their own, else their tier's. */
export function rateFor(
  maps: CommissionRateMaps,
  dentistUserId: string | null,
  procedureId: string | null,
): CommissionRateSetting | undefined {
  if (!dentistUserId || !procedureId) return undefined;
  const tier = maps.dentistTier.get(dentistUserId);
  return resolveRateSetting({
    individual: maps.individual.get(`${dentistUserId}:${procedureId}`),
    tierRate:
      tier !== undefined ? maps.tier.get(`${tier}:${procedureId}`) : undefined,
  });
}

export function commissionForLine(
  line: CommissionLineInput,
  maps: CommissionRateMaps,
): CommissionLineResult {
  if (!line.dentistUserId) {
    return {
      main: 0,
      transfer: 0,
      total: 0,
      detail: { amount: 0, basis: "none", value: null },
      rateLabel: "",
      transferred: false,
    };
  }
  const detail = computeCommissionDetail(
    commissionAmountBase(line),
    line.paymentType,
    rateFor(maps, line.dentistUserId, line.procedureId),
    {
      procedureName: line.procedure,
      priceListVatType: line.procedureId
        ? (maps.procedureVat?.get(line.procedureId) ?? null)
        : null,
      vatType: line.vatType,
      discountReason: line.discountReason,
      defaultPercent: DEFAULT_COMMISSION_PERCENT,
    },
  );
  const transferred =
    Boolean(line.transferDentistUserId) &&
    line.transferDentistUserId !== line.dentistUserId;
  const split = splitCommission(detail.amount, transferred);
  return {
    main: split.main,
    transfer: split.transfer,
    total: detail.amount,
    detail,
    rateLabel: describeCommissionDetail(detail, line.paymentType),
    transferred,
  };
}
