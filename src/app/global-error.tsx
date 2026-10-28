"use client";

import { useEffect } from "react";

/**
 * Last resort: the root layout itself failed (for example the database was
 * unreachable while reading the session). It replaces the whole document, so
 * it carries its own plain styling and does not depend on the app's CSS.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          color: "#171717",
          background: "#fff",
        }}
      >
        <h1 style={{ fontSize: 24, margin: 0 }}>ADT Dental Clinic is unavailable</h1>
        <p style={{ maxWidth: 420, color: "#52525b", margin: 0 }}>
          The system could not load. Please try again in a minute. If it keeps
          happening, use the paper fallback and tell your admin.
        </p>
        {error.digest && (
          <p style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
            Reference: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={() => retry()}
          style={{
            background: "#d97706",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            padding: "10px 18px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
