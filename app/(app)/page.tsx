"use client";

import Link from "next/link";
import { useState } from "react";
import { BellRing, CalendarCheck, ChevronDown, Coins, HandCoins, Lock, PiggyBank, Plus, Settings as Gear, Scale, Flame } from "lucide-react";
import { useAppData } from "@/lib/local/app-data";
import { addTx, closeDay, moveToGoal, remove, setPeriod } from "@/lib/local/ops";
import { periodNoun } from "@/lib/budget/period";
import { reminderHours } from "@/lib/budget/reminders";
import { dayLong, prettyRange } from "@/lib/budget/week";
import { money } from "@/lib/money";
import { defaultGoal } from "@/lib/goal";
import { Button, Card, Progress, SectionTitle, toast, cx } from "@/components/ui";
import { CategorySheet, newCategory, type CategoryDraft } from "@/components/category-sheet";
import { CatIcon } from "@/components/icons";
import { SyncPill } from "@/components/sync-pill";
import { WeekStrip } from "@/components/week-strip";
import { TxRow } from "@/components/tx-row";
import { CashCountSheet } from "@/components/cash-count";
import { QuickEntrySheet, type QuickEntry } from "@/components/quick-entry";
import { BreakdownSheet } from "@/components/period-breakdown";
import { MoneyBar } from "@/components/money-bar";
import { WhereItWent } from "@/components/home-glance";
import { ReserveSheet } from "@/components/reserve-sheet";

export default function HomePage() {
  const d = useAppData();
  const { sum, prevSum, settings, period } = d;
  const [reserveOpen, setReserveOpen] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [entry, setEntry] = useState<QuickEntry | null>(null);
  const [newCat, setNewCat] = useState<CategoryDraft | null>(null);

  const noun = periodNoun(period.kind);
  const firstName = d.user?.name?.split(" ")[0] || "there";
  const todayTxs = d.txs.filter((t) => t.day === d.today);
  const goal = defaultGoal(d.goals, d.goalBal);
  const lateAndEmpty = d.hour >= reminderHours(settings.reminderHour, settings.reminderHour2)[0] && !d.loggedToday;
  const expenseCats = d.categories.filter((c) => c.kind === "expense" && !c.archived && c.key !== "unaccounted");
  const budgetCat = d.categories.find((c) => c.key === "budget");

  // An unpaid reserve from last period is still in your pocket, so it counts as leftover.
  const prevLeft = Math.max(prevSum.spendable + prevSum.reserveLocked, 0);
  const showSweep = prevLeft > 0 && prevSum.moneyIn > 0 && !d.periodSettings.get(period.start)?.sweptPrev;
  const leftover = sum.reserves.find((r) => r.leftover > 0 && !d.periodTxs.some((t) => t.type === "saving" && t.note === `${r.reserve.name} leftover`));

  const limited = d.categories
    .filter((c) => c.kind === "expense" && c.limit && !c.archived)
    .map((c) => ({ c, spent: d.periodTxs.filter((t) => t.type === "expense" && t.categoryId === c.id).reduce((a, t) => a + t.amount, 0) }));

  // The 7 days around today, in step with the period's first day.
  const chunk = Math.floor(Math.max(sum.dailySpend.findIndex((x) => x.day === d.today), 0) / 7) * 7;
  const strip = sum.dailySpend.slice(chunk, chunk + 7);

  async function quickAdd(tplId: string) {
    const t = d.templates.find((x) => x.id === tplId);
    if (!t) return;
    const tx = await addTx({ type: t.type, amount: t.amount, categoryId: t.categoryId, walletId: t.walletId, needWant: t.needWant, note: t.label });
    toast(`${t.label} · ${money(t.amount)} added`, { label: "Undo", run: () => void remove("transactions", tx.id) });
  }

  async function sweep(save: boolean) {
    if (save && goal) {
      // Dated in the last period so it comes out of that leftover, not this period's budget.
      await moveToGoal(goal.id, prevLeft, `Last ${noun}'s leftover`, d.prevPeriod.end);
      await setPeriod(period.start, { sweptPrev: true });
      toast(`${money(prevLeft)} saved to ${goal.name}.`);
    } else {
      await setPeriod(period.start, { sweptPrev: true, carryIn: prevLeft });
      toast(`${money(prevLeft)} carried into this ${noun}.`);
    }
  }

  // ---- hero numbers ----
  const noMoney = sum.moneyIn === 0;
  const overToday = sum.leftToday < 0;
  const paceLabel = { none: "", good: "On track", watch: "Slow down", over: "Over pace" }[sum.pace];

  return (
    <div className="space-y-5">
      <header className="page-header glass justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {dayLong(d.today)} · {prettyRange(period.start, period.end)}
          </p>
          <h1 className="truncate font-display text-[1.6rem] font-bold leading-tight tracking-tight">Hi, {firstName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <SyncPill />
          <Link href="/settings" aria-label="Settings" className="grid h-10 w-10 place-items-center rounded-full bg-surface text-ink-2 shadow-card">
            <Gear size={19} />
          </Link>
        </div>
      </header>

      {!sum.budgetLogged && budgetCat && (
        <Card className="anim-rise flex items-center gap-3 border border-accent/30">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Coins size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Got this {noun}&apos;s budget?</p>
            <p className="text-sm text-muted">Log it to start. Change the amount if it&apos;s different this time.</p>
          </div>
          <Button size="sm" onClick={() => setEntry({ category: budgetCat, amount: settings.budgetAmount || undefined, note: `This ${noun}'s budget` })}>
            Log it
          </Button>
        </Card>
      )}

      {/* ---------- ticket hero ---------- */}
      <section className="ticket anim-rise overflow-hidden shadow-card" aria-label="Today's budget">
        <div className="ticket-grain" />
        <div className="ticket-top relative flex cursor-pointer flex-col justify-between p-5" role="button" tabIndex={0} onClick={() => setBreakdown(true)} onKeyDown={(e) => e.key === "Enter" && setBreakdown(true)}>
          <div className="flex items-start justify-between gap-2">
            <p className="eyebrow text-ticket-muted">{sum.isOffToday ? `Day off · ${noun} left` : overToday ? "Over today's limit" : "Safe to spend today"}</p>
            {paceLabel && (
              <span
                className={cx(
                  "rounded-full px-2.5 py-1 text-[0.7rem] font-bold",
                  sum.pace === "good" && "bg-ticket-mint/20 text-ticket-mint",
                  sum.pace === "watch" && "bg-ticket-gold/20 text-ticket-gold",
                  sum.pace === "over" && "bg-ticket-red/20 text-ticket-red",
                )}
              >
                {paceLabel}
              </span>
            )}
          </div>
          <div>
            <p className={cx("font-display text-[3.4rem] font-bold leading-none tracking-tight tnum", overToday && !sum.isOffToday && "text-ticket-red")}>
              {noMoney ? money(0) : money(sum.isOffToday ? Math.max(sum.spendable, 0) : Math.abs(sum.leftToday))}
            </p>
            <p className="mt-2 text-sm text-ticket-muted">
              {noMoney
                ? "Log your budget or any money in to begin."
                : sum.isOffToday
                  ? "No spending planned today. Anything you spend comes out of the days ahead."
                  : overToday
                    ? sum.dailyLimit > 0
                      ? `Today's limit was ${money(sum.dailyLimit)}. Tomorrow's will be lower.`
                      : "Nothing was left for today. This comes out of the days ahead."
                    : sum.daysLeft === 1
                      ? `of ${money(sum.dailyLimit)} · last working day of this ${noun}`
                      : `of ${money(sum.dailyLimit)} today · ${sum.daysLeft} working days left`}
            </p>
          </div>
        </div>
        <div className="perforation" />
        <div className="relative px-5 pb-3 pt-4">
          <div role="button" tabIndex={0} className="cursor-pointer" aria-label={`This ${noun}'s money: see every amount`} onClick={() => setBreakdown(true)} onKeyDown={(e) => e.key === "Enter" && setBreakdown(true)}>
            <MoneyBar sum={sum} noun={noun} />
            {period.kind !== "weekly" && !noMoney && (
              <p className="mt-2 text-sm text-ticket-muted">
                Safe for the next 7 days: <b className="tnum text-ticket-ink">{money(sum.weekSafe)}</b>
              </p>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-ticket-ink/15 pt-2">
            <button onClick={() => setBreakdown(true)} className="flex h-10 items-center gap-1 text-sm font-semibold text-ticket-mint">
              See every amount <ChevronDown size={16} />
            </button>
            <button onClick={() => setReserveOpen(true)} aria-label="Money set aside" className="flex h-10 items-center gap-1.5 text-sm font-semibold text-ticket-gold">
              <Lock size={13} /> Set aside
            </button>
          </div>
        </div>
      </section>

      {sum.runOutDay && <p className="-mt-2 px-1 text-sm font-semibold text-danger">At this pace you run out on {dayLong(sum.runOutDay)}.</p>}
      {!noMoney && sum.reserveShort > 0 && (
        <p className="-mt-2 px-1 text-sm text-muted">
          {money(sum.reserveShort)} of what you set aside isn&apos;t covered yet. It will be once more money comes in.
        </p>
      )}

      {/* ---------- quick add ---------- */}
      <div>
        <SectionTitle
          action={
            <Link href="/add?type=income" className="text-sm font-semibold text-accent">
              + Money in
            </Link>
          }
        >
          Add an expense
        </SectionTitle>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
          {d.templates.map((t) => (
            <button
              key={t.id}
              onClick={() => quickAdd(t.id)}
              className="flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-accent/30 bg-accent-soft px-3.5 text-sm font-semibold text-accent transition active:scale-[0.97]"
            >
              {t.label} <span className="tnum font-normal">{money(t.amount)}</span>
            </button>
          ))}
          {expenseCats.map((c) => (
            <button
              key={c.id}
              onClick={() => setEntry({ category: c })}
              className="flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 text-sm font-semibold transition active:scale-[0.97]"
            >
              <CatIcon name={c.icon} size={17} /> {c.name}
            </button>
          ))}
          <button
            onClick={() => setNewCat(newCategory("expense"))}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-dashed border-line px-3.5 text-sm font-semibold text-accent transition active:scale-[0.97]"
          >
            <Plus size={16} /> New category
          </button>
        </div>
      </div>

      {lateAndEmpty && (
        <Card className="anim-rise border border-gold/40 bg-gold-soft">
          <div className="flex gap-3">
            <BellRing className="mt-0.5 shrink-0 text-gold" size={20} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Nothing is logged today.</p>
              <p className="text-sm text-ink-2">Add what you spent, or mark today as a no-spend day.</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => closeDay(d.today).then(() => toast("Marked as a no-spend day. Nice."))}>
                Nothing spent
              </Button>
            </div>
          </div>
        </Card>
      )}

      {showSweep && (
        <Card className="anim-rise">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold-soft text-gold">
              <PiggyBank size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {money(prevLeft)} left from last {noun}
              </p>
              <p className="text-sm text-muted">{goal ? `Save it to ${goal.name}, or carry it into this ${noun}.` : `Carry it into this ${noun}?`}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => sweep(false)}>
              Carry over
            </Button>
            {goal && (
              <Button className="flex-1" onClick={() => sweep(true)}>
                Save it
              </Button>
            )}
          </div>
        </Card>
      )}

      {leftover && goal && (
        <Card className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold-soft text-gold">
            <Lock size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {leftover.reserve.name} cost {money(leftover.spent)}
            </p>
            <p className="text-sm text-muted">Save the {money(leftover.leftover)} left over from what you set aside?</p>
          </div>
          <Button size="sm" onClick={() => moveToGoal(goal.id, leftover.leftover, `${leftover.reserve.name} leftover`).then(() => toast("Saved. Small wins add up."))}>
            Save
          </Button>
        </Card>
      )}

      <Card>
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <h2 className="font-display text-[1.05rem] font-semibold tracking-tight">{period.kind === "weekly" ? "Day by day" : "These 7 days"}</h2>
          <p className="flex shrink-0 items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-accent" /> Spent
            </span>
            <span className="font-semibold text-good">+ Money in</span>
          </p>
        </div>
        <WeekStrip days={strip} reference={sum.perDay} today={d.today} />
      </Card>

      <WhereItWent sum={sum} txs={d.periodTxs} cats={d.cats} noun={noun} />

      {limited.length > 0 && (
        <Card>
          <h2 className="mb-3 font-display text-[1.05rem] font-semibold tracking-tight">Category limits</h2>
          <ul className="space-y-3">
            {limited.map(({ c, spent }) => {
              const pct = spent / (c.limit || 1);
              return (
                <li key={c.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold">{c.name}</span>
                    <span className={cx("tnum", pct > 1 ? "font-semibold text-danger" : "text-muted")}>
                      {money(spent)} / {money(c.limit!)}
                    </span>
                  </div>
                  <Progress value={spent} max={c.limit!} tone={pct > 1 ? "danger" : pct > 0.8 ? "gold" : "accent"} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat href="/money?tab=savings" icon={<PiggyBank size={18} />} label="Saved" value={money(d.savedTotal)} tone="gold" />
        <Stat href="/money?tab=loans" icon={<HandCoins size={18} />} label={d.owed || !d.owedToYou ? "You owe" : "Owed to you"} value={money(d.owed || d.owedToYou)} tone={d.owed ? "danger" : "accent"} />
        <button onClick={() => setCashOpen(true)} className="text-left">
          <Stat icon={<Scale size={18} />} label="Cash check" value={money([...d.walletBal.values()].reduce((a, b) => a + b, 0))} tone="neutral" />
        </button>
      </div>

      <div>
        <SectionTitle
          action={
            todayTxs.length > 0 && (
              <span className="tnum text-sm font-semibold text-muted">
                {money(todayTxs.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0))} spent
              </span>
            )
          }
        >
          Today
        </SectionTitle>
        <Card className="py-2">
          {todayTxs.length ? (
            <div className="divide-y divide-line">
              {todayTxs.map((t) => (
                <TxRow key={t.id} tx={t} />
              ))}
            </div>
          ) : d.closures.has(d.today) ? (
            <p className="flex items-center gap-2 py-3 text-sm text-accent">
              <CalendarCheck size={18} /> No-spend day. Well done.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3 py-2">
              <p className="text-sm text-muted">Nothing logged yet today.</p>
              <Button size="sm" variant="soft" onClick={() => closeDay(d.today).then(() => toast("Marked as a no-spend day."))}>
                Nothing spent
              </Button>
            </div>
          )}
        </Card>
        {d.streak >= 2 && (
          <p className="mt-2 flex items-center gap-1.5 px-1 text-sm text-muted">
            <Flame size={15} className="text-gold" /> {d.streak}-day logging streak
          </p>
        )}
      </div>

      <QuickEntrySheet entry={entry} onClose={() => setEntry(null)} />
      <CategorySheet draft={newCat} onChange={setNewCat} onClose={() => setNewCat(null)} onSaved={(c) => c.kind === "expense" && setEntry({ category: c })} />
      <BreakdownSheet
        open={breakdown}
        onClose={() => setBreakdown(false)}
        onSetAside={() => {
          setBreakdown(false);
          setReserveOpen(true);
        }}
        sum={sum}
        txs={d.periodTxs}
        cats={d.cats}
        noun={noun}
      />
      <ReserveSheet open={reserveOpen} onClose={() => setReserveOpen(false)} />
      <CashCountSheet open={cashOpen} onClose={() => setCashOpen(false)} />
    </div>
  );
}

function Stat({ href, icon, label, value, tone }: { href?: string; icon: React.ReactNode; label: string; value: string; tone: "accent" | "gold" | "danger" | "neutral" }) {
  const body = (
    <div className="h-full rounded-3xl bg-surface p-3.5 shadow-card">
      <span
        className={cx(
          "mb-2.5 grid h-9 w-9 place-items-center rounded-xl",
          tone === "accent" && "bg-accent-soft text-accent",
          tone === "gold" && "bg-gold-soft text-gold",
          tone === "danger" && "bg-danger-soft text-danger",
          tone === "neutral" && "bg-surface-2 text-ink-2",
        )}
      >
        {icon}
      </span>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="truncate font-display text-[1.05rem] font-semibold tnum">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
