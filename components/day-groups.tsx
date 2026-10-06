"use client";

import { format, parseISO } from "date-fns";
import { useAppData } from "@/lib/local/app-data";
import { money } from "@/lib/money";
import type { Tx } from "@/lib/types";
import { TxRow } from "./tx-row";
import { cx } from "./ui";

/**
 * Entries grouped by day, newest first: the day and date, that day's totals, then its entries.
 * Each day's heading stays at the top while its entries scroll, until the next day pushes it away.
 * `within` says what scrolls: the page (below the screen's own header) or a bottom sheet.
 */
export function DayGroups({ txs, within }: { txs: (Tx & { dirty?: 0 | 1 })[]; within: "page" | "sheet" }) {
  const { today } = useAppData();
  const groups: { day: string; items: typeof txs; spent: number; cameIn: number }[] = [];
  for (const t of txs) {
    let g = groups[groups.length - 1];
    if (!g || g.day !== t.day) {
      g = { day: t.day, items: [], spent: 0, cameIn: 0 };
      groups.push(g);
    }
    g.items.push(t);
    if (t.type === "expense") g.spent += t.amount;
    if (t.type === "income") g.cameIn += t.amount;
  }

  const name = (day: string) => {
    const diff = Math.round((parseISO(today).getTime() - parseISO(day).getTime()) / 86_400_000);
    return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : format(parseISO(day), "EEEE");
  };

  return (
    <div className={within === "page" ? "space-y-3" : "space-y-2"}>
      {groups.map((g) => (
        <section key={g.day}>
          <div
            className={cx(
              "sticky z-20 -mx-4 flex items-baseline justify-between gap-3 px-5 py-2",
              within === "page" ? "glass top-[var(--header-h)]" : "glass-surface top-0",
            )}
          >
            <h2 className="min-w-0 truncate font-display font-semibold">
              {name(g.day)} <span className="text-sm font-normal text-muted">· {format(parseISO(g.day), "d MMM")}</span>
            </h2>
            <p className="tnum shrink-0 text-sm">
              {g.cameIn > 0 && <span className="font-semibold text-good">+{money(g.cameIn)}</span>}
              {g.cameIn > 0 && g.spent > 0 && <span className="text-muted"> · </span>}
              {g.spent > 0 && <span className="text-ink-2">{money(g.spent)} spent</span>}
            </p>
          </div>
          <div className={cx("divide-y divide-line", within === "page" && "mt-2 rounded-3xl bg-surface px-4 py-1 shadow-card")}>
            {g.items.map((t) => (
              <TxRow key={t.id} tx={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
