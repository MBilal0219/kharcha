/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
import { localDb } from "@/lib/local/db";
import { syncNow } from "@/lib/local/sync";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});
serwist.addEventListeners();

// ---- Background Sync (Android Chrome): push unsynced entries even after the app is closed ----
self.addEventListener("sync", (event) => {
  const e = event as Event & { tag: string; waitUntil(p: Promise<unknown>): void };
  if (e.tag === "kharcha-sync") e.waitUntil(syncNow());
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
            void syncNow();
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
