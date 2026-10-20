"use client";

import type { Session } from "next-auth";
import { SessionProvider, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/cashflow/sign-out-button";
import {
  decideGuardAction,
  formatCountdown,
  type SignOutReason,
} from "@/lib/auth/session-policy";

/** Events that count as "someone is using the screen". Not mouse-move, and
 * never the Queue auto-refresh or background polling. */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll"] as const;

const TICK_MS = 1000;

function goToLogin(reason: SignOutReason | null) {
  const params = new URLSearchParams();
  if (reason) params.set("reason", reason);
  const here = window.location.pathname + window.location.search;
  if (here.startsWith("/cashflow")) params.set("from", here);
  const query = params.toString();
  window.location.assign(query ? `/login?${query}` : "/login");
}

/**
 * Keeps the 30-minute login honest in the browser: extends it quietly while
 * the screen is in use, shows a "Stay signed in" pop-up in the last 5
 * minutes when it is not, and signs out when time runs out.
 */
function Guard() {
  const { data, status, update } = useSession();

  // Server's figure for time left, anchored to when this browser received it.
  const deadlineRef = useRef<number | null>(null);
  const extendableRef = useRef(true);
  const lastActivityRef = useRef(0);
  const warningOpenRef = useRef(false);
  const busyRef = useRef(false);
  const leavingRef = useRef(false);
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  // Set by the clock effect so the pop-up buttons can call into it.
  const refreshHandle = useRef<(() => Promise<void>) | null>(null);
  const leaveHandle = useRef<((reason: SignOutReason) => Promise<void>) | null>(null);

  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [extendable, setExtendable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const expiresInSeconds = data?.expiresInSeconds;
  const canExtend = data?.canExtend;

  // New figures from the server (page load, refresh, another tab, tab focus).
  useEffect(() => {
    if (typeof expiresInSeconds !== "number") return;
    deadlineRef.current = Date.now() + expiresInSeconds * 1000;
    extendableRef.current = canExtend !== false;
  }, [expiresInSeconds, canExtend, data]);

  // Signed out elsewhere (another tab, or the server ended it).
  useEffect(() => {
    if (status !== "unauthenticated" || leavingRef.current) return;
    leavingRef.current = true;
    const ranOut = deadlineRef.current !== null && deadlineRef.current <= Date.now();
    goToLogin(ranOut ? "expired" : null);
  }, [status]);

  // Remember the last real activity.
  useEffect(() => {
    lastActivityRef.current = Date.now();
    const mark = () => {
      lastActivityRef.current = Date.now();
    };
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, mark, { passive: true, capture: true });
    }
    return () => {
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, mark, { capture: true });
      }
    };
  }, []);

  // The clock.
  useEffect(() => {
    async function leave(reason: SignOutReason) {
      if (leavingRef.current) return;
      leavingRef.current = true;
      try {
        await signOut({ redirect: false });
      } catch {
        // The cookie is already invalid server-side; go to login regardless.
      }
      goToLogin(reason);
    }

    // `update` reports null both when the server ended the session and when
    // the network failed. Ask the server directly to tell them apart.
    async function serverSaysSignedOut(): Promise<boolean> {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) return false;
        const body: unknown = await response.json();
        return body === null || (typeof body === "object" && Object.keys(body).length === 0);
      } catch {
        return false;
      }
    }

    async function refresh() {
      if (busyRef.current || leavingRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        // A bare update() is sent as a plain GET and extends nothing — it
        // must carry data to be sent as the POST the server treats as a
        // refresh.
        const next = await update({ extend: true });
        if (next) {
          setFailed(false);
        } else if (next === undefined) {
          // Another refresh is already running — nothing to do.
        } else if (await serverSaysSignedOut()) {
          await leave("expired");
        } else {
          // Couldn't reach the server: make sure the person sees the pop-up
          // (with a message) instead of retrying silently every second.
          setFailed(true);
          warningOpenRef.current = true;
          setExtendable(extendableRef.current);
          setRemainingMs(Math.max(0, (deadlineRef.current ?? 0) - Date.now()));
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    }

    refreshHandle.current = refresh;
    leaveHandle.current = leave;

    function tick() {
      const deadline = deadlineRef.current;
      if (deadline === null || leavingRef.current) return;
      const now = Date.now();
      const remaining = deadline - now;

      const action = decideGuardAction({
        remainingMs: remaining,
        warningOpen: warningOpenRef.current,
        msSinceActivity: now - lastActivityRef.current,
        extendable: extendableRef.current,
      });

      switch (action) {
        case "expired":
          void leave(extendableRef.current ? "expired" : "limit");
          return;
        case "refresh-quietly":
          void refresh();
          return;
        case "show-warning":
          warningOpenRef.current = true;
          setExtendable(extendableRef.current);
          break;
        case "close-warning":
          warningOpenRef.current = false;
          setFailed(false);
          setRemainingMs(null);
          return;
        case "none":
          break;
      }

      if (warningOpenRef.current) {
        setRemainingMs(remaining);
      }
    }

    const timer = window.setInterval(tick, TICK_MS);
    // Coming back to a sleeping laptop / hidden tab: check straight away.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [update]);

  const open = remainingMs !== null;
  useEffect(() => {
    if (open) stayButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 print:hidden">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-warning-title"
        aria-describedby="session-warning-body"
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900"
      >
        <h2
          id="session-warning-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
        >
          {extendable ? "Still there?" : "Sign-in limit reached"}
        </h2>
        <p
          id="session-warning-body"
          className="mt-2 text-sm text-zinc-600 dark:text-zinc-400"
        >
          {extendable
            ? "You will be signed out soon because of inactivity."
            : "For security, sign-ins last at most 12 hours. Save your work, then sign in again."}
        </p>
        <p
          className="mt-4 text-center text-3xl font-semibold tabular-nums text-amber-600 dark:text-amber-400"
          role="timer"
          aria-live="off"
        >
          {formatCountdown(remainingMs)}
        </p>
        {failed && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t reach the server. Check your connection and try again.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          {extendable ? (
            <button
              ref={stayButtonRef}
              type="button"
              disabled={busy}
              onClick={() => void refreshHandle.current?.()}
              className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy ? "Extending..." : "Stay signed in"}
            </button>
          ) : (
            <button
              ref={stayButtonRef}
              type="button"
              onClick={() => void leaveHandle.current?.("limit")}
              className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
            >
              Sign in again
            </button>
          )}
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}

export function SessionGuard({ session }: { session: Session }) {
  return (
    <SessionProvider session={session}>
      <Guard />
    </SessionProvider>
  );
}
