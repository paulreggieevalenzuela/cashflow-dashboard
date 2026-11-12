/**
 * The Overview's "Right now" widgets: waiting times, outstanding balances,
 * approval progress and HMO receivables. Pure helpers and the data shapes the
 * page and the database module share, so they can be tested without a screen.
 */
import {
  WAIT_STAGES,
  WAIT_STAGE_LABELS,
  type WaitStage,
  type WaitStat,
} from "@/lib/cashflow/visit-status";
import type { Granularity } from "@/lib/cashflow/dashboard-metrics";

export const GRANULARITIES: readonly Granularity[] = [
  "monthly",
  "quarterly",
  "semiAnnual",
  "annual",
];

/** First day (YYYY-MM-DD) of the current month / quarter / half / year. */
export function periodStartDates(reference: Date): Record<Granularity, string> {
  const year = reference.getFullYear();
  const month = reference.getMonth(); // 0-11
  const start = (monthIndex: number) =>
    `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  return {
    monthly: start(month),
    quarterly: start(Math.floor(month / 3) * 3),
    semiAnnual: start(Math.floor(month / 6) * 6),
    annual: start(0),
  };
}

/** `days` days before a YYYY-MM-DD date, as YYYY-MM-DD (calendar math, no time zone). */
export function daysBefore(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const result = new Date(Date.UTC(y, m - 1, d - days));
  return result.toISOString().slice(0, 10);
}

// ── 1. Waiting times ─────────────────────────────────────────────────

export type WaitingNow = {
  stage: WaitStage;
  label: string;
  /** Visits in this stage that got here today. */
  count: number;
  /** Minutes the one waiting longest has been here (null when nobody). */
  longestMinutes: number | null;
};

export type WaitingBoard = {
  now: WaitingNow[];
  /** Open visits that have been sitting since an earlier day. */
  earlierOpen: number;
};

/**
 * Who is waiting right now, from the open visits on the Queue board. A visit
 * that has been in its stage since an earlier day was forgotten rather than
 * waiting, so it is counted apart (`earlierOpen`) and left out of "longest".
 */
export function summarizeWaitingNow(
  visits: ReadonlyArray<{ status: string; statusChangedAt: string }>,
  nowMs: number,
  today: string,
  clinicDay: (iso: string) => string,
): WaitingBoard {
  const buckets = new Map<WaitStage, { count: number; longest: number | null }>(
    WAIT_STAGES.map((stage) => [stage, { count: 0, longest: null }]),
  );
  let earlierOpen = 0;
  for (const visit of visits) {
    if (!(WAIT_STAGES as readonly string[]).includes(visit.status)) continue;
    if (clinicDay(visit.statusChangedAt) !== today) {
      earlierOpen += 1;
      continue;
    }
    const bucket = buckets.get(visit.status as WaitStage);
    if (!bucket) continue;
    const minutes = Math.max(
      0,
      Math.round((nowMs - new Date(visit.statusChangedAt).getTime()) / 60000),
    );
    bucket.count += 1;
    bucket.longest = bucket.longest === null ? minutes : Math.max(bucket.longest, minutes);
  }
  return {
    now: WAIT_STAGES.map((stage) => ({
      stage,
      label: WAIT_STAGE_LABELS[stage],
      count: buckets.get(stage)?.count ?? 0,
      longestMinutes: buckets.get(stage)?.longest ?? null,
    })),
    earlierOpen,
  };
}

export type WaitingWidget = {
  today: WaitStat[];
  last30Days: WaitStat[];
  board: WaitingBoard;
};

// ── 2. Outstanding balances ──────────────────────────────────────────

export type AgingBucket = {
  key: "week" | "month" | "older";
  label: string;
  amount: number;
  visits: number;
};

export type BalanceWidget = {
  /** What patients still owe (HMO shares are in the HMO card). */
  total: number;
  visits: number;
  /** Visit date of the oldest unpaid visit. */
  oldestDate: string | null;
  buckets: AgingBucket[];
};

export const AGING_LABELS: Record<AgingBucket["key"], string> = {
  week: "Up to 7 days",
  month: "8 to 30 days",
  older: "Over 30 days",
};

/** Which aging bucket a balance of `ageDays` days belongs to. */
export function agingKey(ageDays: number): AgingBucket["key"] {
  if (ageDays <= 7) return "week";
  if (ageDays <= 30) return "month";
  return "older";
}

/** Whole days between two YYYY-MM-DD dates (later - earlier). */
export function daysBetween(earlier: string, later: string): number {
  const toMs = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toMs(later) - toMs(earlier)) / 86400000);
}

export const EMPTY_BALANCES: BalanceWidget = {
  total: 0,
  visits: 0,
  oldestDate: null,
  buckets: (Object.keys(AGING_LABELS) as AgingBucket["key"][]).map((key) => ({
    key,
    label: AGING_LABELS[key],
    amount: 0,
    visits: 0,
  })),
};

// ── 3. Approval progress ─────────────────────────────────────────────

export type ApprovalCounts = {
  /** Cleared visits the Branch manager has not fully checked yet. */
  toCheck: number;
  /** Of those, how many have been waiting more than 2 days. */
  late: number;
  /** Checked by the Branch manager, waiting for Headquarters. */
  waitingHq: number;
  /** Approved by Headquarters. */
  approved: number;
};

export type ApprovalWidget = {
  /** False until scripts/sql/2026-11-transaction-checks.sql has been run. */
  ready: boolean;
  /** False until scripts/sql/2026-11-transaction-hq-checks.sql has been run. */
  hqReady: boolean;
  byPeriod: Record<Granularity, ApprovalCounts>;
};

export const NO_APPROVALS: ApprovalCounts = {
  toCheck: 0,
  late: 0,
  waitingHq: 0,
  approved: 0,
};

/** Where one visit stands, from its line counts. */
export function approvalStageOfCounts(input: {
  lines: number;
  checked: number;
  hqChecked: number;
}): "toCheck" | "waitingHq" | "approved" | null {
  if (input.lines <= 0) return null;
  if (input.checked < input.lines) return "toCheck";
  return input.hqChecked >= input.lines ? "approved" : "waitingHq";
}

// ── 4. HMO receivables ───────────────────────────────────────────────

export type HmoReceivableRow = {
  hmo: string;
  /** Not on any billing yet. */
  toBill: number;
  /** On a billing, waiting for the HMO to pay. */
  waiting: number;
};

export type HmoPeriodFigures = {
  rows: HmoReceivableRow[];
  toBill: number;
  waiting: number;
  /** Visits with HMO lines in the period. */
  visits: number;
};

export type HmoWidget = {
  /** False until scripts/sql/2026-11-hmo-billings.sql has been run (everything counts as "to bill"). */
  billingReady: boolean;
  byPeriod: Record<Granularity, HmoPeriodFigures>;
  /** Open visits still waiting for their LOA number. */
  loaPending: number;
};

export const NO_HMO_FIGURES: HmoPeriodFigures = {
  rows: [],
  toBill: 0,
  waiting: 0,
  visits: 0,
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Splits what one HMO still owes. `total` is the HMO's share on the period's
 * visits, `unbilled` the part not on any billing, `received` what the HMO has
 * paid. Payments are taken to settle billed lines first, so what is still
 * owed is `total - received`, of which the unbilled part is still to bill.
 */
export function splitHmoReceivable(input: {
  total: number;
  unbilled: number;
  received: number;
}): { toBill: number; waiting: number } {
  const outstanding = Math.max(0, input.total - input.received);
  const toBill = Math.min(Math.max(0, input.unbilled), outstanding);
  return { toBill: round2(toBill), waiting: round2(outstanding - toBill) };
}

// ── The whole widget set ─────────────────────────────────────────────

export type OverviewOps = {
  /** First day of each period, for the links into the Transactions list. */
  periodStarts: Record<Granularity, string>;
  waiting: WaitingWidget;
  balances: BalanceWidget;
  /** Null when the person may not see the approval card. */
  approvals: ApprovalWidget | null;
  hmo: HmoWidget;
};
