"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { categoryTotals, type CatIndex, type PeriodSummary } from "@/lib/budget/calc";
import { prettyDay } from "@/lib/budget/week";
import { money } from "@/lib/money";
import type { Tx } from "@/lib/types";
import { TxRow } from "./tx-row";
import { Button, Sheet, cx } from "./ui";

function Row({ label, sub, amount, sign, strong }: { label: string; sub?: string; amount: number; sign?: "+" | "−"; strong?: boolean }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3 py-1.5", strong && "border-t border-line pt-2.5 font-semibold")}>
      <span className="min-w-0">
        <span className={cx(!strong && "text-ink-2")}>{label}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
      <span className={cx("tnum shrink-0", sign === "+" && "text-good", strong && amount < 0 && "text-danger")}>
        {sign}
        {money(sign ? Math.abs(amount) : amount)}
      </span>
    </div>
  );
}

interface Props {
  sum: PeriodSummary;
  txs: Tx[]; // any range; only the period's are used
  cats: CatIndex;
  noun: string;
}

/** Every amount of the period: what came in, where it went, what is left, and how today's figure is reached. */
export function BreakdownRows({ sum, txs, cats, noun }: Props) {
  const inPeriod = txs.filter((t) => t.day >= sum.start && t.day <= sum.end);
  const extra = categoryTotals(inPeriod, cats, { type: "income" }).filter((c) => c.category?.key !== "budget");
  const budgetDays = [...new Set(inPeriod.filter((t) => t.type === "income" && !t.deletedAt && t.categoryId && cats.get(t.categoryId)?.key === "budget").map((t) => t.day))].sort();
  const held = sum.reserves.filter((r) => r.locked > 0);
  const isCurrent = sum.today >= sum.start && sum.today <= sum.end;

  return (
    <div className="space-y-4 text-[0.95rem]">
      <div>
        <p className="eyebrow text-muted">Money in</p>
        <Row label="Budget" amount={sum.budgetIn} sign="+" sub={sum.budgetIn ? `Logged ${budgetDays.map((x) => prettyDay(x, sum.today)).join(", ")}` : "Not logged yet"} />
        {extra.map((c) => (
          <Row key={c.categoryId} label={c.category?.name ?? "Other"} amount={c.total} sign="+" />
        ))}
        {sum.carryIn > 0 && <Row label={`Carried from last ${noun}`} amount={sum.carryIn} sign="+" />}
        {sum.loansTaken > 0 && <Row label="Borrowed" amount={sum.loansTaken} sign="+" />}
        {sum.loansCollected > 0 && <Row label="Paid back to you" amount={sum.loansCollected} sign="+" />}
        {sum.savingWithdrawn > 0 && <Row label="Taken out of savings" amount={sum.savingWithdrawn} sign="+" />}
        <Row label="Total in" amount={sum.moneyIn} strong />
      </div>

      <div>
        <p className="eyebrow text-muted">Where it went</p>
        <Row label="Spent" amount={sum.spent} sign="−" />
        {sum.saved > 0 && <Row label="Saved" amount={sum.saved} sign="−" sub="Moved to your savings goals" />}
        {sum.reserveSpent > 0 && <Row label="Paid from set aside" amount={sum.reserveSpent} sign="−" sub={sum.reserves.filter((r) => r.reserve.kind === "spend" && r.spent > 0).map((r) => r.reserve.name).join(", ")} />}
        {sum.reserveLocked > 0 && <Row label="Set aside, still held" amount={sum.reserveLocked} sign="−" sub={held.map((r) => `${r.reserve.name} ${money(r.amount)}`).join(" · ")} />}
        {sum.loansGiven > 0 && <Row label="Lent" amount={sum.loansGiven} sign="−" />}
        {sum.loansRepaid > 0 && <Row label="Paid back to others" amount={sum.loansRepaid} sign="−" />}
        <Row label={`Left this ${noun}`} amount={sum.spendable} strong />
      </div>

      {isCurrent && !sum.isOffToday && sum.moneyIn > 0 && (
        <div className="rounded-2xl bg-surface-2 p-3 text-sm text-ink-2">
          <p className="eyebrow mb-1 text-muted">Today</p>
          <p>
            {money(sum.spendable)} left{sum.spentToday > 0 ? ` + ${money(sum.spentToday)} already spent today` : ""}, split over {sum.daysLeft} working {sum.daysLeft === 1 ? "day" : "days"} ={" "}
            <b className="tnum text-ink">{money(sum.dailyLimit)} a day</b>.
          </p>
          <p className="mt-1">
            {sum.leftToday >= 0 ? (
              <>
                <b className="tnum text-ink">{money(sum.leftToday)}</b> of that is still safe to spend today.
              </>
            ) : (
              <>
                You are <b className="tnum text-danger">{money(-sum.leftToday)}</b> over that today.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/** The breakdown as a card (Reports). */
export function PeriodBreakdown(props: Props & { title: string }) {
  return (
    <section className="rounded-3xl bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[1.05rem] font-semibold tracking-tight">{props.title}</h2>
        <span className="tnum text-sm text-muted">{money(props.sum.moneyIn)} came in</span>
      </div>
      <BreakdownRows {...props} />
    </section>
  );
}

/** The breakdown as a sheet (Home): every amount, then every entry of the period. */
export function BreakdownSheet({ open, onClose, onSetAside, ...props }: Props & { open: boolean; onClose: () => void; onSetAside: () => void }) {
  const entries = props.txs.filter((t) => !t.deletedAt && t.day >= props.sum.start && t.day <= props.sum.end);
  return (
    <Sheet open={open} onClose={onClose} title={`This ${props.noun}'s money`}>
      <div className="space-y-5">
        <BreakdownRows {...props} />
        {props.sum.reserves.length > 0 && (
          <Button variant="soft" className="w-full" onClick={onSetAside}>
            <Lock size={16} /> Pay, save or release set-aside money
          </Button>
        )}
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <p className="eyebrow text-muted">Every entry this {props.noun}</p>
            <Link href="/history" className="text-sm font-semibold text-accent">
              All history
            </Link>
          </div>
          {entries.length === 0 ? (
            <p className="py-3 text-sm text-muted">Nothing logged yet.</p>
          ) : (
            <div className="divide-y divide-line">
              {entries.map((t) => (
                <TxRow key={t.id} tx={t} showDay />
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
