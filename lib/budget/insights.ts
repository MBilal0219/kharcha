import type { PeriodKind, Tx } from "@/lib/types";
import { money } from "@/lib/money";
import { categoryTotals, type CatIndex, type PeriodSummary } from "./calc";
import { periodNoun } from "./period";
import { dayLong } from "./week";

export interface Insight {
  tone: "good" | "warn" | "info";
  text: string;
}

/** Plain-language observations for the dashboard and reports. Pure. */
export function buildInsights(args: {
  sum: PeriodSummary;
  prevSum: PeriodSummary | null;
  periodTxs: Tx[];
  prevTxs: Tx[];
  kind: PeriodKind;
  cats: CatIndex;
  owed: number;
  streak: number;
}): Insight[] {
  const { sum, prevSum, periodTxs, prevTxs, cats, owed, streak } = args;
  const noun = periodNoun(args.kind);
  const out: Insight[] = [];

  if (sum.runOutDay) {
    out.push({ tone: "warn", text: `At this pace your money runs out on ${dayLong(sum.runOutDay)}.` });
  }

  const totals = categoryTotals(periodTxs, cats, { excludeReserved: true });
  const total = totals.reduce((a, c) => a + c.total, 0);
  if (totals[0] && total > 0) {
    const share = Math.round((totals[0].total / total) * 100);
    out.push({ tone: "info", text: `${totals[0].category?.name ?? "Uncategorised"} is ${share}% of your spending this ${noun}.` });
  }

  if (prevSum && prevTxs.length) {
    const prevTotals = new Map(categoryTotals(prevTxs, cats, { excludeReserved: true }).map((c) => [c.categoryId, c.total]));
    let biggest: { name: string; diff: number } | null = null;
    for (const c of totals) {
      const diff = c.total - (prevTotals.get(c.categoryId) ?? 0);
      if (diff > 0 && (!biggest || diff > biggest.diff)) biggest = { name: c.category?.name ?? "Other", diff };
    }
    if (biggest && prevSum.spent > 0 && biggest.diff >= prevSum.spent * 0.05) {
      out.push({ tone: "warn", text: `${money(biggest.diff)} more on ${biggest.name} than last ${noun}.` });
    }
    if (prevSum.spent > 0 && sum.pace !== "none") {
      const pct = Math.round(((prevSum.spent - sum.spent) / prevSum.spent) * 100);
      if (sum.daysLeft <= 1 && pct > 5) out.push({ tone: "good", text: `You spent ${pct}% less than last ${noun}.` });
    }
  }

  if (sum.wantSpent > 0) {
    out.push({
      tone: sum.wantSpent > sum.periodBudget * 0.2 ? "warn" : "info",
      text: `${money(sum.wantSpent)} of this ${noun} went on wants.`,
    });
  }

  if (sum.otherIncome > 0) out.push({ tone: "good", text: `${money(sum.otherIncome)} extra came in this ${noun}, on top of your budget.` });
  if (owed > 0) out.push({ tone: "warn", text: `You still owe ${money(owed)} in total. Clear it before new goals.` });
  if (streak >= 3) out.push({ tone: "good", text: `${streak}-day logging streak. Keep it going.` });

  return out;
}
