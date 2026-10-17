"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  checkInvoiceNumberAction,
  createInvoiceAction,
  updateInvoiceAction,
} from "@/app/cashflow/actions";
import {
  checkDiscountIdAction,
  getSavedDiscountIdAction,
  lookupPatientAction,
} from "@/app/cashflow/patient-actions";
import { FormField } from "@/components/auth/form-field";
import { FilePicker } from "@/components/cashflow/file-picker";
import { PatientCombobox } from "@/components/cashflow/patient-combobox";
import { ProcedureCombobox } from "@/components/cashflow/procedure-combobox";
import { SelectField } from "@/components/cashflow/select-field";
import {
  DISCOUNT_ID_TYPES,
  PAYMENT_TYPES,
  TRANSACTION_TYPES,
  VISIT_TYPES,
} from "@/lib/cashflow/constants";
import { uploadAttachment } from "@/lib/cashflow/attachment-client";
import { InvoiceInputSchema } from "@/lib/cashflow/invoice-schema";
import { OrBreakdown, hasOrDetail } from "@/components/cashflow/or-breakdown";
import { suggestQuantity } from "@/lib/cashflow/price-basis";
import {
  CHECK_IN_PLACEHOLDER,
  isCheckInPlaceholder,
} from "@/lib/cashflow/visit-status";
import { PRICE_BASIS_LABELS } from "@/lib/cashflow/price-basis";
import { teethError } from "@/lib/cashflow/teeth";
import {
  appliedToBill,
  computeListPrice,
  computeMerchantFee,
  isStatutoryDiscount,
  isHmoPayment,
  merchantFeeRateFor,
  priceLine,
  receivedForBill,
  round2,
  summarizeOr,
  normalizeVatType,
  type VatType,
} from "@/lib/cashflow/pricing";
import type { CashflowTransaction } from "@/lib/cashflow/schema";
import type { Branch } from "@/lib/db/branches";
import type { DiscountTypeOption } from "@/lib/db/discount-types";
import type { Invoice } from "@/lib/db/invoices";
import type { ProcedureOption } from "@/lib/db/procedures";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const selectClass =
  "select-chevron w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40";

/** Local YYYY-MM-DD for "today" — computed from the browser's local
 * date/time rather than `toISOString()` (which is UTC and can land on the
 * wrong day near midnight in the clinic's timezone). */
function todayIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type DiscountMode = "" | "percent" | "amount";

type LineState = {
  /** Stable React key — not saved. */
  key: number;
  /** Id of the saved line when editing; blank for a new line. */
  id: string;
  procedure: string;
  /** The procedure name a saved line was recorded with ("" for a new line). */
  savedProcedure: string;
  /** Price of ONE unit (tooth, surface, arch, unit — see the procedure's
   * price basis). */
  unitPrice: string;
  quantity: string;
  /** Staff typed the quantity themselves, so changing the teeth no longer
   * rewrites it. */
  quantityTouched: boolean;
  teeth: string;
  /** Chosen discount type id; "" = no discount; LEGACY_DISCOUNT = the free
   * text reason an old line was saved with (no longer on the list). */
  discountTypeId: string;
  legacyReason: string;
  discountMode: DiscountMode;
  discountValue: string;
  /** VAT setting a saved line was recorded with. A saved line keeps it for as
   * long as it stays on the same procedure; otherwise the procedure list
   * decides, see `vatTypeFor`. */
  savedVatType: VatType;
};

const LEGACY_DISCOUNT = "legacy";

type FormState = {
  date: string;
  invoiceNumber: string;
  patientName: string;
  /** One dentist for the whole transaction. */
  dentist: string;
  transactionType: string;
  /** "" = automatic (new/returning worked out from earlier visits). */
  visitType: string;
  branchId: string;
  remarks: string;
  /** PWD / Senior citizen ID, once for the visit. */
  discountIdType: string;
  discountIdNumber: string;
  recallDate: string;
  recallReason: string;
  /** HMO authorization: LOA (can arrive the next day) and optional LOE. */
  loaNumber: string;
  loeNumber: string;
  paymentAmount: string;
  paymentType: string;
  referenceNo: string;
  /** Id of the "No procedures yet" placeholder line of a saved check-in, so
   * saving with still no procedures keeps that same line. */
  placeholderId: string;
  lines: LineState[];
  nextLineKey: number;
};

function blankLine(key: number): LineState {
  return {
    key,
    id: "",
    procedure: "",
    savedProcedure: "",
    unitPrice: "",
    quantity: "1",
    quantityTouched: false,
    teeth: "",
    discountTypeId: "",
    legacyReason: "",
    discountMode: "",
    discountValue: "",
    savedVatType: "vat",
  };
}

function blankFormState(): FormState {
  return {
    date: todayIsoDate(),
    invoiceNumber: "",
    patientName: "",
    dentist: "",
    transactionType: "",
    visitType: "",
    branchId: "",
    remarks: "",
    discountIdType: "",
    discountIdNumber: "",
    recallDate: "",
    recallReason: "",
    loaNumber: "",
    loeNumber: "",
    paymentAmount: "",
    paymentType: "",
    referenceNo: "",
    placeholderId: "",
    lines: [blankLine(1)],
    nextLineKey: 2,
  };
}

function asDiscountMode(value: string | undefined): DiscountMode {
  return value === "percent" || value === "amount" ? value : "";
}

function lineFromSaved(
  line: CashflowTransaction,
  key: number,
  discountTypes: DiscountTypeOption[],
): LineState {
  const hasDiscount = (line.discountAmount ?? 0) > 0;
  const reason = line.discountReason ?? "";
  const type = hasDiscount
    ? (discountTypes.find((item) => item.id === line.discountTypeId) ??
      discountTypes.find(
        (item) => item.name.toLowerCase() === reason.trim().toLowerCase(),
      ))
    : undefined;
  const unit =
    line.unitPrice && line.unitPrice > 0
      ? line.unitPrice
      : line.listPrice && line.listPrice > 0
        ? line.listPrice
        : line.amountPaid;
  return {
    key,
    id: line.id,
    procedure: line.procedure,
    savedProcedure: line.procedure,
    unitPrice: unit.toString(),
    quantity: String(line.quantity && line.quantity > 0 ? line.quantity : 1),
    quantityTouched: true,
    teeth: line.teeth ?? "",
    discountTypeId: !hasDiscount ? "" : type ? type.id : LEGACY_DISCOUNT,
    legacyReason: hasDiscount && !type ? reason : "",
    discountMode: hasDiscount ? asDiscountMode(line.discountMode) : "",
    discountValue: hasDiscount ? (line.discountValue ?? 0).toString() : "",
    savedVatType: normalizeVatType(line.vatType),
  };
}

function formStateFromInvoice(
  invoice: Invoice,
  lines: CashflowTransaction[],
  discountTypes: DiscountTypeOption[],
): FormState {
  const first = lines[0];
  // A check-in with no procedures yet holds one placeholder line: the form
  // shows an empty procedure row instead.
  const realLines = lines.filter((line) => !isCheckInPlaceholder(line.procedure));
  return {
    date: invoice.visitDate,
    invoiceNumber: invoice.invoiceNumber,
    patientName: first?.patientName ?? "",
    dentist: first?.dentist ?? "",
    transactionType: invoice.transactionType,
    visitType: invoice.visitType,
    branchId: invoice.branchId ?? "",
    remarks: first?.remarks ?? "",
    discountIdType: invoice.discountIdType,
    discountIdNumber: invoice.discountIdNumber,
    recallDate: invoice.recallDate ?? "",
    recallReason: invoice.recallReason,
    loaNumber: invoice.loaNumber,
    loeNumber: invoice.loeNumber,
    paymentAmount: "",
    paymentType: "",
    referenceNo: "",
    placeholderId: lines.find((line) => isCheckInPlaceholder(line.procedure))?.id ?? "",
    lines: realLines.length
      ? realLines.map((line, index) =>
          lineFromSaved(line, index + 1, discountTypes),
        )
      : [blankLine(1)],
    nextLineKey: realLines.length ? realLines.length + 1 : 2,
  };
}

/** Whether a line carries 12% VAT. A saved line keeps the setting it was
 * recorded with while it stays on the same procedure (changing the price
 * list never re-classifies an old visit); a new line, or one moved to
 * another procedure, follows the procedure list. */
function vatTypeFor(line: LineState, options: ProcedureOption[]): VatType {
  const name = line.procedure.trim().toLowerCase();
  if (
    line.savedProcedure &&
    line.savedProcedure.trim().toLowerCase() === name
  ) {
    return line.savedVatType;
  }
  const known = options.find((option) => option.name.toLowerCase() === name);
  return known ? known.defaultVatType : line.savedVatType;
}

/** The discount this line uses: the chosen type, or the old reason text. */
function discountFor(line: LineState, types: DiscountTypeOption[]) {
  if (!line.discountTypeId) {
    return { type: undefined, reason: "", statutory: false, needsId: false };
  }
  if (line.discountTypeId === LEGACY_DISCOUNT) {
    const statutory = isStatutoryDiscount(line.legacyReason);
    return {
      type: undefined,
      reason: line.legacyReason,
      statutory,
      needsId: statutory,
    };
  }
  const type = types.find((item) => item.id === line.discountTypeId);
  return {
    type,
    reason: type?.name ?? "",
    statutory: type?.statutory ?? false,
    needsId: type?.needsId ?? false,
  };
}

function lineAmounts(
  line: LineState,
  vatType: VatType,
  types: DiscountTypeOption[],
) {
  const unitPrice = Number(line.unitPrice) || 0;
  const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
  const listPrice = computeListPrice(unitPrice, quantity);
  const discount = discountFor(line, types);
  const fixed = discount.type?.defaultPercent ?? null;
  const mode: DiscountMode = line.discountTypeId
    ? fixed !== null
      ? "percent"
      : line.discountMode
    : "";
  const value = line.discountTypeId
    ? fixed !== null
      ? fixed
      : Number(line.discountValue) || 0
    : 0;
  const priced = priceLine({
    listPrice,
    vatType,
    discountMode: mode,
    discountValue: value,
    discountReason: discount.reason,
    statutory: discount.statutory,
  });
  return {
    unitPrice,
    quantity,
    listPrice,
    discountMode: mode,
    discountValue: value,
    discountAmount: priced.discountAmount,
    total: priced.total,
    vatBase: priced.vatBase,
    vat: priced.vat,
    statutory: priced.statutory,
  };
}

/** The list price of a procedure for the chosen payment method: an HMO uses
 * its own price (none = null, staff enter it); every other method uses the
 * cash price. */
function listPriceFor(
  option: ProcedureOption | undefined,
  paymentType: string,
): number | null {
  if (!option) {
    return null;
  }
  if (isHmoPayment(paymentType)) {
    return option.payerPrices[paymentType] ?? null;
  }
  return option.defaultPrice;
}

/** A line is finished once it has a procedure and a price. */
function isLineComplete(line: LineState): boolean {
  return Boolean(line.procedure.trim()) && (Number(line.unitPrice) || 0) > 0;
}

/** Nothing typed on a line that has never been saved. */
function isLineBlank(line: LineState): boolean {
  return (
    !line.id &&
    !line.procedure.trim() &&
    !line.unitPrice.trim() &&
    !line.teeth.trim() &&
    !line.discountTypeId
  );
}

/** When the last procedure is finished, a fresh empty one is added after
 * it, so staff can keep going without pressing "Add another procedure". */
function withTrailingBlank(form: FormState): FormState {
  const last = form.lines[form.lines.length - 1];
  if (!last || !isLineComplete(last)) {
    return form;
  }
  return {
    ...form,
    lines: [...form.lines, blankLine(form.nextLineKey)],
    nextLineKey: form.nextLineKey + 1,
  };
}

type FieldErrors = Record<string, string>;

type TransactionFormProps = {
  /** Start a new transaction with this patient already filled in (used by
   * "New transaction for this patient" on the patient page). */
  initialPatientName?: string;
  dentistOptions: string[];
  branches?: Branch[];
  /** Known procedures from the `procedures` table (with the price and VAT
   * type each was last sold with), for the Procedure dropdown. When empty,
   * the field is a plain text input. */
  procedures?: ProcedureOption[];
  /** The discounts staff can pick (PWD, Senior citizen, Promo). */
  discountTypes?: DiscountTypeOption[];
} & (
  | { mode?: "create"; onSuccess?: () => void }
  | {
      mode: "edit";
      invoice: Invoice;
      lines: CashflowTransaction[];
      onSuccess?: () => void;
    }
);

export function TransactionForm(props: TransactionFormProps) {
  const mode = props.mode ?? "create";
  const router = useRouter();
  const editingInvoiceId = props.mode === "edit" ? props.invoice.id : undefined;
  const discountTypes = props.discountTypes ?? [];
  const [form, setForm] = useState<FormState>(
    props.mode === "edit"
      ? formStateFromInvoice(props.invoice, props.lines, discountTypes)
      : { ...blankFormState(), patientName: props.initialPatientName ?? "" },
  );
  const procedureOptions = props.procedures ?? [];
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [justAdded, setJustAdded] = useState(false);
  const [numberWarning, setNumberWarning] = useState<string | null>(null);
  const [priceNotice, setPriceNotice] = useState<string | null>(null);
  // Photos / PDFs chosen while adding; uploaded once the transaction is saved.
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [lookup, setLookup] = useState<{
    forKey: string;
    known: boolean;
    visitType: "NEW" | "RETURNING";
    lastVisitDate: string | null;
    savedId: { type: string; last4: string } | null;
  } | null>(null);
  const [idWarning, setIdWarning] = useState<string | null>(null);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Like setForm, for edits to a procedure line: afterwards a finished last
   * line is followed by a new empty one. */
  function setFormAuto(update: (prev: FormState) => FormState) {
    setForm((prev) => withTrailingBlank(update(prev)));
  }

  function updateLine(index: number, patch: Partial<LineState>) {
    setFormAuto((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) =>
        i === index ? { ...line, ...patch } : line,
      ),
    }));
  }

  function addLine() {
    setForm((prev) => ({
      ...prev,
      lines: [...prev.lines, blankLine(prev.nextLineKey)],
      nextLineKey: prev.nextLineKey + 1,
    }));
  }

  function removeLine(index: number) {
    setForm((prev) =>
      prev.lines.length <= 1
        ? prev
        : { ...prev, lines: prev.lines.filter((_, i) => i !== index) },
    );
  }

  function findProcedure(value: string): ProcedureOption | undefined {
    return procedureOptions.find(
      (option) => option.name.toLowerCase() === value.trim().toLowerCase(),
    );
  }

  /** The quantity staff would expect for these teeth, when the procedure's
   * price basis says so (per tooth / per arch); otherwise null. */
  function quantityFor(procedure: string, teeth: string): string | null {
    const basis = findProcedure(procedure)?.priceBasis;
    const suggested = basis ? suggestQuantity(basis, teeth) : null;
    return suggested === null ? null : String(suggested);
  }

  function handleProcedureChange(index: number, name: string) {
    const known = findProcedure(name);
    setFormAuto((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => {
        if (i !== index) return line;
        // Re-committing the same name changes nothing, so an edited price
        // is never overwritten.
        if (line.procedure.trim().toLowerCase() === name.trim().toLowerCase()) {
          return { ...line, procedure: name };
        }
        const previous = findProcedure(line.procedure);
        const next: LineState = {
          ...line,
          procedure: name,
          // A saved line's VAT setting only belongs to the procedure it was
          // saved with (vatTypeFor ignores it once the name differs).
          savedVatType: "vat",
          quantityTouched: false,
        };
        if (!name.trim()) {
          // Procedure cleared: everything filled in from it goes too.
          next.unitPrice = "";
          next.quantity = "1";
        } else if (listPriceFor(known, prev.paymentType) !== null) {
          // Picking a procedure fills in its list price for the chosen
          // payment method (still editable).
          next.unitPrice = String(listPriceFor(known, prev.paymentType));
        } else if (
          listPriceFor(previous, prev.paymentType) !== null &&
          Number(line.unitPrice) === listPriceFor(previous, prev.paymentType)
        ) {
          // Moved to something with no list price: drop the old autofill.
          next.unitPrice = "";
        }
        if (name.trim()) {
          // Quantity follows the teeth already typed when the new
          // procedure is priced per tooth / per arch.
          const basis = known?.priceBasis;
          const suggested = basis ? suggestQuantity(basis, line.teeth) : null;
          next.quantity = suggested === null ? "1" : String(suggested);
        }
        return next;
      }),
    }));
  }

  function handleTeethChange(index: number, teeth: string) {
    setFormAuto((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, teeth };
        if (!line.quantityTouched) {
          const suggested = quantityFor(line.procedure, teeth);
          if (suggested !== null) {
            next.quantity = suggested;
          }
        }
        return next;
      }),
    }));
  }

  /** Changing the payment method re-prices the lines whose price is still
   * the list price of the old method (a price typed by hand is left alone). */
  function handlePaymentTypeChange(paymentType: string) {
    let changed = 0;
    const lines = form.lines.map((line) => {
      const option = findProcedure(line.procedure);
      if (!option || line.id) {
        return line;
      }
      const oldPrice = listPriceFor(option, form.paymentType);
      const current = line.unitPrice.trim();
      if (current !== "" && Number(current) !== oldPrice) {
        return line;
      }
      const newPrice = listPriceFor(option, paymentType);
      const nextText = newPrice === null ? "" : String(newPrice);
      if (nextText === current) {
        return line;
      }
      changed += 1;
      return { ...line, unitPrice: nextText };
    });
    setForm((prev) => ({ ...prev, paymentType, lines }));
    setPriceNotice(
      changed > 0
        ? `Procedure prices updated to ${isHmoPayment(paymentType) ? `${paymentType} prices` : "the cash price list"}.`
        : null,
    );
  }

  function chooseDiscount(index: number, choice: string) {
    const type = discountTypes.find((item) => item.id === choice);
    updateLine(
      index,
      choice === LEGACY_DISCOUNT
        ? { discountTypeId: choice }
        : {
            discountTypeId: choice,
            legacyReason: "",
            discountMode: choice ? "percent" : "",
            discountValue:
              type?.defaultPercent != null ? String(type.defaultPercent) : "",
          },
    );
  }

  /** Copies one line's discount to every other line of the visit. */
  function applyDiscountToAll(index: number) {
    setForm((prev) => {
      const source = prev.lines[index];
      return {
        ...prev,
        lines: prev.lines.map((line) => ({
          ...line,
          discountTypeId: source.discountTypeId,
          legacyReason: source.legacyReason,
          discountMode: source.discountMode,
          discountValue: source.discountValue,
        })),
      };
    });
  }

  // New vs returning badge: looked up (debounced) from the patient's name
  // and the visit date. The result is tagged with the name+date it was for,
  // so a stale answer is never shown against newer text.
  const lookupKey = `${form.date}|${form.patientName.trim()}`;
  useEffect(() => {
    const name = form.patientName.trim();
    if (!name || !form.date) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await lookupPatientAction(
          name,
          form.date,
          editingInvoiceId,
        );
        if (!cancelled) {
          setLookup({
            forKey: lookupKey,
            known: result.patient !== null,
            visitType: result.visitType,
            lastVisitDate: result.patient?.lastVisitDate ?? null,
            savedId: result.savedId,
          });
        }
      } catch {
        // The badge is a convenience; a failed lookup just hides it.
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.patientName, form.date, editingInvoiceId, lookupKey]);

  const activeLookup =
    lookup && lookup.forKey === lookupKey && form.patientName.trim()
      ? lookup
      : null;
  const effectiveVisitType = form.visitType || activeLookup?.visitType || "";

  /** Warns (does not block) when this PWD / Senior ID number was already
   * used for a different patient. */
  async function checkIdNumber() {
    const number = form.discountIdNumber.trim();
    if (!number) {
      setIdWarning(null);
      return;
    }
    try {
      const result = await checkDiscountIdAction(number, form.patientName);
      setIdWarning(
        result.others.length > 0
          ? `This ID number is already on file for ${result.others.join(", ")}. Check the name and the number before saving.`
          : null,
      );
    } catch {
      // A convenience check; failing quietly is fine.
    }
  }

  /** Fills the ID fields from the ID this patient used last time. */
  async function fillSavedId() {
    try {
      const result = await getSavedDiscountIdAction(form.patientName);
      if (result.id) {
        const saved = result.id;
        setForm((prev) => ({
          ...prev,
          discountIdType: saved.type,
          discountIdNumber: saved.number,
        }));
        setErrors((prev) => ({
          ...prev,
          discountIdType: "",
          discountIdNumber: "",
        }));
        setIdWarning(null);
      }
    } catch {
      // Leave the fields as they are.
    }
  }

  /** Checks the typed invoice number against the others at the same
   * branch. Returns the problem ("already used ...") or null when it is
   * fine or blank (blank = no invoice, never a duplicate). A duplicate also
   * blocks the form from being submitted. */
  async function checkNumber(
    branchId: string = form.branchId,
  ): Promise<string | null> {
    const number = form.invoiceNumber.trim();
    if (!number) {
      setNumberWarning(null);
      return null;
    }
    try {
      const result = await checkInvoiceNumberAction(
        number,
        branchId,
        editingInvoiceId,
      );
      const problem = result.ok ? result.problem : null;
      setNumberWarning(problem);
      return problem;
    } catch {
      setNumberWarning(null);
      return null;
    }
  }

  const vatTypes = form.lines.map((line) => vatTypeFor(line, procedureOptions));
  const amounts = form.lines.map((line, index) =>
    lineAmounts(line, vatTypes[index], discountTypes),
  );
  // Nothing typed on any procedure row: the visit is a check-in only.
  const noProcedures = form.lines.every(isLineBlank);
  // PWD / Senior citizen (or any type flagged "needs ID") on a line that
  // actually gets a discount: the visit must carry an ID number.
  const idRequired = form.lines.some(
    (line, index) =>
      amounts[index].discountAmount > 0 &&
      discountFor(line, discountTypes).needsId,
  );
  const orSummary = summarizeOr(amounts);
  const totalDue = round2(amounts.reduce((sum, a) => sum + a.total, 0));
  const paidNow = Number(form.paymentAmount) || 0;
  // The merchant fee is not typed: it comes from the payment type.
  const feeRate = merchantFeeRateFor(form.paymentType);
  const merchantFeeNow = computeMerchantFee(paidNow, form.paymentType);
  // A card payment is the bill PLUS its merchant fee: paying only the bill
  // by card leaves a balance.
  const fullAmount = receivedForBill(totalDue, form.paymentType);
  const appliedNow = appliedToBill(paidNow, form.paymentType);
  const balanceAfter = round2(Math.max(totalDue - appliedNow, 0));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setJustAdded(false);

    // Empty procedure lines (the spare one added after each finished line)
    // are left out; if every line is empty, keep the first so the form
    // reports what is missing.
    const keptIndexes = form.lines.flatMap((line, index) =>
      isLineBlank(line) ? [] : [index],
    );
    // No procedure typed at all: check the patient in with one placeholder
    // line; the procedures are added later while the visit is on-going.
    const checkInOnly = keptIndexes.length === 0;
    if (checkInOnly) {
      keptIndexes.push(0);
    }

    const input = InvoiceInputSchema.safeParse({
      date: form.date,
      invoiceNumber: form.invoiceNumber,
      patientName: form.patientName,
      dentist: form.dentist,
      transactionType: form.transactionType,
      visitType: form.visitType,
      branchId: form.branchId,
      remarks: form.remarks,
      discountIdType: idRequired ? form.discountIdType : "",
      discountIdNumber: idRequired ? form.discountIdNumber : "",
      recallDate: form.recallDate,
      recallReason: form.recallReason,
      loaNumber: form.loaNumber,
      loeNumber: form.loeNumber,
      lines: keptIndexes.map((index) => {
        if (checkInOnly) {
          return {
            id: form.placeholderId,
            procedure: CHECK_IN_PLACEHOLDER,
            unitPrice: 0,
            quantity: 1,
            teeth: "",
            discountTypeId: "",
            discountMode: "" as const,
            discountValue: 0,
            discountReason: "",
            vatType: "non_vat" as const,
          };
        }
        const line = form.lines[index];
        const discount = discountFor(line, discountTypes);
        return {
          id: line.id,
          procedure: line.procedure,
          unitPrice: amounts[index].unitPrice,
          quantity: amounts[index].quantity,
          teeth: line.teeth,
          discountTypeId:
            line.discountTypeId && line.discountTypeId !== LEGACY_DISCOUNT
              ? line.discountTypeId
              : "",
          discountMode: amounts[index].discountMode,
          discountValue: amounts[index].discountValue,
          discountReason: discount.reason,
          vatType: vatTypes[index],
        };
      }),
      payment:
        mode === "create"
          ? {
              amount: Number(form.paymentAmount) || 0,
              paymentType: form.paymentType,
              referenceNo: form.referenceNo,
            }
          : undefined,
    });

    if (!input.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of input.error.issues) {
        const path = [...issue.path];
        // Errors name the line by its place among the lines sent; show them
        // on the line as it is on screen.
        if (path[0] === "lines" && typeof path[1] === "number") {
          path[1] = keptIndexes[path[1]] ?? path[1];
        }
        const key = path.join(".");
        if (key && !nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    // A duplicate invoice number can't be submitted.
    setStatus("submitting");
    const duplicate = await checkNumber();
    if (duplicate) {
      setErrors({ invoiceNumber: duplicate });
      setStatus("idle");
      return;
    }

    setErrors({});

    const result =
      props.mode === "edit"
        ? await updateInvoiceAction(props.invoice.id, input.data)
        : await createInvoiceAction(input.data);

    if (!result.ok) {
      setStatus("idle");
      setFormError(result.message);
      if (result.fieldErrors) {
        setErrors(result.fieldErrors);
      }
      return;
    }

    // Attach the chosen invoice / proof-of-payment files to the new visit.
    let uploadProblem: string | null = null;
    if (props.mode !== "edit") {
      const uploads = [
        ...invoiceFiles.map((file) => ({ file, kind: "invoice" as const })),
        ...receiptFiles.map((file) => ({ file, kind: "receipt" as const })),
      ];
      for (const upload of uploads) {
        const uploaded = await uploadAttachment({
          invoiceId: result.data.invoiceId,
          kind: upload.kind,
          file: upload.file,
          toOnlyPayment: upload.kind === "receipt",
        });
        if (!uploaded.ok) {
          uploadProblem = `${upload.file.name}: ${uploaded.message}`;
          break;
        }
      }
    }

    setStatus("idle");

    if (props.mode !== "edit") {
      setForm(blankFormState());
      setNumberWarning(null);
      setInvoiceFiles([]);
      setReceiptFiles([]);
    }
    if (uploadProblem) {
      // The transaction itself is saved; only a file failed. Stay open so the
      // message is seen, and say where to attach it again.
      setFormError(
        `The transaction was saved, but a file could not be attached (${uploadProblem}). Open the transaction to attach it again.`,
      );
      router.refresh();
      return;
    }
    setJustAdded(true);
    router.refresh();
    window.setTimeout(() => setJustAdded(false), 2500);
    if (props.onSuccess) {
      window.setTimeout(() => props.onSuccess?.(), 700);
    }
  }

  function dentistChoicesFor(value: string): string[] {
    return !value || props.dentistOptions.includes(value)
      ? props.dentistOptions
      : [value, ...props.dentistOptions];
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {formError}
        </div>
      )}
      {justAdded && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {mode === "edit" ? "Transaction updated." : "Transaction added."}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField
          label="Date"
          type="date"
          required
          value={form.date}
          error={errors.date}
          onChange={(event) => updateField("date", event.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <PatientCombobox
            value={form.patientName}
            onChange={(value) => updateField("patientName", value)}
            error={errors.patientName}
            required
          />
          {activeLookup && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
                  effectiveVisitType === "RETURNING"
                    ? "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                {effectiveVisitType === "RETURNING" ? "Returning" : "New"}{" "}
                patient
              </span>
              {activeLookup.known
                ? activeLookup.lastVisitDate
                  ? `Seen before — last visit ${activeLookup.lastVisitDate}.`
                  : "On file, no earlier visit."
                : "Not on file yet — will be added when you save."}
            </p>
          )}
        </div>
        <SelectField
          label="Visit type"
          placeholder={
            activeLookup
              ? `Automatic (${activeLookup.visitType === "RETURNING" ? "Returning" : "New"})`
              : "Automatic"
          }
          options={VISIT_TYPES}
          value={form.visitType}
          error={errors.visitType}
          onChange={(event) => updateField("visitType", event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SelectField
          label="Dentist"
          placeholder={
            props.dentistOptions.length > 0
              ? "Select dentist"
              : "No dentist accounts yet"
          }
          options={dentistChoicesFor(form.dentist)}
          value={form.dentist}
          error={errors.dentist}
          disabled={props.dentistOptions.length === 0}
          onChange={(event) => updateField("dentist", event.target.value)}
        />
        <SelectField
          label="Transaction type"
          required
          placeholder="Select transaction type"
          options={TRANSACTION_TYPES}
          value={form.transactionType}
          error={errors.transactionType}
          onChange={(event) =>
            updateField("transactionType", event.target.value)
          }
        />
        {props.branches && props.branches.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Branch
            </label>
            <select
              value={form.branchId}
              onChange={(event) => {
                updateField("branchId", event.target.value);
                // The same number can be fine at another branch.
                void checkNumber(event.target.value);
              }}
              className={selectClass}
            >
              <option value="">No branch</option>
              {props.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {mode === "create" ? "Payment method & invoice" : "Invoice"}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {mode === "create" && (
            <div className="flex flex-col gap-1.5">
              <SelectField
                label="Payment method (optional, can be added later)"
                placeholder="Select payment method"
                options={PAYMENT_TYPES}
                value={form.paymentType}
                onChange={(event) =>
                  handlePaymentTypeChange(event.target.value)
                }
              />
              {priceNotice && (
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  {priceNotice}
                </p>
              )}
              {isHmoPayment(form.paymentType) && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {form.paymentType} prices are used for the procedures below. A
                  procedure with no {form.paymentType} price is left blank for
                  you to enter.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <FormField
              label="Invoice number"
              type="text"
              placeholder="Leave blank if there is no invoice"
              value={form.invoiceNumber}
              error={errors.invoiceNumber}
              onChange={(event) => {
                updateField("invoiceNumber", event.target.value);
                setNumberWarning(null);
                setErrors((prev) => ({ ...prev, invoiceNumber: "" }));
              }}
              onBlur={() => void checkNumber()}
            />
            {numberWarning && !errors.invoiceNumber && (
              <p
                role="alert"
                className="text-xs text-red-600 dark:text-red-400"
              >
                {numberWarning} Use a different number, or leave it blank if
                there is no invoice.
              </p>
            )}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Copy the number from the paper invoice. Blank means this
              transaction has no invoice.
            </p>
          </div>
          {mode === "create" && (
            <div className="sm:col-span-2">
              <FilePicker
                label="Invoice photo / PDF (optional)"
                hint="JPG, PNG or PDF. Phone photos are shrunk automatically."
                files={invoiceFiles}
                onChange={setInvoiceFiles}
              />
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Procedures
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Optional at check-in. Leave them empty to put the patient in the
              queue now, then add the procedures with Edit transaction while
              the visit is on-going.
            </p>
          </div>
          {errors.lines && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errors.lines}
            </p>
          )}
        </div>

        {form.lines.map((line, index) => {
          const amount = amounts[index];
          const err = (field: string) => errors[`lines.${index}.${field}`];
          const known = findProcedure(line.procedure);
          const basis = known?.priceBasis ?? "flat";
          const discount = discountFor(line, discountTypes);
          const fixedPercent = discount.type?.defaultPercent ?? null;
          const teethProblem = err("teeth") ?? teethError(line.teeth);
          return (
            <div
              key={line.key}
              className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Procedure {index + 1}
                </p>
                {form.lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    Remove
                  </button>
                )}
              </div>

              <ProcedureCombobox
                value={line.procedure}
                options={procedureOptions.map((option) => option.name)}
                onChange={(value) => handleProcedureChange(index, value)}
                error={err("procedure")}
                required
              />

              <div className="flex flex-col gap-1.5">
                <FormField
                  label="Teeth"
                  type="text"
                  placeholder="e.g. 11, 12, 21 or upper arch (optional)"
                  value={line.teeth}
                  error={teethProblem ?? undefined}
                  onChange={(event) =>
                    handleTeethChange(index, event.target.value)
                  }
                />
                {basis !== "flat" && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    The price is {PRICE_BASIS_LABELS[basis].toLowerCase()}.
                    {basis === "tooth" || basis === "arch"
                      ? " The quantity follows the teeth you enter; you can still change it."
                      : " Enter how many in Qty."}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <FormField
                  label={basis === "flat" ? "Unit price" : "Price each"}
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={line.unitPrice}
                  error={err("unitPrice")}
                  onChange={(event) =>
                    updateLine(index, { unitPrice: event.target.value })
                  }
                />
                <FormField
                  label="Qty"
                  type="number"
                  min="1"
                  step="1"
                  value={line.quantity}
                  error={err("quantity")}
                  onChange={(event) =>
                    updateLine(index, {
                      quantity: event.target.value,
                      quantityTouched: true,
                    })
                  }
                />
                <ReadOnlyAmount
                  label="Sub total"
                  value={currencyFormatter.format(amount.listPrice)}
                />
                <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Discount
                  </label>
                  <select
                    value={line.discountTypeId}
                    onChange={(event) =>
                      chooseDiscount(index, event.target.value)
                    }
                    className={selectClass}
                  >
                    <option value="">No discount</option>
                    {discountTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                    {line.legacyReason && (
                      <option value={LEGACY_DISCOUNT}>
                        {line.legacyReason} (old)
                      </option>
                    )}
                  </select>
                </div>
                <ReadOnlyAmount
                  label="Net total"
                  strong
                  value={currencyFormatter.format(amount.total)}
                />
              </div>

              {isHmoPayment(form.paymentType) &&
                known &&
                known.payerPrices[form.paymentType] === undefined && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    No {form.paymentType} price for this procedure — enter
                    the price.
                  </p>
                )}

              {line.discountTypeId && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Amount off
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label="Discount value"
                        aria-invalid={Boolean(err("discountValue"))}
                        placeholder="0"
                        readOnly={fixedPercent !== null}
                        value={
                          fixedPercent !== null
                            ? String(fixedPercent)
                            : line.discountValue
                        }
                        onChange={(event) =>
                          updateLine(index, {
                            discountValue: event.target.value,
                          })
                        }
                        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors placeholder:text-zinc-400 read-only:bg-zinc-100 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:read-only:bg-zinc-800 dark:focus:ring-amber-900/40"
                      />
                      <select
                        aria-label="Discount unit"
                        disabled={fixedPercent !== null}
                        value={
                          fixedPercent !== null
                            ? "percent"
                            : line.discountMode || "percent"
                        }
                        onChange={(event) =>
                          updateLine(index, {
                            discountMode: asDiscountMode(event.target.value),
                          })
                        }
                        className="select-chevron w-20 rounded-lg border border-zinc-300 bg-white px-2.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:disabled:bg-zinc-800"
                      >
                        <option value="percent">%</option>
                        <option value="amount">₱</option>
                      </select>
                    </div>
                    {err("discountValue") && (
                      <p
                        role="alert"
                        className="text-sm text-red-600 dark:text-red-400"
                      >
                        {err("discountValue")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col justify-end gap-1 pb-2.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>
                      {amount.statutory
                        ? vatTypes[index] === "vat"
                          ? "VAT is removed first, then 20% off the VAT-free price"
                          : "20% off the price (VAT-exempt sale)"
                        : `${discount.reason || "Discount"} discount`}
                    </span>
                    {amount.discountAmount > 0 && (
                      <span>
                        −{currencyFormatter.format(amount.discountAmount)} off
                      </span>
                    )}
                    {err("discountReason") && (
                      <span className="text-red-600 dark:text-red-400">
                        {err("discountReason")}
                      </span>
                    )}
                    {form.lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => applyDiscountToAll(index)}
                        className="w-fit font-medium text-amber-700 hover:underline dark:text-amber-400"
                      >
                        Apply to all lines
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={addLine}
          className="rounded-lg border border-dashed border-zinc-300 px-3.5 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 dark:border-zinc-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
        >
          + Add another procedure
        </button>
      </section>

      <>
        <div className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          <SummaryRow
            label="Total due"
            value={currencyFormatter.format(totalDue)}
            strong
          />
          {orSummary.vat > 0 && (
            <SummaryRow
              label="VAT (12%), included in the total"
              value={currencyFormatter.format(orSummary.vat)}
            />
          )}
          {hasOrDetail(orSummary) && (
            <details className="pt-2" open>
              <summary className="cursor-pointer text-xs font-medium text-zinc-500 dark:text-zinc-400">
                OR breakdown (VAT / PWD-SC)
              </summary>
              <div className="pt-2">
                <OrBreakdown summary={orSummary} />
              </div>
            </details>
          )}
        </div>

        {mode === "create" ? (
          <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Payment received now
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <FormField
                  label="Amount received"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.paymentAmount}
                  error={errors["payment.amount"] ?? errors.paymentAmount}
                  onChange={(event) =>
                    updateField("paymentAmount", event.target.value)
                  }
                />
                {totalDue > 0 && paidNow !== fullAmount && (
                  <button
                    type="button"
                    onClick={() =>
                      updateField("paymentAmount", fullAmount.toString())
                    }
                    className="w-fit text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                  >
                    Paid in full ({currencyFormatter.format(fullAmount)})
                  </button>
                )}
              </div>
              {form.paymentType ? (
                <ReadOnlyAmount label="Paid by" value={form.paymentType} />
              ) : (
                <SelectField
                  label="Payment type"
                  placeholder="Select payment type"
                  options={PAYMENT_TYPES}
                  value={form.paymentType}
                  onChange={(event) =>
                    updateField("paymentType", event.target.value)
                  }
                />
              )}
              <div className="sm:col-span-2">
                <FormField
                  label="Reference no."
                  type="text"
                  placeholder="Card slip / GCash / transfer ref."
                  value={form.referenceNo}
                  onChange={(event) =>
                    updateField("referenceNo", event.target.value)
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <FilePicker
                  label="Proof of payment (optional)"
                  hint="Card slip, GCash or bank-transfer screenshot."
                  files={receiptFiles}
                  onChange={setReceiptFiles}
                />
              </div>
            </div>
            {feeRate > 0 && (
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                Merchant fee ({feeRate}% for {form.paymentType}) is included
                in the payment, not added on top.
                {paidNow > 0 && (
                  <>
                    {" "}
                    Of the {currencyFormatter.format(paidNow)} paid,{" "}
                    {currencyFormatter.format(merchantFeeNow)} is the merchant
                    fee, so the clinic receives{" "}
                    {currencyFormatter.format(
                      round2(paidNow - merchantFeeNow),
                    )}
                    .
                  </>
                )}
              </p>
            )}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {paidNow <= 0
                ? "Nothing received yet — the transaction will show as not paid. You can record payments later."
                : balanceAfter > 0
                  ? `Balance after this payment: ${currencyFormatter.format(balanceAfter)}.`
                  : "Paid in full."}
            </p>
          </section>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Payments are recorded and removed in the Payments section.
          </p>
        )}
      </>

      {idRequired && (
        <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            PWD / Senior citizen ID
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="ID type"
              required
              placeholder="Select ID type"
              options={DISCOUNT_ID_TYPES}
              value={form.discountIdType}
              error={errors.discountIdType}
              onChange={(event) =>
                updateField("discountIdType", event.target.value)
              }
            />
            <FormField
              label="ID number"
              type="text"
              required
              placeholder="As printed on the ID"
              value={form.discountIdNumber}
              error={errors.discountIdNumber}
              onChange={(event) => {
                updateField("discountIdNumber", event.target.value);
                setIdWarning(null);
              }}
              onBlur={() => void checkIdNumber()}
            />
          </div>
          {activeLookup?.savedId && !form.discountIdNumber.trim() && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              An ID is on file for this patient (ending{" "}
              {activeLookup.savedId.last4}).{" "}
              <button
                type="button"
                onClick={() => void fillSavedId()}
                className="font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
              >
                Use ID on file
              </button>
            </p>
          )}
          {idWarning && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {idWarning}
            </p>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            The ID number is required for these discounts and is printed on the
            invoice.
          </p>
        </section>
      )}

      <HmoAuthorizationSection
        loaNumber={form.loaNumber}
        loeNumber={form.loeNumber}
        errors={errors}
        isHmo={
          isHmoPayment(form.paymentType) ||
          (props.mode === "edit" &&
            props.lines.some((line) => isHmoPayment(line.paymentType)))
        }
        onChange={(key, value) => updateField(key, value)}
      />

      <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Recall (optional)
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Come back on"
            type="date"
            value={form.recallDate}
            error={errors.recallDate}
            onChange={(event) => updateField("recallDate", event.target.value)}
          />
          <FormField
            label="Reason"
            type="text"
            placeholder="e.g. 6-month cleaning, follow-up"
            value={form.recallReason}
            onChange={(event) =>
              updateField("recallReason", event.target.value)
            }
          />
        </div>
      </section>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="remarks"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Remarks
        </label>
        <textarea
          id="remarks"
          rows={3}
          placeholder="Optional"
          value={form.remarks}
          onChange={(event) => updateField("remarks", event.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "submitting" || Boolean(numberWarning)}
          className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {mode === "edit"
            ? status === "submitting"
              ? "Saving..."
              : "Save changes"
            : status === "submitting"
              ? "Adding..."
              : noProcedures
                ? "Check in (add procedures later)"
                : "Add transaction"}
        </button>
        {props.mode === "edit" &&
          (props.onSuccess ? (
            // Modal context (table row action, or the detail page's Edit
            // button) — just close it, no save, no navigation.
            <button
              type="button"
              onClick={() => props.onSuccess?.()}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
          ) : (
            // Standalone /edit page fallback (no modal to close) — back out
            // to the transaction's detail page instead.
            <Link
              href={`/cashflow/transactions/${encodeURIComponent(props.lines[0]?.id ?? "")}`}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Cancel
            </Link>
          ))}
      </div>
    </form>
  );
}

function ReadOnlyAmount({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      <span
        className={`flex min-h-[42px] items-center rounded-lg bg-zinc-100 px-3.5 text-sm tabular-nums dark:bg-zinc-800 ${
          strong
            ? "font-semibold text-zinc-900 dark:text-zinc-50"
            : "text-zinc-700 dark:text-zinc-300"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        strong
          ? "text-base font-semibold text-zinc-900 dark:text-zinc-50"
          : muted
            ? "text-xs text-zinc-500 dark:text-zinc-400"
            : "text-zinc-600 dark:text-zinc-300"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * LOA / LOE for an HMO visit. Neither is needed to save: the LOA often comes
 * the next day, and until it is entered the visit shows "LOA pending" and
 * can't be Cleared. Open by default for an HMO visit, tucked away otherwise
 * (a payment recorded later from the Payments panel can still make it one).
 */
function HmoAuthorizationSection({
  loaNumber,
  loeNumber,
  errors,
  isHmo,
  onChange,
}: {
  loaNumber: string;
  loeNumber: string;
  errors: FieldErrors;
  isHmo: boolean;
  onChange: (key: "loaNumber" | "loeNumber", value: string) => void;
}) {
  const hasValues = Boolean(loaNumber.trim() || loeNumber.trim());
  return (
    <details
      key={isHmo ? "hmo" : "other"}
      open={isHmo || hasValues}
      className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        HMO authorization {isHmo ? "" : "(only for HMO visits)"}
      </summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="LOA number"
            type="text"
            placeholder="Leave blank if it hasn't arrived yet"
            value={loaNumber}
            error={errors.loaNumber}
            onChange={(event) => onChange("loaNumber", event.target.value)}
          />
          <FormField
            label="LOE number (optional)"
            type="text"
            value={loeNumber}
            error={errors.loeNumber}
            onChange={(event) => onChange("loeNumber", event.target.value)}
          />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          The LOA is often given the day after the visit. Save without it and
          the visit is marked &ldquo;LOA pending&rdquo;; come back with{" "}
          <span className="font-medium">Edit transaction</span> to add it. A
          pending visit can&apos;t be Cleared until the LOA number is in.
        </p>
      </div>
    </details>
  );
}
