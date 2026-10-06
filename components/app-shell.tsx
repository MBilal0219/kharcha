"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Home, ListOrdered, Plus, Wallet, WifiOff, Loader2 } from "lucide-react";
import { AppDataProvider, useMaybeAppData } from "@/lib/local/app-data";
import { getMeta, localDb, setMeta, type CachedUser } from "@/lib/local/db";
import { syncNow } from "@/lib/local/sync";
import { DEMO, seedDemo } from "@/lib/local/demo";
import { Toaster, cx } from "./ui";
import { Logo } from "./logo";
import { Onboarding } from "./onboarding";

async function signInState(): Promise<"ok" | "login" | "offline"> {
  if (DEMO) {
    await seedDemo();
    return "ok";
  }
  const cached = await getMeta<CachedUser>("user");
  if (!navigator.onLine) return cached ? "ok" : "offline";
  try {
    const res = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
    if (res.status === 401) {
      if (!cached) return "login";
      await setMeta("sync", { status: "needs-login", lastSyncedAt: null, message: "Sign in again to sync." });
      return "ok";
    }
    if (!res.ok) return cached ? "ok" : "offline";
    const me = (await res.json()) as CachedUser;
    if (cached && cached.id !== me.id) {
      // A different account signed in on this phone: start clean.
      await Promise.all(localDb.tables.map((t) => t.clear()));
    }
    await setMeta("user", me);
    return "ok";
  } catch {
    return cached ? "ok" : "offline";
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "ok" | "login" | "offline">("checking");
  const router = useRouter();

  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => {});
    signInState().then((s) => {
      setState(s);
      if (s === "login") router.replace("/login");
      if (s === "ok") void syncNow();
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
