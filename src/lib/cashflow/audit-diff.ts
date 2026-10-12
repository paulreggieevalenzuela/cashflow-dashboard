/**
 * Works out what changed when a visit was edited, in plain words, for the
 * audit trail. Pure (no database) so it can be checked on its own.
 *
 * The PWD / Senior ID number itself is never written to the log, only
 * that it was added, changed or removed.
 */

export type AuditLine = {
  id: string;
  procedure: string;
  quantity: number;
  unitPrice: number;
  teeth: string;
  discount: string; // e.g. "PWD 20%" or ""
  total: number;
};

export type AuditSnapshot = {
  visitDate: string;
  patientName: string;
  branchName: string;
  invoiceNumber: string;
  transactionType: string;
  visitType: string;
  dentist: string;
  discountIdType: string;
  discountIdNumber: string;
  recallDate: string;
  totalDue: number;
  lines: AuditLine[];
};

export type AuditChange = { field: string; from: string; to: string };

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

function show(value: string): string {
  return value.trim() ? value : "(blank)";
}

export function diffVisit(
  before: AuditSnapshot,
  after: AuditSnapshot,
): AuditChange[] {
  const changes: AuditChange[] = [];
  const simple: Array<[string, keyof AuditSnapshot]> = [
    ["Date", "visitDate"],
    ["Patient", "patientName"],
    ["Branch", "branchName"],
    ["Invoice number", "invoiceNumber"],
    ["Transaction type", "transactionType"],
    ["Visit type", "visitType"],
    ["Dentist", "dentist"],
    ["Recall date", "recallDate"],
    ["ID type", "discountIdType"],
  ];
  for (const [label, key] of simple) {
    const a = String(before[key] ?? "");
    const b = String(after[key] ?? "");
    if (a !== b) {
      changes.push({ field: label, from: show(a), to: show(b) });
    }
  }
  if (before.discountIdNumber !== after.discountIdNumber) {
    changes.push({
      field: "PWD / Senior ID number",
      from: before.discountIdNumber ? "on file" : "(none)",
      to: after.discountIdNumber
        ? before.discountIdNumber
          ? "changed"
          : "added"
        : "removed",
    });
  }

  const beforeById = new Map(before.lines.map((line) => [line.id, line]));
  const afterById = new Map(after.lines.map((line) => [line.id, line]));
  for (const line of after.lines) {
    const previous = beforeById.get(line.id);
    if (!previous) {
      changes.push({
        field: "Procedure added",
        from: "",
        to: `${line.procedure} (${peso.format(line.total)})`,
      });
      continue;
    }
    const parts: string[] = [];
    if (previous.procedure !== line.procedure) {
      parts.push(`procedure ${previous.procedure} → ${line.procedure}`);
    }
    if (previous.quantity !== line.quantity) {
      parts.push(`quantity ${previous.quantity} → ${line.quantity}`);
    }
    if (previous.unitPrice !== line.unitPrice) {
      parts.push(
        `price ${peso.format(previous.unitPrice)} → ${peso.format(line.unitPrice)}`,
      );
    }
    if (previous.teeth !== line.teeth) {
      parts.push(`teeth ${show(previous.teeth)} → ${show(line.teeth)}`);
    }
    if (previous.discount !== line.discount) {
      parts.push(
        `discount ${show(previous.discount)} → ${show(line.discount)}`,
      );
    }
    if (parts.length > 0) {
      changes.push({
        field: `Procedure: ${line.procedure}`,
        from: "",
        to: parts.join("; "),
      });
    }
  }
  for (const line of before.lines) {
    if (!afterById.has(line.id)) {
      changes.push({
        field: "Procedure removed",
        from: `${line.procedure} (${peso.format(line.total)})`,
        to: "",
      });
    }
  }
  if (Math.abs(before.totalDue - after.totalDue) > 0.004) {
    changes.push({
      field: "Total due",
      from: peso.format(before.totalDue),
      to: peso.format(after.totalDue),
    });
  }
  return changes;
}

/** One line of text for the list view. */
export function summarizeChanges(changes: AuditChange[]): string {
  return changes
    .map((change) => {
      if (!change.from && change.to) return `${change.field}: ${change.to}`;
      if (change.from && !change.to) return `${change.field}: ${change.from}`;
      return `${change.field}: ${change.from} → ${change.to}`;
    })
    .join(" · ");
}
