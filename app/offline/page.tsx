import Link from "next/link";
import { Logo } from "@/components/logo";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <Logo className="mb-2 h-12 w-12" />
      <h1 className="font-display text-2xl font-semibold">You're offline</h1>
      <p className="max-w-xs text-sm text-muted">This page needs the internet. Your ledger still works offline.</p>
      <Link href="/" className="mt-2 font-semibold text-accent">
        Open my ledger
      </Link>
    </main>
  );
}
