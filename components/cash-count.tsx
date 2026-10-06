"use client";

import { useState } from "react";
import { useAppData } from "@/lib/local/app-data";
import { addTx, recordCashCount } from "@/lib/local/ops";
import { cleanAmountInput, parseAmount, money } from "@/lib/money";
import { Button, Sheet, inputClass, toast, cx } from "./ui";

/** Count real money per wallet; the gap against the ledger becomes an "Unaccounted" or "Found" entry. */
export function CashCountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useAppData();
  const [walletId, setWalletId] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const wallet = d.wallets.find((w) => w.id === (walletId ?? d.wallets.find((x) => x.isDefault)?.id ?? d.wallets[0]?.id));
  if (!wallet) return null;
  const expected = d.walletBal.get(wallet.id) ?? 0;
  const counted = value === "" ? null : parseAmount(value) || (Number(value) === 0 ? 0 : null);
  const diff = counted === null ? null : counted - expected;

  const unaccounted = d.categories.find((c) => c.key === "unaccounted");
  const found = d.categories.find((c) => c.key === "found");

  async function finish(logGap: boolean) {
    if (counted === null || diff === null) return;
    await recordCashCount(wallet!.id, counted, expected);
    if (logGap && diff !== 0) {
      if (diff < 0) {
        await addTx({ type: "expense", amount: -diff, categoryId: unaccounted?.id, walletId: wallet!.id, note: "Gap from cash count" });
      } else {
        await addTx({ type: "income", amount: diff, categoryId: found?.id, walletId: wallet!.id, note: "Found in cash count" });
      }
    }
    toast(diff === 0 ? "Perfect match. Everything is tracked." : logGap ? "Gap logged. Ledger now matches." : "Count saved.");
    setValue("");
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Count your money">
      <div className="space-y-4">
        {d.wallets.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {d.wallets.map((w) => (
              <button
                key={w.id}
                onClick={() => setWalletId(w.id)}
                className={cx(
                  "h-10 shrink-0 rounded-2xl border px-4 text-sm font-semibold",
                  w.id === wallet.id ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-2",
                )}
              >
                {w.name}
              </button>
            ))}
          </div>
        )}
        <div className="rounded-2xl bg-surface-2 p-4">
          <p className="text-sm text-muted">Kharcha expects in {wallet.name}</p>
          <p className="font-display text-3xl font-bold tnum">{money(expected)}</p>
        </div>
        <label className="block">
          <span className="eyebrow text-muted">What you actually have</span>
          <input
            id="cash-counted"
            inputMode="decimal"
            autoFocus
            placeholder="0"
            value={value}
            onChange={(e) => setValue(cleanAmountInput(e.target.value))}
            className={cx(inputClass, "mt-1.5 text-2xl font-semibold tnum")}
          />
        </label>
        {diff !== null && (
          <div
            className={cx(
              "rounded-2xl p-4 text-sm",
              diff === 0 ? "bg-accent-soft text-accent" : diff < 0 ? "bg-danger-soft text-danger" : "bg-gold-soft text-gold",
            )}
          >
            {diff === 0 && <p className="font-semibold">Everything is tracked.</p>}
            {diff < 0 && (
              <p>
                <b>{money(-diff)} untracked.</b> You spent it somewhere and didn't log it. Log it as Unaccounted so reports stay honest, or add
                the real entries instead.
              </p>
            )}
            {diff > 0 && (
              <p>
                <b>{money(diff)} more than expected.</b> Maybe an income you didn't log. Log it as Found / extra?
              </p>
            )}
          </div>
        )}
        <div className="flex gap-2">
          {diff !== null && diff !== 0 ? (
            <>
              <Button variant="outline" className="flex-1" onClick={() => finish(false)}>
                Just save count
              </Button>
              <Button className="flex-1" onClick={() => finish(true)}>
                Log the gap
              </Button>
            </>
          ) : (
            <Button className="w-full" disabled={diff === null} onClick={() => finish(false)}>
              Save count
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
