"use client";

import { useEffect, useState } from "react";
import { useAppData } from "@/lib/local/app-data";
import { addTx, remove } from "@/lib/local/ops";
import { prettyDay } from "@/lib/budget/week";
import { money, parseAmount, toInput } from "@/lib/money";
import type { Category } from "@/lib/types";
import { AmountInput } from "./amount-input";
import { DayPicker } from "./day-picker";
import { Button, Sheet, inputClass, toast } from "./ui";

export interface QuickEntry {
  category: Category;
  amount?: number; // prefilled, still editable
  note?: string;
}

/** Tap a category, type the amount, save. Today by default; pick an earlier day to catch up on what you forgot. */
export function QuickEntrySheet({ entry, onClose }: { entry: QuickEntry | null; onClose: () => void }) {
  const { today } = useAppData();
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAmount(entry?.amount ? toInput(entry.amount) : "");
    setNote(entry?.note ?? "");
    setDay(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  const value = parseAmount(amount);
  const income = entry?.category.kind === "income";

  async function save() {
    if (!entry || !value || busy) return;
    setBusy(true);
    try {
      const tx = await addTx({ type: entry.category.kind, amount: value, categoryId: entry.category.id, day, note: note.trim() || undefined });
      toast(`${entry.category.name} · ${money(value)} ${income ? "added" : "spent"}${day === today ? "" : ` · ${prettyDay(day, today)}`}`, { label: "Undo", run: () => void remove("transactions", tx.id) });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={entry !== null} onClose={onClose} title={entry?.category.name ?? ""}>
      {entry && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <AmountInput id="quick-amount" value={amount} onChange={setAmount} size="xl" autoFocus />
          <input id="quick-note" className={inputClass} value={note} maxLength={120} placeholder="What was it for? (optional)" onChange={(e) => setNote(e.target.value)} />
          <DayPicker id="quick-day" value={day} onChange={setDay} today={today} />
          <Button type="submit" size="lg" className="w-full" disabled={!value || busy}>
            {income ? "Add money in" : "Save expense"}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
