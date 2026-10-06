"use client";

import { useState } from "react";
import { useAppData } from "@/lib/local/app-data";
import { patch, saveSchedule, updateSettings, upsertReserve } from "@/lib/local/ops";
import { DEFAULT_SCHEDULE } from "@/lib/budget/period";
import { localDay } from "@/lib/budget/week";
import { CURRENCIES, guessCurrency, parseAmount } from "@/lib/money";
import { AmountInput } from "./amount-input";
import { Logo } from "./logo";
import { ScheduleFields, type ScheduleDraft } from "./schedule-form";
import { Button, Card, Field, inputClass, toast } from "./ui";

/** First-run setup: the few choices the budget math needs. Everything here can be changed later in Settings. */
export function Onboarding() {
  const d = useAppData();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [currency, setCurrency] = useState(() => guessCurrency(timezone, navigator.languages ?? [navigator.language]));
  const [amount, setAmount] = useState("");
  const [schedule, setSchedule] = useState<ScheduleDraft>({ period: "weekly", startDow: 0, startDom: 1, offDays: DEFAULT_SCHEDULE.offDays });
  const [reserveName, setReserveName] = useState("");
  const [reserveAmount, setReserveAmount] = useState("");
  const [saveAmount, setSaveAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const budget = parseAmount(amount, currency);
  const reserve = parseAmount(reserveAmount, currency);
  const saving = parseAmount(saveAmount, currency);
  const firstName = d.user?.name?.split(" ")[0];

  async function start() {
    setBusy(true);
    try {
      const bufferTarget = Math.round(budget / 2);
      await updateSettings({ currency, budgetAmount: budget, timezone, bufferTarget, onboarded: true });
      await saveSchedule({ from: localDay(new Date(), timezone), ...schedule });
      if (reserve > 0) await upsertReserve({ name: reserveName.trim() || "Set aside", amount: reserve, kind: "spend" });
      if (saving > 0) await upsertReserve({ name: "Saving", amount: saving, kind: "save" });
      const buffer = d.goals.find((g) => g.kind === "buffer");
      if (buffer) await patch("goals", buffer.id, { target: bufferTarget });
      toast("All set. Log your budget to begin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-10 pt-[max(env(safe-area-inset-top),24px)]">
      <header className="space-y-3">
        <Logo className="h-11 w-11" />
        <h1 className="font-display text-[1.9rem] font-bold leading-tight tracking-tight">{firstName ? `Welcome, ${firstName}` : "Welcome"}</h1>
        <p className="text-ink-2">Tell Kharcha how your money comes in. It works out what is safe to spend each day.</p>
      </header>

      <Card className="space-y-4">
        <Field label="Currency">
          <select id="setup-currency" className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Usual budget" hint="What you normally get each time. You can enter a different amount whenever it changes.">
          <AmountInput id="setup-amount" value={amount} onChange={setAmount} currency={currency} size="lg" />
        </Field>
      </Card>

      <Card>
        <ScheduleFields value={schedule} onChange={setSchedule} />
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="font-semibold">Set aside each time (optional)</p>
          <p className="text-sm text-muted">Money you don&apos;t want to touch, like the fare home, and an amount to save. Both stay out of your daily budget. You can add more later.</p>
        </div>
        <Field label="Something to pay">
          <input id="setup-reserve-name" className={inputClass} value={reserveName} maxLength={40} placeholder="e.g. Fare home" onChange={(e) => setReserveName(e.target.value)} />
        </Field>
        <Field label="Its amount">
          <AmountInput id="setup-reserve-amount" value={reserveAmount} onChange={setReserveAmount} currency={currency} />
        </Field>
        <Field label="Amount to save">
          <AmountInput id="setup-save-amount" value={saveAmount} onChange={setSaveAmount} currency={currency} />
        </Field>
      </Card>

      <Button size="lg" className="w-full" disabled={!budget || busy} onClick={start}>
        Start
      </Button>
    </main>
  );
}
