"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Home, ListOrdered, Plus, Wallet, WifiOff, Loader2 } from "lucide-react";
import { AppDataProvider, useMaybeAppData } from "@/lib/local/app-data";
import { getMeta, localDb, setMeta, type CachedUser } from "@/lib/local/db";
import { syncNow } from "@/lib/local/sync";
import { DEMO, seedDemo } from "@/lib/local/demo";
import { Toaster, cx, toast } from "./ui";
import { Logo } from "./logo";
import { Onboarding } from "./onboarding";

const ME_TIMEOUT = 10_000;

/** Asks the server who is signed in. null = couldn't reach it (offline, or a connection that never answers). */
async function whoAmI(): Promise<{ status: number; me?: CachedUser } | null> {
  if (!navigator.onLine) return null;
  try {
    const res = await fetch("/api/me", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(ME_TIMEOUT) });
    return { status: res.status, me: res.ok ? ((await res.json()) as CachedUser) : undefined };
  } catch {
    return null;
  }
}

/**
 * A phone that has signed in before opens straight from its own data: the network is never waited for.
 * The session is then checked in the background.
 */
async function checkInBackground(cached: CachedUser) {
  const r = await whoAmI();
  if (!r) return;
  if (r.status === 401) {
    await setMeta("sync", { status: "needs-login", lastSyncedAt: null, message: "Sign in again to sync." });
    return;
  }
  if (!r.me) return;
  if (r.me.id !== cached.id) {
    // A different account signed in on this phone: start clean. (Sync refuses to send the old account's entries.)
    await Promise.all(localDb.tables.map((t) => t.clear()));
    await setMeta("user", r.me);
    location.reload();
    return;
  }
  await setMeta("user", r.me);
  void syncNow();
}

async function signInState(): Promise<"ok" | "login" | "offline"> {
  if (DEMO) {
    await seedDemo();
    return "ok";
  }
  const cached = await getMeta<CachedUser>("user");
  if (cached) {
    void checkInBackground(cached);
    return "ok";
  }
  const r = await whoAmI();
  if (!r) return "offline";
  if (r.status === 401) return "login";
  if (!r.me) return "offline";
  await setMeta("user", r.me);
  return "ok";
}

/** Picks up a new deployment on an installed app: check when the app comes back to the front, reload once the new version has taken over. */
function useAppUpdates() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    let hadController = Boolean(sw.controller);
    let reloadWhenHidden = false;
    const onControllerChange = () => {
      if (!hadController) {
        hadController = true; // first install on this device: nothing to update from
        return;
      }
      // The old screens point at files the new version replaced. Reload at a moment that can't interrupt typing.
      if (document.visibilityState === "hidden") location.reload();
      else {
        reloadWhenHidden = true;
        toast("A new version is ready.", { label: "Update", run: () => location.reload() });
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        if (reloadWhenHidden) location.reload();
        return;
      }
      void sw.getRegistration().then((reg) => reg?.update().catch(() => {}));
    };
    sw.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      sw.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "ok" | "login" | "offline">("checking");
  const router = useRouter();
  useAppUpdates();

  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => {});
    signInState().then((s) => {
      setState(s);
      if (s === "login") router.replace("/login");
      if (s === "ok") void syncNow(); // harmless before the background check: the server refuses another account's data
    });
    const kick = () => void syncNow();
    const onVis = () => document.visibilityState === "visible" && kick();
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(kick, 120_000);
    return () => {
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(t);
    };
  }, [router]);

  if (state === "offline") {
    return (
      <Splash>
        <WifiOff className="text-muted" />
        <p className="font-display text-xl font-semibold">Connect once to get started</p>
        <p className="max-w-xs text-sm text-muted">Sign-in needs the internet the first time. After that Kharcha works with no signal.</p>
        <button className="mt-2 font-semibold text-accent" onClick={() => location.reload()}>
          Try again
        </button>
      </Splash>
    );
  }
  if (state !== "ok") return <Splash><Loader2 className="animate-spin text-muted" /></Splash>;

  return (
    <AppDataProvider>
      <Gate>{children}</Gate>
      <Toaster />
    </AppDataProvider>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const data = useMaybeAppData();
  const pathname = usePathname();
  if (!data) return <Splash><Loader2 className="animate-spin text-muted" /></Splash>;
  if (!data.hasSettings) {
    return (
      <Splash>
        <Loader2 className="animate-spin text-accent" />
        <p className="font-display text-xl font-semibold">Setting up your ledger</p>
        <p className="max-w-xs text-sm text-muted">
          {data.sync.status === "offline" ? "Waiting for internet to download your data." : "Creating your wallets and categories…"}
        </p>
      </Splash>
    );
  }
  if (!data.settings.onboarded) return <Onboarding />;
  const hideTabs = pathname.startsWith("/add");
  return (
    <>
      <main className={cx("mx-auto w-full max-w-lg px-4", hideTabs ? "pb-6" : "safe-pad-bottom")}>{children}</main>
      {!hideTabs && <TabBar />}
    </>
  );
}

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <Logo className="mb-4 h-12 w-12" />
      {children}
    </div>
  );
}

const TABS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/history", label: "History", icon: ListOrdered },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/money", label: "Money", icon: Wallet },
];

function TabBar() {
  const pathname = usePathname();
  const tab = (t: (typeof TABS)[number]) => {
    const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
    const I = t.icon;
    return (
      <Link
        key={t.href}
        href={t.href}
        className={cx("flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-semibold", active ? "text-accent" : "text-muted")}
        aria-current={active ? "page" : undefined}
      >
        <I size={22} strokeWidth={active ? 2.4 : 2} />
        {t.label}
      </Link>
    );
  };
  return (
    <nav className="tabbar fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/92 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-center px-2">
        {tab(TABS[0])}
        {tab(TABS[1])}
        <div className="flex flex-1 justify-center">
          <Link
            href="/add"
            aria-label="Add entry"
            className="-mt-7 grid h-16 w-16 place-items-center rounded-[22px] bg-accent text-accent-ink shadow-[0_10px_24px_-8px_var(--accent)] ring-4 ring-bg transition active:scale-95"
          >
            <Plus size={30} strokeWidth={2.6} />
          </Link>
        </div>
        {tab(TABS[2])}
        {tab(TABS[3])}
      </div>
    </nav>
  );
}
