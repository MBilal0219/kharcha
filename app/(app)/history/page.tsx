"use client";

import { useMemo, useState } from "react";
import { Search, Receipt } from "lucide-react";
import { useAppData } from "@/lib/local/app-data";
import { prettyDay } from "@/lib/budget/week";
import { txTitle } from "@/lib/labels";
import { money, num } from "@/lib/money";
import type { Tx } from "@/lib/types";
import { TxRow } from "@/components/tx-row";
import { Card, Chip, Empty, inputClass, cx } from "@/components/ui";

type Filter = "all" | "expense" | "income" | "loans" | "savings" | "want";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "expense", label: "Spent" },
  { value: "income", label: "Money in" },
  { value: "loans", label: "Loans" },
  { value: "savings", label: "Savings" },
  { value: "want", label: "Wants" },
];

function matches(t: Tx, f: Filter) {
  switch (f) {
    case "all":
      return true;
    case "expense":
      return t.type === "expense";
    case "income":
      return t.type === "income";
    case "loans":
      return t.type.startsWith("loan_") || Boolean(t.loanId);
    case "savings":
      return t.type === "saving" || t.type === "saving_withdraw";
    case "want":
      return t.type === "expense" && t.needWant === "want";
  }
}

export default function HistoryPage() {
  const d = useAppData();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [limit, setLimit] = useState(120);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return d.txs.filter((t) => {
      if (!matches(t, filter)) return false;
      if (categoryId && t.categoryId !== categoryId) return false;
      if (!needle) return true;
      return `${txTitle(t, d)} ${t.note ?? ""} ${num(t.amount)} ${t.amount / 100}`.toLowerCase().includes(needle);
    });
  }, [d, filter, q, categoryId]);

  const groups = useMemo(() => {
    const out: { day: string; items: typeof list; spent: number }[] = [];
    for (const t of list.slice(0, limit)) {
      let g = out[out.length - 1];
      if (!g || g.day !== t.day) {
        g = { day: t.day, items: [], spent: 0 };
        out.push(g);
      }
      g.items.push(t);
      if (t.type === "expense") g.spent += t.amount;
    }
    return out;
  }, [list, limit]);

  const total = list.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);
  const expenseCats = d.categories.filter((c) => c.kind === "expense" && !c.archived);

  return (
    <div className="space-y-4 pt-[max(env(safe-area-inset-top),16px)]">
      <header className="pt-2">
        <h1 className="font-display text-[1.7rem] font-bold tracking-tight">History</h1>
        <p className="text-sm text-muted">
          {list.length} entries{total ? ` · ${money(total)} spent` : ""}
        </p>
      </header>

      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input id="history-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes, names, amounts" className={cx(inputClass, "pl-11")} />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {FILTERS.map((f) => (
          <Chip key={f.value} active={filter === f.value} onClick={() => { setFilter(f.value); setCategoryId(null); }}>
            {f.label}
          </Chip>
        ))}
      </div>
      {filter === "expense" && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
          {expenseCats.map((c) => (
            <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)} className="h-8 text-xs">
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <Empty icon={<Receipt size={20} />} title="Nothing here yet" text="Entries you add show up here, grouped by day. Tap one to edit or delete it." />
      ) : (
        groups.map((g) => (
          <section key={g.day}>
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <h2 className="font-display font-semibold">{prettyDay(g.day, d.today)}</h2>
              {g.spent > 0 && <span className="tnum text-sm text-muted">{money(g.spent)} spent</span>}
            </div>
            <Card className="divide-y divide-line py-1">
              {g.items.map((t) => (
                <TxRow key={t.id} tx={t} />
              ))}
            </Card>
          </section>
        ))
      )}

      {list.length > limit && (
        <button className="w-full py-3 font-semibold text-accent" onClick={() => setLimit((l) => l + 200)}>
          Show older entries
        </button>
      )}
    </div>
  );
}
