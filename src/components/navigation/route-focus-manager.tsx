"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Next.js App Router client-side navigations don't reload the page, so
 * screen readers never announce the new view and keyboard focus stays
 * wherever it was (often on the link that was just clicked). This moves
 * focus to the page's main content region after every route change, which
 * is the standard fix (see WCAG "focus-on-route-change" guidance) — paired
 * with the top loading bar, which covers the equivalent *visual* signal
 * that something happened.
 *
 * Skips the very first render so it doesn't steal focus on initial load.
 */
export function RouteFocusManager() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const main = document.getElementById("main-content");
    main?.focus();
  }, [pathname]);

  return null;
}
