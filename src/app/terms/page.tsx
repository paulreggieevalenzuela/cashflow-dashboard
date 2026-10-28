import type { Metadata } from "next";
import { Bullets, Detail, LegalShell, Section } from "@/components/legal/legal-shell";
import { CLINIC } from "@/lib/cashflow/legal";

export const metadata: Metadata = {
  title: "Terms of Use | ADT Dental Clinic",
  description: "The rules for using the ADT Dental Clinic Cashflow system.",
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Use"
      intro="The Cashflow system is for authorized staff of the clinic. By signing in you agree to these rules."
    >
      <Section title="1. Who may use it">
        <p>
          Only people the clinic has given an account, for clinic work. You may not share your
          account or password, and you may not sign in as someone else.
        </p>
      </Section>

      <Section title="2. Keep patient information confidential">
        <Bullets
          items={[
            "Use patient and billing information only to do your job.",
            "Do not copy, photograph, export or send patient data outside the clinic unless your role requires it and the clinic has allowed it.",
            "Sign out or lock your screen when you step away. The system signs you out after 30 minutes of inactivity.",
            "Your duty of confidentiality continues after you leave the clinic.",
          ]}
        />
      </Section>

      <Section title="3. Enter accurate records">
        <p>
          Amounts, patients, procedures, dentists and payment methods must be entered correctly. If
          you find a mistake, report it to an admin. Changes are recorded in an audit trail with your
          name and the time.
        </p>
      </Section>

      <Section title="4. Keep your account secure">
        <Bullets
          items={[
            "Use a password that others cannot guess and that you do not use anywhere else.",
            "Tell an admin at once if you think someone else knows your password or used your account.",
            "Do not try to get around the system's access limits or security.",
          ]}
        />
      </Section>

      <Section title="5. Monitoring">
        <p>
          The clinic records sign-ins and changes to protect patients and the business. Misuse may
          lead to loss of access and to disciplinary or legal action.
        </p>
      </Section>

      <Section title="6. Availability">
        <p>
          We work to keep the system available, but it depends on internet and third-party
          services, so it may sometimes be unavailable. Follow the clinic&apos;s paper fallback
          procedure when it is, and enter the records afterwards.
        </p>
      </Section>

      <Section title="7. Questions">
        <p>
          Contact <Detail value={CLINIC.supportEmail} /> or your admin. See also the Privacy Policy.
        </p>
      </Section>
    </LegalShell>
  );
}
