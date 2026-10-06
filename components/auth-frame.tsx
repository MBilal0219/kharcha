import Link from "next/link";
import type { ReactNode } from "react";
import { googleAction } from "@/app/actions";
import { googleEnabled } from "@/lib/auth/config";
import { Logo } from "./logo";

/** Shared layout for the signed-out screens: login, sign up, forgot, reset, verify. */
export function AuthFrame({ title, sub, hero, children, footer }: { title: string; sub?: string; hero?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-6 py-10">
      <Link href="/login" className="flex items-center gap-3">
        <Logo className="h-10 w-10" />
        <span className="font-display text-xl font-semibold tracking-tight">Kharcha</span>
      </Link>
      {hero}
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold leading-[1.1] tracking-tight">{title}</h1>
        {sub && <p className="text-ink-2">{sub}</p>}
      </div>
      <div className="space-y-4">{children}</div>
      <div className="mt-auto space-y-1 text-center text-sm text-muted">
        {footer && <p>{footer}</p>}
        <p className="text-xs">
          <Link href="/privacy" className="inline-block py-2 underline">Privacy</Link> · <Link href="/terms" className="inline-block py-2 underline">Terms</Link>
        </p>
      </div>
    </main>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-block py-2 font-semibold text-accent">
      {children}
    </Link>
  );
}

export function GoogleButton() {
  if (!googleEnabled()) return null;
  return (
    <>
      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <form action={googleAction}>
        <button className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-line bg-surface text-base font-semibold text-ink transition active:scale-[0.98]">
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continue with Google
        </button>
      </form>
    </>
  );
}
