import type { MetadataRoute } from "next";

/**
 * Lets the app be installed on a phone or computer ("Add to Home Screen" /
 * "Install app"): it then opens full screen, without the browser bar, with
 * the clinic's icon. Served at /manifest.webmanifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/cashflow",
    name: "ADT Dental Clinic · Cashflow",
    short_name: "ADT Cashflow",
    description:
      "The clinic's queue, payments, HMO billing, day end, commissions and approvals.",
    start_url: "/cashflow",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["business", "finance", "medical"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Queue", url: "/cashflow/queue", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Transactions", url: "/cashflow/transactions", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Day end", url: "/cashflow/day-end", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
