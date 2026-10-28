import type { Metadata } from "next";
import { Bullets, Detail, LegalShell } from "@/components/legal/legal-shell";
import { CLINIC } from "@/lib/cashflow/legal";

export const metadata: Metadata = {
  title: "Patient Privacy Notice | ADT Dental Clinic",
  description: "A one-page notice for patients about how the clinic handles their personal data.",
};

/** One printable page for the front desk (print from the browser: Ctrl/Cmd + P). */
export default function PatientNoticePage() {
  return (
    <LegalShell
      title="Patient Privacy Notice"
      intro="Please read this when you register. Ask our staff if anything is unclear."
    >
      <p>
        <Detail value={CLINIC.name} /> keeps a record of your visits so we can treat you and bill you
        correctly.
      </p>
      <Bullets
        items={[
          <>
            <strong>What we record:</strong> your name, contact details, birthday, the treatment you
            received and what you paid. If an HMO covers you, we also record your HMO company and
            account number and keep a copy of the authorization (LOA).
          </>,
          <>
            <strong>Why:</strong> to give and document your dental care, to claim from your HMO, and
            to keep the clinic&apos;s financial records as the law requires.
          </>,
          <>
            <strong>Who sees it:</strong> only clinic staff with an account, your HMO company when we
            claim for you, and authorities when the law requires. We never sell your data.
          </>,
          <>
            <strong>How long:</strong> as long as needed for your care and for accounting and tax
            rules.
          </>,
          <>
            <strong>Your rights:</strong> to see your records, ask for corrections, object to a use,
            and complain to the National Privacy Commission (privacy.gov.ph).
          </>,
        ]}
      />
      <p>
        Questions or requests: Data Protection Officer <Detail value={CLINIC.dpoName} />,{" "}
        <Detail value={CLINIC.dpoEmail} />, <Detail value={CLINIC.dpoPhone} />. Full details are in
        our Privacy Policy.
      </p>
      <div className="mt-10 space-y-8 border-t border-zinc-300 pt-6 print:mt-16">
        <p>
          I have read this notice and understand how my information is used.
        </p>
        <div className="grid grid-cols-2 gap-10 text-sm text-zinc-500">
          <div className="border-t border-zinc-400 pt-1">Patient name and signature</div>
          <div className="border-t border-zinc-400 pt-1">Date</div>
        </div>
      </div>
    </LegalShell>
  );
}
