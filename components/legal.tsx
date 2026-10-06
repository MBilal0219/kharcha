import type { ReactNode } from "react";
import { AuthFrame, AuthLink } from "./auth-frame";

export const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export function Legal({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <AuthFrame title={title} sub={`Last updated ${updated}`} footer={<AuthLink href="/login">Back to sign in</AuthLink>}>
      <div className="space-y-6 text-ink-2">{children}</div>
    </AuthFrame>
  );
}

export function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function ContactLine() {
  if (!CONTACT) return null;
  return (
    <Part title="Contact">
      <p>
        Questions or requests: <a className="font-semibold text-accent" href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </Part>
  );
}
