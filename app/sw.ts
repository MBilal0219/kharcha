/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";
import { localDb } from "@/lib/local/db";
import { pendingCount, syncNow } from "@/lib/local/sync";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

// Every screen is precached, and all of the user's data is on the phone. The rules below keep it that way
// when there is no signal, or a signal that connects but never answers.
const SCREEN_DATA_TIMEOUT_MS = 1500;

const offlineFirst: RuntimeCaching[] = [
  {
    // Moving between screens asks the server for a small data file. That must fail fast when the network
    // can't answer: Next.js then loads the screen itself, which comes straight from the precache.
    matcher: ({ request, sameOrigin }) => sameOrigin && request.headers.get("RSC") === "1",
    handler: async ({ request }) => {
      if (!self.navigator.onLine) return Response.error();
      const stop = new AbortController();
      const giveUp = new Promise<Response>((resolve) =>
        setTimeout(() => {
          stop.abort();
          resolve(Response.error());
        }, SCREEN_DATA_TIMEOUT_MS),
      );
      return Promise.race([fetch(request.url, { headers: request.headers, credentials: "same-origin", signal: stop.signal }).catch(() => Response.error()), giveUp]);
    },
  },
  {
    // Never answer the API from a cache: a stored /api/me could name a different account than the one signed in.
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // A screen is the same file whatever follows the "?" (/add?type=income, /money?tab=loans, /add?id=…).
  // Except `_rsc`: that marks a screen-data request, which is not the screen and must go to the rule above.
  precacheOptions: { ignoreURLParametersMatching: [/^(?!_rsc$)/] },
  skipWaiting: true,
  clientsClaim: true,
  // Off on purpose: with preload on, even a precached screen waits for the network to answer first,
  // so on a connection that hangs the app never opens.
  navigationPreload: false,
  runtimeCaching: [...offlineFirst, ...defaultCache],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});
serwist.addEventListeners();

// ---- Background Sync (Android Chrome): push unsynced entries even after the app is closed ----
self.addEventListener("sync", (event) => {
  const e = event as Event & { tag: string; waitUntil(p: Promise<unknown>): void };
  if (e.tag !== "kharcha-sync") return;
  // The browser runs this when the connection is back, with the app closed. If entries are still waiting
  // afterwards (the connection dropped again, the server didn't answer), fail, so the browser tries again later.
  e.waitUntil(
    syncNow().then(async () => {
      if ((await pendingCount()) > 0) throw new Error("entries still waiting to sync");
    }),
  );
});

// ---- Push notifications ----
interface Payload {
  kind: "daily" | "weekly" | "loan" | "test";
  title: string;
  body: string;
  url?: string;
  day?: string;
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      // A push is the one moment the phone lets a closed app run, also on iPhone, which has no background sync.
      // Use it to send anything that is still waiting.
      const syncing = syncNow().catch(() => {});

      let p: Payload = { kind: "test", title: "Kharcha", body: "" };
      try {
        p = event.data?.json() as Payload;
      } catch {
        p.body = event.data?.text() ?? "";
      }

      // The server only knows synced entries. If this phone has today's entries waiting to sync,
      // replace the "add your expenses" nudge with a sync nudge.
      if (p.kind === "daily" && p.day) {
        try {
          const local = await localDb.transactions.where("day").equals(p.day).filter((t) => !t.deletedAt).toArray();
          const closed = await localDb.dayClosures.where("day").equals(p.day).filter((t) => !t.deletedAt).count();
          if (local.length || closed) {
            const waiting = local.filter((t) => t.dirty).length;
            p = {
              ...p,
              title: waiting ? "Entries waiting to sync" : "Today is logged",
              body: waiting
                ? `${waiting} ${waiting === 1 ? "entry is" : "entries are"} saved on your phone. Open Kharcha online to sync.`
                : "All good. See you tomorrow.",
              url: "/",
            };
          }
        } catch {
          /* fall back to the server's message */
        }
      }

      await self.registration.showNotification(p.title, {
        body: p.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: `kharcha-${p.kind}`,
        data: { url: p.url ?? "/" },
      });
      await Promise.race([syncing, new Promise((r) => setTimeout(r, 10_000))]); // keep the worker alive while the sync finishes
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await (c as WindowClient).navigate(url).catch(() => {});
          return (c as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
