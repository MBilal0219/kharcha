"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { differenceInCalendarWeeks, parseISO, format } from "date-fns";
import { ArrowLeftRight, HandCoins, PiggyBank, Plus, Scale, Target, Wallet } from "lucide-react";
import { useAppData } from "@/lib/local/app-data";
import { repayLoan, upsertGoal } from "@/lib/local/ops";
import { weeksToDebtFree, type LoanState } from "@/lib/budget/calc";
import { addDay } from "@/lib/budget/week";
import { money, parseAmount, toInput } from "@/lib/money";
import { AmountInput } from "@/components/amount-input";
import { CashCountSheet } from "@/components/cash-count";
import { WalletSheet, type WalletDraft } from "@/components/wallet-sheet";
import { LinkRequests, PeopleCard } from "@/components/people-links";
import { Button, Card, Empty, Field, Progress, Segmented, SectionTitle, Sheet, inputClass, toast, cx } from "@/components/ui";

type Tab = "wallets" | "savings" | "loans";

export default function MoneyPage() {
  return (
    <Suspense>
      <Money />
    </Suspense>
  );
}

function Money() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") as Tab) || "savings";
  return (
    <div className="space-y-5">
      <header className="page-header glass">
        <h1 className="font-display text-[1.7rem] font-bold tracking-tight">Money</h1>
      </header>
      <Segmented
        value={tab}
        onChange={(t) => router.replace(`/money?tab=${t}`)}
        options={[
          { value: "savings", label: "Savings" },
          { value: "loans", label: "Loans" },
          { value: "wallets", label: "Accounts" },
        ]}
      />
      {tab === "wallets" && <Wallets />}
      {tab === "savings" && <Savings />}
      {tab === "loans" && <Loans />}
    </div>
  );
}

function Wallets() {
  const d = useAppData();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<WalletDraft | null>(null);
  const total = [...d.walletBal.values()].reduce((a, b) => a + b, 0);
  return (
    <>
      <Card>
        <p className="text-sm text-muted">All your money</p>
        <p className="font-display text-4xl font-bold tnum">{money(total)}</p>
        <p className="mt-1 text-sm text-muted">Savings goals are inside this total: they mark money as set aside.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="soft" onClick={() => setOpen(true)}>
            <Scale size={17} /> Count cash
          </Button>
          <Link href="/add?type=move" className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-line font-semibold">
            <ArrowLeftRight size={17} /> Move
          </Link>
        </div>
      </Card>
      <Card className="divide-y divide-line py-1">
        {d.wallets.map((w) => (
          <button key={w.id} onClick={() => setAccount({ id: w.id, name: w.name })} className="flex w-full items-center gap-3 py-3 text-left">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-surface-2 text-ink-2">
              <Wallet size={18} />
            </span>
            <div className="flex-1">
              <p className="font-semibold">{w.name}</p>
              {w.isDefault && <p className="text-xs text-muted">Default</p>}
            </div>
            <span className={cx("tnum font-semibold", (d.walletBal.get(w.id) ?? 0) < 0 && "text-danger")}>{money(d.walletBal.get(w.id) ?? 0)}</span>
          </button>
        ))}
        <div className="py-3">
          <Button variant="soft" className="w-full" onClick={() => setAccount({ name: "" })}>
            <Plus size={17} /> Add an account
          </Button>
        </div>
      </Card>
      {d.cashCounts.length > 0 && (
        <div>
          <SectionTitle>Recent cash counts</SectionTitle>
          <Card className="divide-y divide-line py-1">
            {d.cashCounts.slice(0, 6).map((c) => {
              const diff = c.counted - c.expected;
              return (
                <div key={c.id} className="flex items-center justify-between py-3 text-sm">
                  <span>
                    <b>{d.wallets.find((w) => w.id === c.walletId)?.name}</b> · {format(parseISO(c.countedAt), "d MMM, h:mm a")}
                  </span>
                  <span className={cx("tnum font-semibold", diff === 0 ? "text-good" : diff < 0 ? "text-danger" : "text-gold")}>
                    {diff === 0 ? "Matched" : `${diff > 0 ? "+" : "−"}${money(Math.abs(diff))}`}
                  </span>
                </div>
              );
            })}
          </Card>
        </div>
      )}
      <p className="px-1 text-sm text-muted">Add any bank, card or e-wallet account. Tap one to rename it, make it the default or remove it.</p>
      <WalletSheet draft={account} onChange={setAccount} onClose={() => setAccount(null)} />
      <CashCountSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function Savings() {
  const d = useAppData();
  const [editing, setEditing] = useState<{ id?: string; name: string; target: string; targetDate: string } | null>(null);

  async function saveGoal() {
    if (!editing) return;
    const target = parseAmount(editing.target);
    if (!editing.name.trim() || !target) return;
    await upsertGoal({ id: editing.id, name: editing.name.trim(), target, targetDate: editing.targetDate || null });
    toast(editing.id ? "Goal updated" : "Goal added");
    setEditing(null);
  }

  // Weekly saving pace over the last 4 weeks
  const since = addDay(d.today, -28);
  const recent = d.txs.filter((t) => t.day >= since && !t.loanId);
  const weekly = Math.round((recent.filter((t) => t.type === "saving").reduce((a, t) => a + t.amount, 0) - recent.filter((t) => t.type === "saving_withdraw").reduce((a, t) => a + t.amount, 0)) / 4);

  return (
    <>
      <section className="rounded-3xl bg-gold-soft p-4">
        <p className="text-sm text-ink-2">Total saved</p>
        <p className="font-display text-4xl font-bold tnum">{money(d.savedTotal)}</p>
        <p className="mt-1 text-sm text-ink-2">{weekly > 0 ? `You're saving about ${money(weekly)} a week.` : "Save extra income and leftovers to grow this."}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/add?type=save" className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-accent-ink">
            <PiggyBank size={17} /> Put money in
          </Link>
          <Button variant="outline" onClick={() => setEditing({ name: "", target: "", targetDate: "" })}>
            <Plus size={17} /> New goal
          </Button>
        </div>
      </section>

      <div className="space-y-3">
        {d.goals.map((g) => {
          const bal = d.goalBal.get(g.id) ?? 0;
          const left = Math.max(g.target - bal, 0);
          const weeksLeft = g.targetDate ? Math.max(1, differenceInCalendarWeeks(parseISO(g.targetDate), parseISO(d.today), { weekStartsOn: 1 })) : null;
          return (
            <button
              key={g.id}
              onClick={() => setEditing({ id: g.id, name: g.name, target: g.target ? toInput(g.target) : "", targetDate: g.targetDate ?? "" })}
              className="block w-full rounded-3xl bg-surface p-4 text-left shadow-card"
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {g.kind === "buffer" ? <ShieldDot /> : <Target size={16} className="text-accent" />}
                  <p className="truncate font-semibold">{g.name}</p>
                </div>
                <p className="tnum text-sm text-muted">
                  {money(bal)} / {money(g.target)}
                </p>
              </div>
              <Progress value={bal} max={g.target} tone={g.kind === "buffer" ? "gold" : "accent"} className="my-2" />
              <p className="text-sm text-muted">
                {g.target === 0
                  ? "Tap to set a target."
                  : left === 0
                  ? "Reached. Well done."
                  : g.kind === "buffer"
                    ? `${money(left)} to go. Fill this before other goals.`
                    : weeksLeft
                      ? `${money(left)} to go · ${money(Math.ceil(left / weeksLeft))} a week to make it by ${format(parseISO(g.targetDate!), "d MMM")}`
                      : weekly > 0
                        ? `${money(left)} to go · about ${Math.ceil(left / weekly)} weeks at your pace`
                        : `${money(left)} to go`}
              </p>
            </button>
          );
        })}
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? "Edit goal" : "New goal"}>
        {editing && (
          <div className="space-y-4">
            <Field label="Name">
              <input id="goal-name" className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. New phone" />
            </Field>
            <Field label="Target">
              <AmountInput id="goal-target" value={editing.target} onChange={(target) => setEditing({ ...editing, target })} />
            </Field>
            <Field label="By date (optional)">
              <input id="goal-date" type="date" className={inputClass} min={d.today} value={editing.targetDate} onChange={(e) => setEditing({ ...editing, targetDate: e.target.value })} />
            </Field>
            <Button className="w-full" onClick={saveGoal} disabled={!editing.name.trim() || !parseAmount(editing.target)}>
              Save goal
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}

function ShieldDot() {
  return <span className="h-2.5 w-2.5 rounded-full bg-gold" aria-hidden="true" />;
}

function Loans() {
  const d = useAppData();
  const [paying, setPaying] = useState<LoanState | null>(null);
  const [amount, setAmount] = useState("");
  const open = d.loanStates.filter((s) => s.loan.status === "open" && s.outstanding > 0);
  const borrowed = open.filter((s) => s.loan.direction === "borrowed");
  const lent = open.filter((s) => s.loan.direction === "lent");
  const closed = d.loanStates.filter((s) => s.loan.status === "closed" || s.outstanding === 0);

  const since = addDay(d.today, -28);
  const repaidRecent = d.txs.filter((t) => t.day >= since && t.loanId && (t.type === "loan_repaid" || (t.type === "saving" && t.loanId))).reduce((a, t) => a + t.amount, 0);
  const weeks = weeksToDebtFree(d.owed, Math.round(repaidRecent / 4));

  async function pay() {
    if (!paying) return;
    const n = parseAmount(amount);
    if (!n) return;
    await repayLoan(paying, n);
    toast(n >= paying.outstanding ? "Loan cleared." : `${money(n)} recorded.`);
    setPaying(null);
    setAmount("");
  }

  const name = (s: LoanState) => (s.loan.personId ? d.peopleById.get(s.loan.personId)?.name ?? "Someone" : "My savings");

  const row = (s: LoanState) => {
    const overdue = s.loan.dueDate && s.loan.dueDate < d.today;
    return (
      <div key={s.loan.id} className="rounded-3xl bg-surface p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{name(s)}</p>
            <p className={cx("text-sm", overdue ? "font-semibold text-danger" : "text-muted")}>
              {s.loan.dueDate ? `${overdue ? "Overdue · was due" : "Due"} ${format(parseISO(s.loan.dueDate), "d MMM")}` : `Since ${format(parseISO(s.loan.createdDay), "d MMM")}`}
            </p>
          </div>
          <p className="font-display text-xl font-semibold tnum">{money(s.outstanding)}</p>
        </div>
        <Progress value={s.paid} max={s.loan.principal} className="my-3" />
        <div className="flex items-center justify-between">
          <span className="tnum text-sm text-muted">
            {money(s.paid)} of {money(s.loan.principal)} {s.loan.direction === "borrowed" ? "paid" : "returned"}
          </span>
          <Button size="sm" variant="soft" onClick={() => { setPaying(s); setAmount(toInput(s.outstanding)); }}>
            {s.loan.direction === "borrowed" ? "Pay back" : "Got paid"}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <section className={cx("rounded-3xl p-4", d.owed ? "bg-danger-soft" : "bg-surface shadow-card")}>
          <p className="text-sm text-ink-2">You owe</p>
          <p className={cx("font-display text-3xl font-bold tnum", d.owed > 0 && "text-danger")}>{money(d.owed)}</p>
          <p className="text-xs text-ink-2">{d.owed === 0 ? "Debt-free" : weeks ? `Debt-free in ~${weeks} wk at your pace` : "Start paying back weekly"}</p>
        </section>
        <Card>
          <p className="text-sm text-muted">Owed to you</p>
          <p className="font-display text-3xl font-bold tnum">{money(d.owedToYou)}</p>
          <p className="text-xs text-muted">{lent.length} open</p>
        </Card>
      </div>

      <LinkRequests />

      <Link href="/add?type=loan" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-accent-ink">
        <HandCoins size={18} /> Record a loan
      </Link>

      {borrowed.length === 0 && lent.length === 0 ? (
        <Empty icon={<HandCoins size={20} />} title="No open loans" text="When you borrow or lend, track it here so nothing is forgotten." />
      ) : (
        <>
          {borrowed.length > 0 && (
            <div className="space-y-3">
              <SectionTitle>You owe</SectionTitle>
              {borrowed.map(row)}
            </div>
          )}
          {lent.length > 0 && (
            <div className="space-y-3">
              <SectionTitle>Owed to you</SectionTitle>
              {lent.map(row)}
            </div>
          )}
        </>
      )}

      <PeopleCard />

      {closed.length > 0 && (
        <details className="rounded-3xl bg-surface p-4 shadow-card">
          <summary className="cursor-pointer font-semibold">Cleared loans ({closed.length})</summary>
          <ul className="mt-3 divide-y divide-line">
            {closed.map((s) => (
              <li key={s.loan.id} className="flex justify-between py-2.5 text-sm">
                <span>
                  {name(s)} · {s.loan.direction === "borrowed" ? "borrowed" : "lent"}
                </span>
                <span className="tnum text-muted">{money(s.loan.principal)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Sheet open={paying !== null} onClose={() => setPaying(null)} title={paying?.loan.direction === "borrowed" ? `Pay back ${paying ? name(paying) : ""}` : "Record payment"}>
        {paying && (
          <div className="space-y-4">
            <p className="text-ink-2">
              {money(paying.outstanding)} left on this loan.
            </p>
            <AmountInput id="loan-pay-amount" value={amount} onChange={setAmount} size="lg" autoFocus />
            <Button className="w-full" onClick={pay} disabled={!parseAmount(amount)}>
              Record {parseAmount(amount) ? money(Math.min(parseAmount(amount), paying.outstanding)) : ""}
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}
