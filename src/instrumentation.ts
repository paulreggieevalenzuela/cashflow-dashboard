import type { Instrumentation } from "next";

/**
 * Runs for every server-side error (pages, server actions, route handlers).
 * Today it writes one structured line to the host's log; that is enough for
 * Vercel / any log drain to search by `digest`, the same reference code shown
 * on the error screen. To send errors to Sentry or similar, replace the body
 * (see docs/RUNBOOK.md, "Error monitoring").
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  const message = err instanceof Error ? err.message : String(err);
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest?: unknown }).digest)
      : undefined;

  console.error(
    JSON.stringify({
      level: "error",
      event: "request_error",
      message,
      digest,
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
    }),
  );
};
