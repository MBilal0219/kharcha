"use client";

import { moneySplit, type PeriodSummary } from "@/lib/budget/calc";
import { money } from "@/lib/money";
import { cx } from "./ui";

const PARTS = [
  { key: "left", label: "Left", bar: "bg-ticket-ink", text: "text-ticket-ink" },
  { key: "spent", label: "Spent", bar: "bg-ticket-red", text: "text-ticket-red" },
  { key: "saved", label: "Saved", bar: "bg-ticket-mint", text: "text-ticket-mint" },
  { key: "setAside", label: "Set aside", bar: "bg-ticket-gold", text: "text-ticket-gold" },
  { key: "lent", label: "Lent / repaid", bar: "bg-ticket-muted", text: "text-ticket-muted" },
] as const;

/**
 * The period's money as one bar on the ticket: everything that came in, split into what is left,
 * spent, saved and set aside. The parts always add up to the total.
 */
export function MoneyBar({ sum, noun }: { sum: PeriodSummary; noun: string }) {
  const split = moneySplit(sum);
  const parts = PARTS.map((p) => ({ ...p, amount: split[p.key] })).filter((p) => p.amount > 0 || p.key === "left" || p.key === "spent");
  const scale = parts.reduce((a, p) => a + p.amount, 0) || 1;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow text-ticket-muted">This {noun}&apos;s money</p>
        <p className="font-display text-lg font-semibold tnum">{money(split.total)}</p>
      </div>
      <div className="mt-2 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-ticket-ink/10" aria-hidden="true">
        {parts.map((p) => p.amount > 0 && <span key={p.key} className={cx("h-full", p.bar)} style={{ width: `${(p.amount / scale) * 100}%` }} />)}
      </div>
      <dl className={cx("mt-3 grid gap-x-3 gap-y-2", parts.length > 4 ? "grid-cols-3" : parts.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
        {parts.map((p) => (
          <div key={p.key} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-ticket-muted">
              <span className={cx("h-2 w-2 shrink-0 rounded-full", p.bar)} />
              <span className="whitespace-nowrap">{p.label}</span>
            </dt>
            <dd className={cx("mt-0.5 font-display text-[1.02rem] font-semibold tnum", p.key === "left" ? (split.over > 0 ? "text-ticket-red" : "text-ticket-ink") : p.key === "setAside" ? "text-ticket-gold" : "text-ticket-ink")}>
              {p.key === "left" && split.over > 0 ? money(-split.over) : money(p.amount)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
