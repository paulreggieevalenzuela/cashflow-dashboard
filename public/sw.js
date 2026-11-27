/*
 * ADT Cashflow service worker. Deliberately small:
 *
 * - It never stores pages, API answers or any patient or money data. Every
 *   request goes to the network exactly as without a service worker.
 * - The only thing kept on the device is a static "You're offline" page (and
 *   the app icon), shown when a page can't be opened because there is no
 *   connection.
 *
 * Bump VERSION when offline.html or the icons change.
 */
const VERSION = "adt-cashflow-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only full page loads; everything else is left to the browser.
  if (request.mode !== "navigate" || request.method !== "GET") return;
  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(VERSION);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }),
  );
});
