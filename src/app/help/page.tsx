import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/legal/legal-shell";
import { APP_RELEASE_DATE, APP_VERSION } from "@/lib/cashflow/version";

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
        a: "The LOA (Letter of Authorization) is the HMO's approval to treat the patient; the LOE (Letter of Engagement) is the equivalent used by some HMOs. The LOA number is typed on each procedure (Edit transaction): Maxicare gives one LOA per procedure; for the other HMOs tick \u201cSame LOA for all procedures\u201d to use one number, or untick it to enter one per procedure. The LOE number goes in the Payment section. Until every procedure has its LOA the visit shows as LOA pending.",
      },
      {
        q: "Why is an HMO visit not showing as paid?",
        a: "HMO visits are billed to the HMO, which pays later. They count as billed on the day and as received once the HMO pays.",
      },
      {
        q: "Where do I see how much each HMO owes?",
        a: "Open the HMO billing tab (Transactions), pick the HMO and the dates: it lists every HMO procedure with its total. Day end also shows each HMO visit on its own row with the amount billed.",
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
        a: "One table of the day's payments and visits, with the HMO details (HMO, account #, LOA, LOE, tooth # and amount billed) on the same row as the payment, then the breakdown by payment method and the totals for the branch. There is no separate HMO section and no expenses. Staff see their own branch; admins can pick a branch.",
      },
      {
        q: "Can I download a report?",
        a: "Yes. Use the download buttons on Day end and the Transactions list for CSV or Excel files. Treat downloads as confidential and delete them when you no longer need them.",
      },
    ],
  },
  {
    title: "HMO billing",
    items: [
      {
        q: "How do I bill an HMO?",
        a: "Open Transactions, then the HMO billing tab. Pick the HMO, the branch and the cut-off dates (From and To, both days included), check the rows and the total, then press Generate billing. The billing gets its own number and can be printed or saved as PDF, or downloaded as Excel or CSV.",
      },
      {
        q: "What does the billing number look like?",
        a: "HMO, the branch code, the year and a running number, for example HMO-MAR-26-0001. The running number counts per branch per year.",
      },
      {
        q: "What is on each row?",
        a: "Visit date, patient, HMO account #, LOA #, LOE #, procedure, tooth # and the amount billed to the HMO. A line with no LOA shows \"LOA pending\" and is still counted in the total.",
      },
      {
        q: "Can the same line be billed twice?",
        a: "No. A line already on a billing is left out of the next one. If a billing was made by mistake, an admin can void it and its lines can be billed again.",
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
      <p className="text-xs text-zinc-400">
        Cashflow version {APP_VERSION} ({APP_RELEASE_DATE}). The list of changes is in CHANGELOG.md.
      </p>
      <p className="text-sm text-zinc-500">
        Read our <Link href="/privacy" className="text-amber-700 underline underline-offset-2">Privacy Policy</Link>{" "}
        and <Link href="/terms" className="text-amber-700 underline underline-offset-2">Terms of Use</Link>.
      </p>
    </LegalShell>
  );
}
