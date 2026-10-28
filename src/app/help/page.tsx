import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Help & FAQ | ADT Dental Clinic",
  description: "Answers to common questions about using the ADT Dental Clinic Cashflow system.",
};

type Faq = { q: string; a: string };
type Group = { title: string; items: Faq[] };

const GROUPS: Group[] = [
  {
    title: "Signing in",
    items: [
      {
        q: "Why was I signed out?",
        a: "To protect patient data you are signed out after 30 minutes without activity, and in any case 12 hours after signing in. A \"Stay signed in\" box appears about 5 minutes before the 30 minutes run out; choose it to carry on. Anything you typed but did not save is lost, so save before you step away.",
      },
      {
        q: "I forgot my password.",
        a: "Ask your branch admin to reset it for you. Do not share passwords, even with a colleague. If you cannot reach an admin, see the Contact page.",
      },
      {
        q: "My account is locked after wrong passwords.",
        a: "After 5 wrong attempts the sign-in pauses for 15 minutes. Wait, then try again with the correct password. If it still fails, ask an admin.",
      },
      {
        q: "How do I get an account?",
        a: "Accounts are created by an admin. Ask your branch admin or the clinic owner.",
      },
    ],
  },
  {
    title: "Daily work",
    items: [
      {
        q: "How do I add a patient visit to the Queue?",
        a: "Open Transactions, choose Add transaction, pick (or add) the patient, then add the procedures, dentist and payment type. The visit then appears on the Queue board.",
      },
      {
        q: "What do the visit statuses mean?",
        a: "Arrived: the patient is at the clinic and waiting. On-going: treatment is in progress. For Payment: treatment is finished and the bill is to be settled. Cleared: paid (or covered) and closed.",
      },
      {
        q: "Why can't I clear a visit?",
        a: "A visit can only be cleared when it has a procedure and a dentist, any balance is settled, and, for HMO visits, no LOA/LOE is still pending. The message on the visit says which one is missing.",
      },
      {
        q: "How do I take a partial payment or a reservation fee?",
        a: "Add the payment to the visit with the amount received. The remaining balance stays on the visit until it is settled.",
      },
      {
        q: "How are PWD or Senior Citizen discounts applied?",
        a: "Tick the discount type on the visit and enter the ID number. The system applies the discount rules. ID numbers are partly hidden from non-admin users.",
      },
      {
        q: "What does the transaction number mean?",
        a: "It is built from the date and time, the branch and a code, in the form MMDDYYHHMM-BRANCH-CODE, so each visit has a unique reference you can quote.",
      },
      {
        q: "How do I remove a visit from the Queue?",
        a: "Use the remove option on the visit in the Queue board. This is for visits entered by mistake or patients who left; the change is recorded in the audit trail.",
      },
    ],
  },
  {
    title: "HMO",
    items: [
      {
        q: "What is an LOA / LOE and when is it entered?",
        a: "The LOA (Letter of Authorization) is the HMO's approval to treat the patient; the LOE (Letter of Engagement) is the equivalent used by some HMOs. Attach it to the visit when it arrives. Until then the visit shows as LOA pending.",
      },
      {
        q: "Why is an HMO visit not showing as paid?",
        a: "HMO visits are billed to the HMO, which pays later. They count as billed on the day and as received once the HMO pays.",
      },
      {
        q: "Where do I see how much each HMO owes?",
        a: "On Day end, the HMO summary lists, per HMO, the visits, the amount billed, the amount received and the amount still to collect.",
      },
      {
        q: "Where do I enter the patient's HMO company and account number?",
        a: "On the patient's profile (add or edit patient). The HMO company, account number and birthday are saved with the patient and can be used to search for them.",
      },
    ],
  },
  {
    title: "Reports",
    items: [
      {
        q: "What is on the Day end page?",
        a: "The day's visits, payments by method, expenses, the HMO summary and totals for the branch. Staff see their own branch; admins can pick a branch.",
      },
      {
        q: "Can I download a report?",
        a: "Yes. Use the download buttons on Day end and the Transactions list for CSV or Excel files. Treat downloads as confidential and delete them when you no longer need them.",
      },
    ],
  },
  {
    title: "Mistakes",
    items: [
      {
        q: "I entered the wrong amount or patient.",
        a: "Tell an admin. Admins can edit a transaction, and every change is recorded in the audit trail with who made it and when.",
      },
      {
        q: "A patient was entered twice.",
        a: "An admin can merge the duplicate profiles. Visits and details are combined into one record.",
      },
    ],
  },
  {
    title: "Privacy",
    items: [
      {
        q: "Who can see patient information?",
        a: "Only signed-in clinic staff, according to their role and branch. See the Privacy Policy for details.",
      },
      {
        q: "A patient wants to see or correct their data, or I think data was exposed.",
        a: "Do not handle it alone. Contact the Data Protection Officer immediately (see Contact). Suspected breaches must be reported within 72 hours.",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <LegalShell
      title="Help & FAQ"
      showUpdated={false}
      intro="Short answers to the questions staff ask most. If yours is not here, see the Contact page."
    >
      {GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{group.title}</h2>
          <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white/80 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/60">
            {group.items.map((item) => (
              <details key={item.q} className="group px-4 py-3">
                <summary className="cursor-pointer list-none text-sm font-medium text-zinc-900 marker:hidden dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-start justify-between gap-3">
                    {item.q}
                    <span
                      aria-hidden="true"
                      className="mt-0.5 text-amber-600 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      <p className="text-sm text-zinc-500">
        Read our <Link href="/privacy" className="text-amber-700 underline underline-offset-2">Privacy Policy</Link>{" "}
        and <Link href="/terms" className="text-amber-700 underline underline-offset-2">Terms of Use</Link>.
      </p>
    </LegalShell>
  );
}
