"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  checkInvoiceNumberAction,
  createInvoiceAction,
  updateInvoiceAction,
} from "@/app/cashflow/actions";
import { lookupPatientAction } from "@/app/cashflow/patient-actions";
import { FormField } from "@/components/auth/form-field";
import { PatientCombobox } from "@/components/cashflow/patient-combobox";
import { ProcedureCombobox } from "@/components/cashflow/procedure-combobox";
import { SelectField } from "@/components/cashflow/select-field";
import {
  DISCOUNT_PRESETS,
  PAYMENT_TYPES,
  TRANSACTION_TYPES,
  VISIT_TYPES,
} from "@/lib/cashflow/constants";
import { InvoiceInputSchema } from "@/lib/cashflow/invoice-schema";
import { OrBreakdown, hasOrDetail } from "@/components/cashflow/or-breakdown";
import {
  appliedToBill,
  computeMerchantFee,
  isStatutoryDiscount,
  merchantFeeRateFor,
  priceLine,
  receivedForBill,
  round2,
  standardVatOf,
  summarizeOr,
  vatTypeFromAmount,
} from "@/lib/cashflow/pricing";
import type { CashflowTransaction } from "@/lib/cashflow/schema";
import type { Branch } from "@/lib/db/branches";
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
  listPrice: string;
  /** "" = no discount, otherwise the chosen preset ("Other" = custom text). */
  discountChoice: string;
  discountCustomReason: string;
  discountMode: DiscountMode;
  discountValue: string;
  /** VAT in pesos, from the receipt. Blank = non-VAT / VAT-exempt; any
   * amount = a VATable line. */
  vatAmount: string;
};

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
  paymentAmount: string;
  paymentType: string;
  referenceNo: string;
  lines: LineState[];
  nextLineKey: number;
};

const PRESET_REASONS: string[] = DISCOUNT_PRESETS.map(
  (preset) => preset.reason,
);

function blankLine(key: number): LineState {
  return {
    key,
    id: "",
    procedure: "",
    listPrice: "",
    discountChoice: "",
    discountCustomReason: "",
    discountMode: "",
    discountValue: "",
    vatAmount: "",
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
    paymentAmount: "",
    paymentType: "",
    referenceNo: "",
    lines: [blankLine(1)],
    nextLineKey: 2,
  };
}

function asDiscountMode(value: string | undefined): DiscountMode {
  return value === "percent" || value === "amount" ? value : "";
}

function lineFromSaved(line: CashflowTransaction, key: number): LineState {
  const hasDiscount = (line.discountAmount ?? 0) > 0;
  const reason = line.discountReason ?? "";
  const choice = !hasDiscount
    ? ""
    : PRESET_REASONS.includes(reason)
      ? reason
      : "Other";
  const price =
    line.listPrice && line.listPrice > 0 ? line.listPrice : line.amountPaid;
  return {
    key,
    id: line.id,
    procedure: line.procedure,
    listPrice: price.toString(),
    discountChoice: choice,
    discountCustomReason: choice === "Other" ? reason : "",
    discountMode: hasDiscount ? asDiscountMode(line.discountMode) : "",
    discountValue: hasDiscount ? (line.discountValue ?? 0).toString() : "",
    vatAmount: savedVatAmount(line),
  };
}

function formStateFromInvoice(
  invoice: Invoice,
  lines: CashflowTransaction[],
): FormState {
  const first = lines[0];
  return {
    date: invoice.visitDate,
    invoiceNumber: invoice.invoiceNumber,
    patientName: first?.patientName ?? "",
    dentist: first?.dentist ?? "",
    transactionType: invoice.transactionType,
    visitType: invoice.visitType,
    branchId: invoice.branchId ?? "",
    remarks: first?.remarks ?? "",
    paymentAmount: "",
    paymentType: "",
    referenceNo: "",
    lines: lines.map((line, index) => lineFromSaved(line, index + 1)),
    nextLineKey: lines.length + 1,
  };
}

/** The VAT figure to show when editing a saved line. A PWD/Senior line is
 * saved with no VAT charged, so the VAT that was taken out of its price is
 * worked back from the saved amounts. */
function savedVatAmount(line: CashflowTransaction): string {
  if (line.vatType !== "vat") {
    return "";
  }
  const removed =
    isStatutoryDiscount(line.discountReason) && (line.discountAmount ?? 0) > 0
      ? (line.listPrice ?? line.amountPaid) -
        (line.amountPaid + (line.discountAmount ?? 0))
      : line.vatAmount;
  const value = round2(removed);
  return value > 0 ? value.toString() : "";
}

function discountReasonFor(line: LineState): string {
  return line.discountChoice === "Other"
    ? line.discountCustomReason.trim()
    : line.discountChoice;
}

function lineAmounts(line: LineState) {
  const listPrice = Number(line.listPrice) || 0;
  const mode: DiscountMode = line.discountChoice ? line.discountMode : "";
  const value = line.discountChoice ? Number(line.discountValue) || 0 : 0;
  const vatAmount = Number(line.vatAmount) || 0;
  const priced = priceLine({
    listPrice,
    vatType: vatTypeFromAmount(vatAmount),
    vatAmount,
    discountMode: mode,
    discountValue: value,
    discountReason: discountReasonFor(line),
  });
  return {
    listPrice,
    discountAmount: priced.discountAmount,
    total: priced.total,
    vatBase: priced.vatBase,
    vat: priced.vat,
    statutory: priced.statutory,
  };
}

type FieldErrors = Record<string, string>;

type TransactionFormProps = {
  dentistOptions: string[];
  branches?: Branch[];
  /** Known procedures from the `procedures` table (with the price and VAT
   * type each was last sold with), for the Procedure dropdown. When empty,
   * the field is a plain text input. */
  procedures?: ProcedureOption[];
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
  const [form, setForm] = useState<FormState>(
    props.mode === "edit"
      ? formStateFromInvoice(props.invoice, props.lines)
      : blankFormState(),
  );
  const procedureOptions = props.procedures ?? [];
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [justAdded, setJustAdded] = useState(false);
  const [numberWarning, setNumberWarning] = useState<string | null>(null);
  const [lookup, setLookup] = useState<{
    forKey: string;
    known: boolean;
    visitType: "NEW" | "RETURNING";
    lastVisitDate: string | null;
  } | null>(null);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateLine(index: number, patch: Partial<LineState>) {
    setForm((prev) => ({
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

  function handleProcedureChange(index: number, name: string) {
    const known = procedureOptions.find(
      (option) => option.name.toLowerCase() === name.trim().toLowerCase(),
    );
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, procedure: name };
        // Pre-fill the price and VAT type remembered for this procedure,
        // but only on a line that has no price yet — never over what staff
        // already typed.
        if (known && !line.listPrice && known.defaultPrice !== null) {
          next.listPrice = known.defaultPrice.toString();
          next.vatAmount =
            known.defaultVatType === "vat"
              ? standardVatOf(known.defaultPrice).toString()
              : "";
        }
        return next;
      }),
    }));
  }

  function chooseDiscount(index: number, choice: string) {
    const preset = DISCOUNT_PRESETS.find((item) => item.reason === choice);
    updateLine(index, {
      discountChoice: choice,
      discountCustomReason: "",
      discountMode: choice ? (preset?.mode ?? "percent") : "",
      discountValue:
        choice && preset && preset.value > 0 ? preset.value.toString() : "",
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

  async function checkNumber() {
    const number = form.invoiceNumber.trim();
    if (!number) {
      setNumberWarning(null);
      return;
    }
    try {
      const result = await checkInvoiceNumberAction(
        number,
        form.branchId,
        editingInvoiceId,
      );
      setNumberWarning(result.ok ? result.problem : null);
    } catch {
      setNumberWarning(null);
    }
  }

  const amounts = form.lines.map(lineAmounts);
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

    const input = InvoiceInputSchema.safeParse({
      date: form.date,
      invoiceNumber: form.invoiceNumber,
      patientName: form.patientName,
      dentist: form.dentist,
      transactionType: form.transactionType,
      visitType: form.visitType,
      branchId: form.branchId,
      remarks: form.remarks,
      lines: form.lines.map((line) => ({
        id: line.id,
        procedure: line.procedure,
        listPrice: Number(line.listPrice) || 0,
        discountMode: line.discountChoice ? line.discountMode : "",
        discountValue: line.discountChoice
          ? Number(line.discountValue) || 0
          : 0,
        discountReason: discountReasonFor(line),
        vatAmount: Number(line.vatAmount) || 0,
        vatType: vatTypeFromAmount(Number(line.vatAmount) || 0),
      })),
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
        const key = issue.path.join(".");
        if (key && !nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setStatus("submitting");

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

    setStatus("idle");

    if (props.mode !== "edit") {
      setForm(blankFormState());
      setNumberWarning(null);
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <FormField
            label="Invoice number"
            type="text"
            placeholder="From the invoice booklet"
            value={form.invoiceNumber}
            error={errors.invoiceNumber}
            onChange={(event) => {
              updateField("invoiceNumber", event.target.value);
              setNumberWarning(null);
            }}
            onBlur={checkNumber}
          />
          {numberWarning && !errors.invoiceNumber && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {numberWarning}
            </p>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Copy the number from the paper invoice.
          </p>
        </div>
        <FormField
          label="Date"
          type="date"
          required
          value={form.date}
          error={errors.date}
          onChange={(event) => updateField("date", event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        {props.branches && props.branches.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Branch
            </label>
            <select
              value={form.branchId}
              onChange={(event) => updateField("branchId", event.target.value)}
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

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Procedures
          </h3>
          {errors.lines && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errors.lines}
            </p>
          )}
        </div>

        {form.lines.map((line, index) => {
          const amount = amounts[index];
          const err = (field: string) => errors[`lines.${index}.${field}`];
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  label="Price"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={line.listPrice}
                  error={err("listPrice")}
                  onChange={(event) =>
                    updateLine(index, { listPrice: event.target.value })
                  }
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    VAT
                  </label>
                  {/* Blank = non-VAT / VAT-exempt; an amount = VATable. */}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label="VAT amount"
                    aria-invalid={Boolean(err("vatAmount"))}
                    placeholder="Blank = non-VAT"
                    value={line.vatAmount}
                    onChange={(event) =>
                      updateLine(index, { vatAmount: event.target.value })
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
                  />
                  {err("vatAmount") ? (
                    <p
                      role="alert"
                      className="text-sm text-red-600 dark:text-red-400"
                    >
                      {err("vatAmount")}
                    </p>
                  ) : Number(line.listPrice) > 0 &&
                    !(Number(line.vatAmount) > 0) ? (
                    <button
                      type="button"
                      onClick={() =>
                        updateLine(index, {
                          vatAmount: standardVatOf(
                            Number(line.listPrice),
                          ).toString(),
                        })
                      }
                      className="w-fit text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                    >
                      Use 12% VAT
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Discount
                  </label>
                  <select
                    value={line.discountChoice}
                    onChange={(event) =>
                      chooseDiscount(index, event.target.value)
                    }
                    className={selectClass}
                  >
                    <option value="">No discount</option>
                    {DISCOUNT_PRESETS.map((preset) => (
                      <option key={preset.reason} value={preset.reason}>
                        {preset.reason}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {line.discountChoice && (
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
                        value={line.discountValue}
                        onChange={(event) =>
                          updateLine(index, {
                            discountValue: event.target.value,
                          })
                        }
                        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
                      />
                      <select
                        aria-label="Discount type"
                        value={line.discountMode || "percent"}
                        onChange={(event) =>
                          updateLine(index, {
                            discountMode: asDiscountMode(event.target.value),
                          })
                        }
                        className="select-chevron w-20 rounded-lg border border-zinc-300 bg-white px-2.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
                  {line.discountChoice === "Other" ? (
                    <FormField
                      label="Reason"
                      type="text"
                      placeholder="Why is there a discount?"
                      value={line.discountCustomReason}
                      error={err("discountReason")}
                      onChange={(event) =>
                        updateLine(index, {
                          discountCustomReason: event.target.value,
                        })
                      }
                    />
                  ) : (
                    <div className="flex flex-col justify-end pb-2.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {amount.statutory
                        ? Number(line.vatAmount) > 0
                          ? "VAT is removed first, then 20% off the VAT-free price"
                          : "20% off the price (VAT-exempt sale)"
                        : `${line.discountChoice} discount`}
                      {err("discountReason") && (
                        <span className="text-red-600 dark:text-red-400">
                          {err("discountReason")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <p className="text-right text-sm text-zinc-600 dark:text-zinc-300">
                {amount.discountAmount > 0 && (
                  <span className="mr-3 text-xs text-zinc-500 dark:text-zinc-400">
                    −{currencyFormatter.format(amount.discountAmount)} discount
                  </span>
                )}
                Line total{" "}
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {currencyFormatter.format(amount.total)}
                </span>
              </p>
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

      <div className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
        <SummaryRow
          label="Total due"
          value={currencyFormatter.format(totalDue)}
          strong
        />
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
            <SelectField
              label="Payment type"
              placeholder="Select payment type"
              options={PAYMENT_TYPES}
              value={form.paymentType}
              onChange={(event) =>
                updateField("paymentType", event.target.value)
              }
            />
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
          </div>
          {feeRate > 0 && (
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              Merchant fee ({feeRate}% for {form.paymentType}) is added on top:
              to pay the {currencyFormatter.format(totalDue)} in full the
              patient pays{" "}
              <span className="font-medium tabular-nums">
                {currencyFormatter.format(fullAmount)}
              </span>
              .
              {paidNow > 0 && (
                <>
                  {" "}
                  Of the {currencyFormatter.format(paidNow)} entered,{" "}
                  {currencyFormatter.format(appliedNow)} pays the bill and{" "}
                  {currencyFormatter.format(merchantFeeNow)} is the merchant
                  fee.
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

      <FormField
        label="Remarks"
        type="text"
        placeholder="Optional"
        value={form.remarks}
        onChange={(event) => updateField("remarks", event.target.value)}
      />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {mode === "edit"
            ? status === "submitting"
              ? "Saving..."
              : "Save changes"
            : status === "submitting"
              ? "Adding..."
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
