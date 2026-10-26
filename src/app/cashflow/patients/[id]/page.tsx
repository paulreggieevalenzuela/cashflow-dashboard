import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { AddTransactionModal } from "@/components/cashflow/add-transaction-modal";
import { AuditTrail } from "@/components/cashflow/audit-trail";
import { MergePatient } from "@/components/cashflow/merge-patient";
import { PatientFormModal } from "@/components/cashflow/patient-form-modal";
import { LoaPendingBadge } from "@/components/cashflow/loa-pending-badge";
import { VisitStatusControl } from "@/components/cashflow/visit-status-control";
import { maskId } from "@/lib/cashflow/mask";
import { ageFromBirthDate, formatBirthDate } from "@/lib/cashflow/patient-hmo";
import { VISIT_STATUSES, isVisitStatus } from "@/lib/cashflow/visit-status";
import { listAuditForPatient } from "@/lib/db/audit";
import { listBranches } from "@/lib/db/branches";
import { listDentistUsers } from "@/lib/db/dentists";
import { listActiveDiscountTypes } from "@/lib/db/discount-types";
import { getPatientProfile } from "@/lib/db/patient-admin";
import { listProcedureOptions } from "@/lib/db/procedures";

export const metadata: Metadata = { title: "Patient" };

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "warn"
            ? "text-amber-700 dark:text-amber-400"
            : "text-zinc-900 dark:text-zinc-50"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; balance?: string }>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const statusFilter = isVisitStatus(raw.status) ? raw.status : undefined;
  const balanceOnly = raw.balance === "1";

  const [session, profile] = await Promise.all([auth(), getPatientProfile(id)]);
  const isAdmin = session?.user.role === "admin";

  if (!profile) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        <p>
          We couldn&rsquo;t find that patient. They may have been merged or
          removed.
        </p>
        <Link
          href="/cashflow/patients"
          className="mt-3 inline-block font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
        >
          ← Back to patients
        </Link>
      </div>
    );
  }

  const [dentists, branches, procedures, discountTypes, audit] =
    await Promise.all([
      listDentistUsers(),
      listBranches(),
      listProcedureOptions(),
      listActiveDiscountTypes(),
      isAdmin ? listAuditForPatient(id) : Promise.resolve([]),
    ]);

  const { patient, totals } = profile;
  const shown = profile.invoices.filter(
    (row) =>
      (!statusFilter || row.status === statusFilter) &&
      (!balanceOnly || row.balanceDue > 0),
  );

  const chipBase =
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors";
  const chipOn =
    "border-amber-600 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  const chipOff =
    "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800";
  const href = (status?: string, balance?: boolean) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (balance) params.set("balance", "1");
    const qs = params.toString();
    return `/cashflow/patients/${id}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Link
            href="/cashflow/patients"
            className="text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
          >
            ← Back to patients
          </Link>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {patient.fullName}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {patient.contactNumber || "No contact number"}
            {profile.lastDiscountId
              ? ` · PWD / Senior ID on file${profile.lastDiscountId.type ? ` (${profile.lastDiscountId.type})` : ""}: ${isAdmin ? profile.lastDiscountId.number : maskId(profile.lastDiscountId.number)}`
              : ""}
          </p>
          {(patient.birthDate || patient.hmoCompany || patient.hmoAccountNumber) && (
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {patient.birthDate && (
                <div className="flex gap-1.5">
                  <dt className="text-zinc-500 dark:text-zinc-400">Birthday</dt>
                  <dd className="text-zinc-900 dark:text-zinc-50">
                    {formatBirthDate(patient.birthDate)}
                    {ageFromBirthDate(patient.birthDate) !== null &&
                      ` (${ageFromBirthDate(patient.birthDate)})`}
                  </dd>
                </div>
              )}
              {patient.hmoCompany && (
                <div className="flex gap-1.5">
                  <dt className="text-zinc-500 dark:text-zinc-400">HMO</dt>
                  <dd className="text-zinc-900 dark:text-zinc-50">
                    {patient.hmoCompany}
                  </dd>
                </div>
              )}
              {patient.hmoAccountNumber && (
                <div className="flex gap-1.5">
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    Account no.
                  </dt>
                  <dd className="font-mono text-zinc-900 dark:text-zinc-50">
                    {patient.hmoAccountNumber}
                  </dd>
                </div>
              )}
            </dl>
          )}
          {patient.notes && (
            <p className="mt-1 max-w-xl whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">
              {patient.notes}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PatientFormModal
            initial={{
              id: patient.id,
              fullName: patient.fullName,
              contactNumber: patient.contactNumber,
              notes: patient.notes,
              birthDate: patient.birthDate,
              hmoCompany: patient.hmoCompany,
              hmoAccountNumber: patient.hmoAccountNumber,
            }}
            buttonLabel="Edit patient"
            buttonClassName="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          />
          <AddTransactionModal
            initialPatientName={patient.fullName}
            buttonLabel="New transaction for this patient"
            dentistOptions={dentists.map((dentist) => dentist.name)}
            branches={branches}
            procedures={procedures}
            discountTypes={discountTypes}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Card label="Visits" value={String(totals.visits)} />
        <Card
          label="Total billed"
          value={currencyFormatter.format(totals.billed)}
        />
        <Card
          label="Total paid"
          value={currencyFormatter.format(totals.paid)}
        />
        <Card
          label="Balance due"
          value={currencyFormatter.format(totals.balanceDue)}
          tone={totals.balanceDue > 0 ? "warn" : undefined}
        />
        <Card label="Last visit" value={totals.lastVisitDate ?? "—"} />
        <Card
          label="Next recall"
          value={totals.nextRecall ? totals.nextRecall.date : "—"}
        />
      </div>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Invoices{" "}
            <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
              ({shown.length}
              {shown.length !== profile.invoices.length
                ? ` of ${profile.invoices.length}`
                : ""}
              )
            </span>
          </h3>
          <div className="flex flex-wrap gap-2">
            <Link
              href={href(undefined, false)}
              className={`${chipBase} ${!statusFilter && !balanceOnly ? chipOn : chipOff}`}
            >
              All
            </Link>
            {VISIT_STATUSES.map((status) => (
              <Link
                key={status}
                href={href(status, balanceOnly)}
                className={`${chipBase} ${statusFilter === status ? chipOn : chipOff}`}
              >
                {status}
              </Link>
            ))}
            <Link
              href={href(statusFilter, !balanceOnly)}
              className={`${chipBase} ${balanceOnly ? chipOn : chipOff}`}
            >
              With balance
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Procedures</th>
                <th className="px-4 py-3 font-medium">Dentist</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Paid</th>
                <th className="px-4 py-3 text-right font-medium">Balance</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {shown.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
                  >
                    {profile.invoices.length === 0
                      ? "No invoices yet for this patient."
                      : "No invoices match this filter."}
                  </td>
                </tr>
              ) : (
                shown.map((row) => (
                  <tr
                    key={row.invoiceId}
                    className="align-top text-zinc-700 dark:text-zinc-300"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.visitDate}
                      {row.transactionType !== "Visit" && (
                        <span className="block text-xs text-zinc-500">
                          {row.transactionType}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.invoiceNumber || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.procedures.slice(0, 3).join(", ")}
                      {row.procedures.length > 3 && (
                        <span className="text-xs text-zinc-500">
                          {" "}
                          +{row.procedures.length - 3} more
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{row.dentist || "—"}</td>
                    <td className="px-4 py-3">{row.branchName || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.paymentType || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {currencyFormatter.format(row.totalDue)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {currencyFormatter.format(row.collected)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {row.balanceDue > 0 ? (
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                          {currencyFormatter.format(row.balanceDue)}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <VisitStatusControl
                        invoiceId={row.invoiceId}
                        status={row.status}
                        balanceDue={row.balanceDue}
                        isAdmin={isAdmin}
                        loaMissing={row.loaMissing}
                        visitIssue={row.visitIssue}
                        layout="stacked"
                      />
                      {row.loaPending && (
                        <LoaPendingBadge className="mt-1" />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link
                        href={`/cashflow/transactions/${encodeURIComponent(row.firstLineId)}`}
                        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Audit trail
            </h3>
            <AuditTrail
              entries={audit}
              emptyText="No changes have been logged for this patient yet."
            />
          </section>
          <MergePatient sourceId={patient.id} sourceName={patient.fullName} />
        </>
      )}
    </div>
  );
}
