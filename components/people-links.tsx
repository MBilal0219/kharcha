"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Mail, UserCheck } from "lucide-react";
import { useAppData } from "@/lib/local/app-data";
import { syncNow } from "@/lib/local/sync";
import { money } from "@/lib/money";
import type { Person } from "@/lib/types";
import { Button, Card, Field, SectionTitle, Sheet, inputClass, toast, cx } from "./ui";

// Linking needs the server (an email is sent, the other account is involved), so everything here is online-only.
// The loans themselves keep working offline on both sides.

const ERRORS: Record<string, string> = {
  bad_email: "Enter a valid email address.",
  own_email: "That's your own email.",
  already: "You are already linked with this person.",
  wrong_account: "This invitation was sent to a different email.",
  expired: "This invitation has expired. Ask them to send it again.",
  rate_limited: "Too many invites. Try again in an hour.",
  not_found: "This person no longer exists.",
};

async function call(url: string, init: RequestInit): Promise<string | null> {
  if (!navigator.onLine) return "Connect to the internet to do this.";
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return ERRORS[body.error ?? ""] ?? "That didn't work. Try again.";
  } catch {
    return "Couldn't reach the server. Try again.";
  }
}

interface Request {
  id: string;
  fromName: string;
  fromEmail: string;
}

/** Invitations other people sent to this account's email. */
export function LinkRequests() {
  const [list, setList] = useState<Request[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!navigator.onLine) return;
    fetch("/api/links", { signal: AbortSignal.timeout(10_000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { incoming: Request[] } | null) => j && setList(j.incoming))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function answer(r: Request, accept: boolean) {
    setBusy(true);
    const error = await call("/api/links/respond", { method: "POST", body: JSON.stringify({ id: r.id, accept }) });
    setBusy(false);
    if (error) return toast(error);
    toast(accept ? `Linked with ${r.fromName}. Loans between you now show here.` : "Declined.");
    setList((l) => l.filter((x) => x.id !== r.id));
    await syncNow();
  }

  if (!list.length) return null;
  return (
    <div className="space-y-3">
      {list.map((r) => (
        <Card key={r.id} className="border border-accent/30">
          <div className="flex gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Link2 size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{r.fromName} wants to share loan records with you</p>
              <p className="text-sm text-muted">
                {r.fromEmail}. If you accept, loans and repayments between you two show on both accounts. Nothing else is shared.
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => answer(r, false)}>
              Decline
            </Button>
            <Button className="flex-1" disabled={busy} onClick={() => answer(r, true)}>
              Accept
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Everyone you track loans with: what stands between you, and whether they are linked. */
export function PeopleCard() {
  const d = useAppData();
  const [open, setOpen] = useState<Person | null>(null);
  if (!d.people.length) return null;

  const net = new Map<string, number>(); // + they owe you, − you owe them
  for (const s of d.loanStates) {
    if (!s.loan.personId || s.loan.status !== "open") continue;
    net.set(s.loan.personId, (net.get(s.loan.personId) ?? 0) + (s.loan.direction === "lent" ? s.outstanding : -s.outstanding));
  }
  const current = open ? d.peopleById.get(open.id) ?? null : null; // follows changes pulled by sync

  return (
    <div>
      <SectionTitle>People</SectionTitle>
      <Card className="divide-y divide-line py-1">
        {d.people.map((p) => {
          const n = net.get(p.id) ?? 0;
          return (
            <button key={p.id} onClick={() => setOpen(p)} className="flex w-full items-center gap-3 py-3 text-left">
              <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", p.link === "linked" ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-2")}>
                {p.link === "linked" ? <UserCheck size={18} /> : p.link === "invited" ? <Mail size={18} /> : <Link2 size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block truncate text-sm text-muted">{p.link === "linked" ? "Linked · sees the same loans" : p.link === "invited" ? "Invite sent" : "Not linked · tap to invite"}</span>
              </span>
              <span className={cx("tnum shrink-0 text-sm font-semibold", n > 0 ? "text-good" : n < 0 ? "text-danger" : "text-muted")}>
                {n > 0 ? `owes you ${money(n)}` : n < 0 ? `you owe ${money(-n)}` : "settled"}
              </span>
            </button>
          );
        })}
      </Card>
      <PersonSheet person={current} onClose={() => setOpen(null)} />
    </div>
  );
}

function PersonSheet({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setEmail(person?.email ?? ""), [person?.id, person?.email]);

  async function run(request: Promise<string | null>, done: string) {
    setBusy(true);
    const error = await request;
    if (!error) await syncNow(); // pulls the person's new link state
    setBusy(false);
    toast(error ?? done);
    if (!error) onClose();
  }
  const sendInvite = () => person && run(call("/api/links", { method: "POST", body: JSON.stringify({ personId: person.id, email }) }), `Invite sent to ${email.trim()}.`);
  const stop = (done: string) => person && run(call(`/api/links?personId=${encodeURIComponent(person.id)}`, { method: "DELETE" }), done);

  return (
    <Sheet open={person !== null} onClose={onClose} title={person?.name ?? ""}>
      {person && (
        <div className="space-y-4">
          {person.link === "linked" ? (
            <>
              <p className="rounded-2xl bg-accent-soft p-3 text-sm text-accent">
                Linked with <b>{person.email}</b>. Every loan and repayment between you two shows on both accounts, whoever adds it.
              </p>
              <Button variant="danger" className="w-full" disabled={busy} onClick={() => stop("Sharing stopped. You both keep the records you have.")}>
                Stop sharing
              </Button>
            </>
          ) : person.link === "invited" ? (
            <>
              <p className="rounded-2xl bg-surface-2 p-3 text-sm text-ink-2">
                Invite sent to <b>{person.email}</b>. Sharing starts when they accept.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" disabled={busy} onClick={() => stop("Invite cancelled.")}>
                  Cancel invite
                </Button>
                <Button className="flex-1" disabled={busy} onClick={sendInvite}>
                  Send again
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-ink-2">
                Right now {person.name} is only a name in your records. Invite them and you both see the same loans and repayments, each from your own side.
              </p>
              <Field label="Their email" hint="They get an email. If they don't use Kharcha yet, the link lets them create an account.">
                <input id="link-email" type="email" inputMode="email" autoComplete="off" className={inputClass} value={email} placeholder="name@example.com" onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Button className="w-full" disabled={busy || !email.includes("@")} onClick={sendInvite}>
                <Mail size={17} /> Send invite
              </Button>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
