"use client";

import Link from "next/link";
import type { Tx } from "@/lib/types";
import { useAppData } from "@/lib/local/app-data";
import { prettyDay } from "@/lib/budget/week";
import { txDirection, txTitle } from "@/lib/labels";
import { money } from "@/lib/money";
import { TxBadge } from "./icons";
import { cx } from "./ui";

export function TxRow({ tx, showDay }: { tx: Tx & { dirty?: 0 | 1 }; showDay?: boolean }) {
  const d = useAppData();
  const cat = tx.categoryId ? d.cats.get(tx.categoryId) : undefined;
  const dir = txDirection(tx);
  const wallet = d.wallets.find((w) => w.id === tx.walletId);
  const inWallet = tx.type !== "transfer" && tx.type !== "saving" && tx.type !== "saving_withdraw"; // jars don't move wallet money
  const sub = [
    showDay ? prettyDay(tx.day, d.today) : null,
    tx.note,
    tx.type === "expense" && tx.needWant === "want" ? "Want" : null,
    tx.isOneOff ? "One-off" : null,
    tx.reserveId ? d.allReserves.find((r) => r.id === tx.reserveId)?.name ?? "Reserve" : null,
    d.wallets.length > 1 && wallet && inWallet ? wallet.name : null,
  ]
    .filter((x, i, all) => x && all.indexOf(x) === i)
    .join(" · ");
  return (
    <Link href={`/add?id=${tx.id}`} className="flex items-center gap-3 rounded-2xl px-1 py-2.5 transition active:bg-surface-2">
      <TxBadge tx={tx} category={cat} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{txTitle(tx, d)}</p>
        {sub && <p className="truncate text-sm text-muted">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">
        {tx.dirty ? <span className="h-1.5 w-1.5 rounded-full bg-gold" title="Waiting to sync" /> : null}
        <span className={cx("tnum font-semibold", dir > 0 && "text-good", dir === 0 && "text-muted")}>
          {dir > 0 ? "+" : dir < 0 ? "−" : ""}
          {money(tx.amount)}
        </span>
      </div>
    </Link>
  );
}
