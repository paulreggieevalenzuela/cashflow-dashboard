import type { Metadata } from "next";
import { Detail, LegalShell, Section } from "@/components/legal/legal-shell";
import { CLINIC } from "@/lib/cashflow/legal";

export const metadata: Metadata = {
  title: "Contact | ADT Dental Clinic",
  description: "How to get help, report a problem or make a data privacy request.",
};

export default function ContactPage() {
  return (
    <LegalShell
      title="Contact"
      showUpdated={false}
      intro="Who to reach for help with the Cashflow system, and for privacy matters."
    >
      <Section title="System help and access">
        <p>
          Forgot your password, need an account, or something does not look right? Ask your branch
          admin first. If you cannot reach them:
        </p>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[10rem_1fr]">
          <dt className="font-medium text-zinc-900 dark:text-zinc-100">E-mail</dt>
          <dd><Detail value={CLINIC.supportEmail} /></dd>
          <dt className="font-medium text-zinc-900 dark:text-zinc-100">Phone</dt>
          <dd><Detail value={CLINIC.phone} /></dd>
          <dt className="font-medium text-zinc-900 dark:text-zinc-100">Hours</dt>
          <dd><Detail value={CLINIC.supportHours} /></dd>
          <dt className="font-medium text-zinc-900 dark:text-zinc-100">Address</dt>
          <dd><Detail value={CLINIC.address} /></dd>
        </dl>
      </Section>

      <Section title="Privacy requests and suspected data breaches">
        <p>
          To see, correct or object to the use of your personal data, or to report a lost device, a
          wrong person seeing patient data or any other suspected breach, contact our Data
          Protection Officer immediately. Breaches must be reported to the National Privacy
          Commission within 72 hours, so please do not wait.
        </p>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[10rem_1fr]">
          <dt className="font-medium text-zinc-900 dark:text-zinc-100">Data Protection Officer</dt>
          <dd><Detail value={CLINIC.dpoName} /></dd>
          <dt className="font-medium text-zinc-900 dark:text-zinc-100">E-mail</dt>
          <dd><Detail value={CLINIC.dpoEmail} /></dd>
          <dt className="font-medium text-zinc-900 dark:text-zinc-100">Phone</dt>
          <dd><Detail value={CLINIC.dpoPhone} /></dd>
        </dl>
      </Section>
    </LegalShell>
  );
}
