"use client";

import Link from "next/link";
import { CloudOff, RefreshCw, Check, LogIn, AlertTriangle } from "lucide-react";
import { useAppData } from "@/lib/local/app-data";
import { syncNow } from "@/lib/local/sync";
import { cx } from "./ui";

export function SyncPill() {
  const { sync, pending } = useAppData();
  const base = "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold";
  if (sync.status === "needs-login") {
    return (
      <Link href="/login" className={cx(base, "bg-danger-soft text-danger")}>
        <LogIn size={14} /> Sign in to sync
      </Link>
    );
  }
  if (sync.status === "offline") {
    return (
      <span className={cx(base, "bg-surface-2 text-ink-2")}>
        <CloudOff size={14} /> Offline{pending ? ` · ${pending} waiting` : ""}
      </span>
    );
  }
  if (sync.status === "error") {
    return (
      <button onClick={() => void syncNow()} className={cx(base, "bg-gold-soft text-gold")}>
        <AlertTriangle size={14} /> Retry sync
      </button>
    );
  }
  if (sync.status === "syncing" || pending) {
    return (
      <button onClick={() => void syncNow()} className={cx(base, "bg-surface-2 text-ink-2")}>
        <RefreshCw size={14} className={sync.status === "syncing" ? "animate-spin" : ""} />
        {pending ? `${pending} to sync` : "Syncing"}
      </button>
    );
  }
  return (
    <span className={cx(base, "bg-accent-soft text-accent")}>
      <Check size={14} /> Synced
    </span>
  );
}
