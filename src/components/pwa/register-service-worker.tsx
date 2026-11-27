"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js (production only), which shows an offline page when there
 * is no connection. It stores no app data; see public/sw.js.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Not supported or blocked (private mode): the app works the same without it.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
