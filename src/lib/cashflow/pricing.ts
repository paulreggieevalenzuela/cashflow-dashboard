/**
 * Money helpers shared by the transaction form, the server actions and the
 * expenses form. Everything here is a pure function with no imports, so the
 * browser (live totals as staff type) and the server (the numbers actually
 * saved) are guaranteed to use the exact same arithmetic.
 */

/** Philippine VAT rate. The one place it is written down. */
export const VAT_RATE = 0.12;

export const VAT_TYPES = ["vat", "non_vat", "vat_exempt"] as const;
export type VatType = (typeof VAT_TYPES)[number];

export const VAT_TYPE_LABELS: Record<VatType, string> = {
  vat: "VAT",
  non_vat: "Non-VAT",
  vat_exempt: "VAT-Exempt",
};

export function isVatType(value: string | null | undefined): value is VatType {
  return !!value && (VAT_TYPES as readonly string[]).includes(value);
}

/** Falls back to non-VAT for anything unrecognised (blank, old data). */
export function normalizeVatType(value: string | null | undefined): VatType {
  return isVatType(value) ? value : "non_vat";
}

/**
 * Payment types that are HMO / dental-insurance providers billed directly
 * (as opposed to cash, e-wallets and cards paid by the patient). A visit
 * paid through one of these earns the dentist's HMO commission rate instead
 * of the cash-paying one (clinic's "LIST - COMMISSION" sheet).
 */
export const HMO_PAYMENT_TYPES = [
  "Avega",
  "Elite Dental Network",
  "Intellicare",
  "Maxicare",
  "Medicard",
  "Valucare",
] as const;

export function isHmoPayment(paymentType: string | null | undefined): boolean {
  const wanted = (paymentType ?? "").trim().toLowerCase();
  return (
    wanted !== "" &&
    HMO_PAYMENT_TYPES.some((name) => name.toLowerCase() === wanted)
  );
}

/** One dentist + procedure commission setting. */
export type CommissionRateSetting = {
  /** Cash-paying commission, % of net collection. */
  ratePercent: number;
  /** HMO commission, % of net collection (null = none set). */
  hmoRatePercent: number | null;
  /** HMO commission as a fixed peso amount per procedure (null = none). */
  hmoPesoValue: number | null;
};

/**
 * Commission one procedure line earns.
 *
 * - Not an HMO payment: cash-paying % of the line's net collection.
 * - HMO payment: the fixed peso value when the procedure has one (X-rays),
 *   otherwise the HMO % of net collection (OP), otherwise nothing — the
 *   sheet lists only a few HMO procedures, and the rest earn no commission
 *   when billed to an HMO.
 */
export function computeCommission(
  netCollection: number,
  paymentType: string | null | undefined,
  rate: CommissionRateSetting | undefined,
): number {
  if (!rate) {
    return 0;
  }
  if (isHmoPayment(paymentType)) {
    if (rate.hmoPesoValue !== null) {
      return round2(rate.hmoPesoValue);
    }
    if (rate.hmoRatePercent !== null) {
      return round2(netCollection * (rate.hmoRatePercent / 100));
    }
    return 0;
  }
  return round2(netCollection * (rate.ratePercent / 100));
}

/**
 * Card-terminal fees, as a percent of the amount paid through that payment
 * type (from the clinic's "LIST - MERCHANT FEE COMPUTATION" sheet). The fee
 * is worked out from the payment type — nobody types it. Any payment type
 * not listed (cash, GCash, HMOs, ...) has no merchant fee.
 */
export const MERCHANT_FEE_RATES: Record<string, number> = {
  "POS (GHL) - CREDIT": 2.8,
  "POS (GHL) - DEBIT": 2.8,
  "POS (BDO) - CREDIT": 5,
  "POS (BDO) - DEBIT": 5,
  "POS (MAYA) - CREDIT": 3.4,
  "POS (MAYA) - DEBIT": 3.4,
};

/** The merchant fee percentage for a payment type (0 when it has none). */
export function merchantFeeRateFor(
  paymentType: string | null | undefined,
): number {
  const wanted = (paymentType ?? "").trim().toLowerCase();
  if (!wanted) {
    return 0;
  }
  for (const [name, rate] of Object.entries(MERCHANT_FEE_RATES)) {
    if (name.toLowerCase() === wanted) {
      return rate;
    }
  }
  return 0;
}

/**
 * The fee is INCLUDED in the payment, not added on top: a ₱3,500 bill paid
 * by card at 5% is paid in full by a ₱3,500 payment. The terminal keeps the
 * fee (₱175), so the clinic receives ₱3,325 — that is its net collection.
 *
 * Splits an amount received into what pays the bill (all of it) and the
 * merchant fee contained in it. Payment types with no fee have none.
 */
export function splitReceived(
  received: number,
  paymentType: string | null | undefined,
): { applied: number; fee: number } {
  const amount = round2(received);
  const rate = merchantFeeRateFor(paymentType);
  if (!(amount > 0)) {
    return { applied: 0, fee: 0 };
  }
  return { applied: amount, fee: round2((amount * rate) / 100) };
}

/** The part of an amount received that pays the bill (all of it — the fee
 * comes out of the payment, it is not extra). */
export function appliedToBill(
  received: number,
  paymentType: string | null | undefined,
): number {
  return splitReceived(received, paymentType).applied;
}

/** The merchant fee contained in an amount received. */
export function computeMerchantFee(
  received: number,
  paymentType: string | null | undefined,
): number {
  return splitReceived(received, paymentType).fee;
}

/** What the patient hands over to settle `bill`: the bill itself — the
 * merchant fee is taken out of it. */
export function receivedForBill(
  bill: number,
  // Kept so callers read the same for every payment type.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _paymentType?: string | null,
): number {
  return round2(bill);
}

/** Unit price times quantity — the line's price before any discount. */
export function computeListPrice(unitPrice: number, quantity: number): number {
  const qty = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
  return round2(round2(unitPrice) * qty);
}

export const DISCOUNT_MODES = ["percent", "amount"] as const;
export type DiscountMode = (typeof DISCOUNT_MODES)[number];

/**
 * Rounds to centavos without the usual floating-point surprises
 * (`8.075 * 100` is `807.4999…` in JavaScript, so a plain
 * `Math.round(x * 100) / 100` would give 8.07 where the clinic's sheet,
 * and a calculator, give 8.08).
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const abs = Math.abs(value);
  if (abs < 0.000001) {
    return 0;
  }
  const shifted = Number(`${Number(abs.toPrecision(15))}e2`);
  return (Math.sign(value) * Math.round(shifted)) / 100;
}

/**
 * The peso value of a discount. `percent` takes a percentage of the list
 * price (capped at 100%); `amount` is a fixed peso figure. Never more than
 * the list price, never negative.
 */
export function computeDiscountAmount(
  listPrice: number,
  mode: DiscountMode | "" | undefined,
  value: number,
): number {
  if (!mode || !(value > 0) || !(listPrice > 0)) {
    return 0;
  }
  const raw =
    mode === "percent" ? listPrice * (Math.min(value, 100) / 100) : value;
  return round2(Math.min(raw, listPrice));
}

/** List price less its discount — what the patient is actually charged. */
export function computeLineTotal(
  listPrice: number,
  mode: DiscountMode | "" | undefined,
  value: number,
): number {
  return round2(listPrice - computeDiscountAmount(listPrice, mode, value));
}

/**
 * Splits a VAT-inclusive amount. For a VAT line the base is the amount
 * divided by 1.12 and the VAT is whatever is left, so base + VAT always
 * equals the amount exactly. Non-VAT and VAT-exempt amounts carry no VAT.
 */
export function computeVat(
  gross: number,
  vatType: VatType,
): { base: number; vat: number } {
  const amount = round2(gross);
  if (vatType !== "vat") {
    return { base: amount, vat: 0 };
  }
  const base = round2(amount / (1 + VAT_RATE));
  return { base, vat: round2(amount - base) };
}

/**
 * The 20% discount that PWD and Senior Citizens are entitled to by law. It
 * is NOT like a promo: the sale becomes VAT-exempt (the 12% VAT is taken
 * out of the price first) and the 20% is then taken off that VAT-free
 * price. So a VAT-inclusive P1,120 becomes P1,000 net, less P200 = P800 due.
 */
export const STATUTORY_DISCOUNT_PERCENT = 20;

const STATUTORY_DISCOUNT_REASONS = ["pwd", "senior citizen", "senior", "sc"];

/** True for the PWD / Senior Citizen discount reasons (case-insensitive). */
export function isStatutoryDiscount(
  reason: string | null | undefined,
): boolean {
  return STATUTORY_DISCOUNT_REASONS.includes(
    (reason ?? "").trim().toLowerCase(),
  );
}

export type PricedLineAmounts = {
  /** Peso value of the discount. */
  discountAmount: number;
  /** What the patient pays for this line. */
  total: number;
  /** Net-of-VAT amount of the line as it is recorded. */
  vatBase: number;
  /** VAT still charged on the line (always 0 for PWD/Senior and non-VAT lines). */
  vat: number;
  /** True when the PWD/Senior rule was applied to this line. */
  statutory: boolean;
};

/**
 * Prices one procedure line — the single place the discount + VAT rules
 * live, used by the form (live totals) and the server (saved figures).
 *
 * - Regular discount (promo, network member, other): taken off the price
 *   the patient sees; a VAT line keeps its VAT, now on the lower amount.
 * - PWD / Senior Citizen: VAT is removed first (when the line is a VAT
 *   line), the 20% is taken off the VAT-free price, and no VAT is added
 *   back. The line is recorded as a VAT-exempt sale.
 */
export function priceLine(input: {
  listPrice: number;
  vatType: VatType;
  discountMode: DiscountMode | "" | undefined;
  discountValue: number;
  discountReason?: string | null;
  /**
   * Whether the discount is the PWD / Senior Citizen kind. The discount
   * type decides this (its `statutory` flag); when the caller does not know
   * it — an old line with free-text reason — the reason text is used.
   */
  statutory?: boolean;
}): PricedLineAmounts {
  const listPrice = round2(input.listPrice);
  const isStatutory =
    input.statutory ?? isStatutoryDiscount(input.discountReason);
  const hasDiscount =
    !!input.discountMode && input.discountValue > 0 && listPrice > 0;

  if (hasDiscount && isStatutory) {
    const net =
      input.vatType !== "vat" ? listPrice : computeVat(listPrice, "vat").base;
    const discountAmount = computeDiscountAmount(
      net,
      input.discountMode,
      input.discountValue,
    );
    const total = round2(net - discountAmount);
    return { discountAmount, total, vatBase: total, vat: 0, statutory: true };
  }

  const discountAmount = computeDiscountAmount(
    listPrice,
    input.discountMode,
    input.discountValue,
  );
  const total = round2(listPrice - discountAmount);
  const { base, vat } = computeVat(total, input.vatType);
  return { discountAmount, total, vatBase: base, vat, statutory: false };
}

export type OrLine = {
  listPrice: number;
  discountAmount: number;
  total: number;
  vatBase: number;
  vat: number;
  statutory: boolean;
};

/**
 * The breakdown printed on the clinic's official receipt (the "Auto compute
 * OR" sheet), for a whole invoice:
 *
 *   Vatable sales            net of VAT, VAT lines without a PWD/Senior discount
 *   VAT-exempt sales         non-VAT lines + PWD/Senior lines (before the discount)
 *   VAT                      12% of the vatable sales
 *   Total sales (VAT incl.)  what the prices add up to
 *   Less: VAT                VAT taken out of the price
 *   Amount: net of VAT
 *   Less: Discount (SC, PWD)
 *   Add: VAT                 VAT charged on the vatable sales
 *   Total amount due
 *
 * `totalDue` always equals the sum of the line totals.
 */
export type OrSummary = {
  vatableSales: number;
  vatExemptSales: number;
  vat: number;
  totalSales: number;
  lessVat: number;
  netOfVat: number;
  lessDiscount: number;
  addVat: number;
  totalDue: number;
};

export function summarizeOr(lines: OrLine[]): OrSummary {
  let vatableSales = 0;
  let vatExemptSales = 0;
  let vat = 0;
  let totalSales = 0;
  let lessVat = 0;
  let lessDiscount = 0;

  for (const line of lines) {
    if (line.statutory) {
      const net = line.total + line.discountAmount;
      totalSales += line.listPrice;
      vatExemptSales += net;
      lessVat += line.listPrice - net;
      lessDiscount += line.discountAmount;
    } else {
      totalSales += line.total;
      if (line.vat > 0) {
        vatableSales += line.vatBase;
        vat += line.vat;
        lessVat += line.vat;
      } else {
        vatExemptSales += line.total;
      }
    }
  }

  const netOfVat = round2(totalSales - lessVat);
  return {
    vatableSales: round2(vatableSales),
    vatExemptSales: round2(vatExemptSales),
    vat: round2(vat),
    totalSales: round2(totalSales),
    lessVat: round2(lessVat),
    netOfVat,
    lessDiscount: round2(lessDiscount),
    addVat: round2(vat),
    totalDue: round2(netOfVat - lessDiscount + vat),
  };
}

/**
 * Shares one total across several lines in proportion to `weights`, to the
 * centavo. The last line takes whatever rounding is left, so the parts
 * always add back to exactly `total`. Used for card fees and withholding
 * tax, which are entered once per payment but need to land on each line so
 * every dentist's net collection still adds up.
 */
export function allocateProportionally(
  total: number,
  weights: number[],
): number[] {
  if (weights.length === 0) {
    return [];
  }
  const target = round2(total);
  const sum = weights.reduce((acc, weight) => acc + Math.max(weight, 0), 0);
  if (!(sum > 0)) {
    return weights.map((_, index) => (index === 0 ? target : 0));
  }

  let allocated = 0;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) {
      return round2(target - allocated);
    }
    const share = round2((target * Math.max(weight, 0)) / sum);
    allocated = round2(allocated + share);
    return share;
  });
}
