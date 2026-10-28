import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Detail, LegalShell, Section } from "@/components/legal/legal-shell";
import { CLINIC } from "@/lib/cashflow/legal";

export const metadata: Metadata = {
  title: "Privacy Policy | ADT Dental Clinic",
  description:
    "How ADT Dental Clinic collects, uses, protects and shares personal data in its Cashflow system.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      intro="This explains what personal data the clinic's Cashflow system holds, why, who can see it, how long it is kept, and what rights you have under the Data Privacy Act of 2012 (Republic Act No. 10173)."
    >
      <Section title="1. Who is responsible">
        <p>
          <Detail value={CLINIC.name} /> (<Detail value={CLINIC.registeredName} />), located at{" "}
          <Detail value={CLINIC.address} />, decides what personal data is collected and why, and is
          the &quot;personal information controller&quot;. Our Data Protection Officer is{" "}
          <Detail value={CLINIC.dpoName} />, reachable at <Detail value={CLINIC.dpoEmail} />
          {" "}or <Detail value={CLINIC.dpoPhone} />.
        </p>
      </Section>

      <Section title="2. What we collect">
        <p className="font-medium text-zinc-900 dark:text-zinc-100">Patients</p>
        <Bullets
          items={[
            "Name, contact details and birthday.",
            "HMO company and HMO account number, where the visit is billed to an HMO.",
            "PWD or Senior Citizen ID number, when a discount is claimed.",
            "Visit and billing records: the procedures done, the dentist, amounts charged, discounts, payments, balances and reservation fees.",
            "Documents attached to a visit, such as an HMO Letter of Authorization (LOA), a Letter of Engagement (LOE) or a receipt.",
          ]}
        />
        <p>
          Information about the treatment you receive is health information, which the law treats
          as <em>sensitive personal information</em> and protects more strictly.
        </p>
        <p className="font-medium text-zinc-900 dark:text-zinc-100">Staff who use the system</p>
        <Bullets
          items={[
            "Name, work e-mail address, role and branch.",
            "A scrambled (hashed) form of your password. The password itself is never stored or readable.",
            "Sign-in records: time, outcome, network address and browser type, kept to stop password guessing and to investigate incidents.",
            "An audit trail of changes made in the system (who changed what, and when).",
          ]}
        />
      </Section>

      <Section title="3. Why we use it">
        <Bullets
          items={[
            "To provide and record dental care and to bill for it correctly.",
            "To claim from HMO companies on behalf of patients.",
            "To keep the clinic's financial records, issue receipts and meet tax and accounting obligations.",
            "To pay dentists their commissions.",
            "To keep the system secure and to find and fix mistakes.",
          ]}
        />
        <p>
          We do not sell personal data, and we do not use it for advertising or profiling.
        </p>
      </Section>

      <Section title="4. Who can see it">
        <p>
          Only clinic staff who have been given an account. Access depends on the role: admins can
          see everything; front-desk staff and dentists see what they need for billing and the
          visits of their branch; sensitive ID numbers are partly hidden from non-admins.
        </p>
        <p>We share personal data outside the clinic only when needed to run the service:</p>
        <Bullets
          items={[
            "With the patient's HMO company, to verify coverage and be paid.",
            "With the technology providers that host the system and its database, who process data on our instructions under confidentiality and security terms.",
            "With government agencies or other parties when the law requires it.",
          ]}
        />
      </Section>

      <Section title="5. How we protect it">
        <Bullets
          items={[
            "Every page and data request requires sign-in; access is by role and branch.",
            "Connections are encrypted (HTTPS) and the site sends browser security headers.",
            "Sessions end after 30 minutes of inactivity, and in any case after 12 hours.",
            "Repeated wrong passwords temporarily lock the sign-in.",
            "Changes are recorded in an audit trail.",
            "Database backups are kept so that records can be restored.",
          ]}
        />
        <p>
          If a breach puts your sensitive personal information at risk of serious harm, we will
          notify you and the National Privacy Commission within 72 hours of knowing about it, as the
          law requires.
        </p>
      </Section>

      <Section title="6. How long we keep it">
        <p>
          Patient and billing records are kept for as long as needed for dental care, accounting
          and tax requirements, as set by the clinic&apos;s retention policy (
          <Detail value="TO BE CONFIRMED" />
          ). After that period records are securely archived or anonymised. Sign-in records are
          deleted automatically after about 90 days.
        </p>
      </Section>

      <Section title="7. Your rights">
        <p>You may ask the clinic to:</p>
        <Bullets
          items={[
            "tell you what personal data we hold about you and give you a copy;",
            "correct data that is wrong or out of date;",
            "stop, block or remove data that is unlawfully held or no longer needed (some billing records must be kept by law, so they cannot always be erased);",
            "object to a particular use of your data, or withdraw a consent you gave;",
            "tell you whom your data has been shared with.",
          ]}
        />
        <p>
          To use these rights, contact our Data Protection Officer (see section 1) or visit the
          clinic. You also have the right to be compensated for damage from inaccurate or unlawfully
          used data, and to complain to the National Privacy Commission at{" "}
          <a
            href="https://privacy.gov.ph"
            className="text-amber-700 underline underline-offset-2"
            rel="noreferrer noopener"
            target="_blank"
          >
            privacy.gov.ph
          </a>
          .
        </p>
      </Section>

      <Section title="8. Cookies">
        <p>
          The system uses one essential cookie to keep you signed in (staff only). It has no
          tracking or advertising cookies, and no analytics that identify you.
        </p>
      </Section>

      <Section title="9. Changes to this policy">
        <p>
          When this policy changes, the date at the top changes too. A printable notice for
          patients is available at{" "}
          <Link href="/privacy/patient-notice" className="text-amber-700 underline underline-offset-2">
            Patient privacy notice
          </Link>
          .
        </p>
      </Section>
    </LegalShell>
  );
}
