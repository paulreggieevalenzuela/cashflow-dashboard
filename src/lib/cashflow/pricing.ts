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
 * The fee is ADDED ON TOP of the bill: a ₱1,000 bill at 5% costs the patient
 * ₱1,050 by card (₱1,000 for the bill + ₱50 merchant fee). So the amount of
 * a card payment is what actually goes through the terminal, and only the
 * part that is not fee counts towards the bill. Paying just ₱1,000 by card
 * leaves the bill NOT fully paid.
 *
 * Splits an amount received into the part that pays the bill and the
 * merchant fee inside it. Payment types with no fee apply in full.
 */
export function splitReceived(
  received: number,
  paymentType: string | null | undefined,
): { applied: number; fee: number } {
  const amount = round2(received);
  const rate = merchantFeeRateFor(paymentType);
  if (!(amount > 0) || rate <= 0) {
    return { applied: amount > 0 ? amount : 0, fee: 0 };
  }
  const applied = round2(amount / (1 + rate / 100));
  return { applied, fee: round2(amount - applied) };
}

/** The part of an amount received that pays the bill (the rest is fee). */
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

/** What the patient must hand over to settle `bill` with this payment type:
 * the bill plus its merchant fee (just the bill when there is no fee). */
export function receivedForBill(
  bill: number,
  paymentType: string | null | undefined,
): number {
  const rate = merchantFeeRateFor(paymentType);
  const amount = round2(bill);
  return rate > 0 && amount > 0 ? round2(amount * (1 + rate / 100)) : amount;
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
 * What the VAT field on a line means: a peso amount typed from the receipt.
 * Blank (or 0) = non-VAT / VAT-exempt; any amount = a VATable line.
 */
export function vatTypeFromAmount(
  vatAmount: number | null | undefined,
): VatType {
  return (vatAmount ?? 0) > 0 ? "vat" : "non_vat";
}

/** The standard 12% VAT contained in a VAT-inclusive price — the figure the
 * form offers as a one-click fill for the VAT field. */
export function standardVatOf(price: number): number {
  return computeVat(price, "vat").vat;
}

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
  /** The VAT peso amount typed on the line, when there is one. It is the VAT
   * contained in the amount due; without it the standard 12% is used. */
  vatAmount?: number;
  discountMode: DiscountMode | "" | undefined;
  discountValue: number;
  discountReason?: string | null;
}): PricedLineAmounts {
  const listPrice = round2(input.listPrice);
  const typedVat =
    input.vatType === "vat" && (input.vatAmount ?? 0) > 0
      ? round2(input.vatAmount ?? 0)
      : undefined;
  const hasDiscount =
    !!input.discountMode && input.discountValue > 0 && listPrice > 0;

  if (hasDiscount && isStatutoryDiscount(input.discountReason)) {
    const net =
      input.vatType !== "vat"
        ? listPrice
        : typedVat !== undefined
          ? round2(listPrice - Math.min(typedVat, listPrice))
          : computeVat(listPrice, "vat").base;
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
  if (typedVat !== undefined) {
    const vat = Math.min(typedVat, total);
    return {
      discountAmount,
      total,
      vatBase: round2(total - vat),
      vat,
      statutory: false,
    };
  }
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
