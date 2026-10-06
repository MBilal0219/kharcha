"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { categoryTotals, type CatIndex, type PeriodSummary } from "@/lib/budget/calc";
import { money } from "@/lib/money";
import type { Tx } from "@/lib/types";
import { CatIcon } from "./icons";
import { Card } from "./ui";

/** Where the period's spending went (by category) and where its money came from, side by side with amounts. */
export function WhereItWent({ sum, txs, cats, noun }: { sum: PeriodSummary; txs: Tx[]; cats: CatIndex; noun: string }) {
  const spentBy = categoryTotals(txs, cats, { excludeReserved: true });
  const cameFrom = categoryTotals(txs, cats, { type: "income" });
  const top = spentBy.slice(0, 4);
  const rest = spentBy.slice(4).reduce((a, c) => a + c.total, 0);
  const max = Math.max(...top.map((c) => c.total), rest, 1);

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[1.05rem] font-semibold tracking-tight">
          Spent this {noun} <span className="tnum text-muted">· {money(sum.spent)}</span>
        </h2>
        <Link href="/reports" className="flex shrink-0 items-center text-sm font-semibold text-accent">
          Report <ChevronRight size={16} />
        </Link>
      </div>

      {top.length === 0 ? (
        <p className="pb-1 text-sm text-muted">Nothing spent yet. Tap a category above to add your first expense.</p>
      ) : (
        <ul className="space-y-2.5">
          {top.map((c) => (
            <li key={c.categoryId} className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                <CatIcon name={c.category?.icon} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate font-semibold">{c.category?.name ?? "Uncategorised"}</span>
                  <span className="tnum shrink-0 text-ink-2">
                    {money(c.total)} <span className="text-muted">· {Math.round((c.total / (sum.spent || 1)) * 100)}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max((c.total / max) * 100, 3)}%` }} />
                </div>
              </div>
            </li>
          ))}
          {rest > 0 && (
            <li className="flex justify-between pl-11 text-sm text-muted">
              <span>{spentBy.length - 4} more</span>
              <span className="tnum">{money(rest)}</span>
            </li>
          )}
        </ul>
      )}

      {cameFrom.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="font-semibold">Money in</span>
            <span className="tnum font-semibold text-good">+{money(sum.budgetIn + sum.otherIncome)}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {cameFrom.map((c) => (
              <span key={c.categoryId} className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
                {c.category?.name ?? "Other"} <span className="tnum">{money(c.total)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
