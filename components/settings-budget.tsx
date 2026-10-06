"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, X } from "lucide-react";
import { useAppData } from "@/lib/local/app-data";
import { endReserve, patch, saveSchedule, setDayOverride, updateSettings, updateTx, upsertReserve } from "@/lib/local/ops";
import { PERIOD_LABEL, periodNoun, reserveAmountFor, type ScheduleLike } from "@/lib/budget/period";
import type { Reserve } from "@/lib/types";
import { DAY_ABBR, DAY_NAMES, addDay, prettyDay } from "@/lib/budget/week";
import { CURRENCIES, money, parseAmount, toInput } from "@/lib/money";
import { AmountInput } from "./amount-input";
import { DayPicker } from "./day-picker";
import { ScheduleFields, type ScheduleDraft } from "./schedule-form";
import { Button, Card, Field, Segmented, SectionTitle, Sheet, inputClass, toast } from "./ui";

/** Money field with its own Save button, enabled once the amount is different. */
function SavedAmount({ id, label, hint, value, onSave }: { id: string; label: string; hint?: string; value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(value ? toInput(value) : "");
  useEffect(() => setV(value ? toInput(value) : ""), [value]);
  const next = parseAmount(v);
  return (
    <Field label={label} hint={hint}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (next !== value) onSave(next);
        }}
      >
        <div className="min-w-0 flex-1">
          <AmountInput id={id} value={v} onChange={setV} />
        </div>
        <Button type="submit" className="h-12 shrink-0" disabled={next === value}>
          Save
        </Button>
      </form>
    </Field>
  );
}

function describe(s: ScheduleLike) {
  const start = s.period === "monthly" ? `from day ${s.startDom}` : `from ${DAY_NAMES[s.startDow]}`;
  const off = s.offDays.length ? `off ${s.offDays.map((i) => DAY_ABBR[i]).join(", ")}` : "no days off";
  return `${PERIOD_LABEL[s.period]}, ${start} · ${off}`;
}

export function BudgetSettings() {
  const d = useAppData();
  const s = d.settings;
  const noun = periodNoun(d.period.kind);

  // The budget already logged this period. The daily figure is worked out from this entry, not from the setting.
  const budgetTxs = d.periodTxs.filter((t) => t.type === "income" && t.categoryId && d.cats.get(t.categoryId)?.key === "budget");
  const logged = budgetTxs.length === 1 ? budgetTxs[0] : null;

  async function applyToPeriod(n: number) {
    if (!logged) return;
    await updateTx(logged.id, { amount: n });
    toast(`This ${noun}'s budget is now ${money(n)}.`);
  }

  async function saveBudget(n: number) {
    await updateSettings({ budgetAmount: n });
    if (n > 0 && logged && logged.amount !== n) await applyToPeriod(n);
    else toast("Budget updated");
  }

  return (
    <section>
      <SectionTitle>Budget</SectionTitle>
      <Card className="space-y-4">
        <SavedAmount
          id="set-budget"
          label="Usual budget"
          hint={`What you normally get each ${noun}. Saving a new amount also updates this ${noun}'s budget if you already logged it.`}
          value={s.budgetAmount}
          onSave={saveBudget}
        />
        {logged && s.budgetAmount > 0 && logged.amount !== s.budgetAmount && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-gold-soft p-3 text-sm">
            <span className="min-w-0">
              This {noun} is still running on the <b className="tnum">{money(logged.amount)}</b> you logged.
            </span>
            <Button size="sm" className="shrink-0" onClick={() => applyToPeriod(s.budgetAmount)}>
              Make it {money(s.budgetAmount)}
            </Button>
          </div>
        )}
        {logged && (
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow text-muted">This {noun}&apos;s budget was logged on</span>
            <DayPicker
              id="set-budget-day"
              value={logged.day}
              today={d.today}
              min={d.period.start}
              onChange={(day) => day !== logged.day && updateTx(logged.id, { day }).then(() => toast(`Budget moved to ${prettyDay(day, d.today)}.`))}
            />
            <span className="text-xs text-muted">Reports and charts show it on this day.</span>
          </div>
        )}
        <Field label="Currency" hint="Changes the symbol only. Amounts already entered are not converted.">
          <select id="set-currency" className={inputClass} value={s.currency} onChange={(e) => updateSettings({ currency: e.target.value }).then(() => toast("Currency updated"))}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </Field>
      </Card>
    </section>
  );
}

export function ScheduleSettings() {
  const d = useAppData();
  const [draft, setDraft] = useState<(ScheduleDraft & { from: string }) | null>(null);
  const [day, setDay] = useState("");
  const [kind, setKind] = useState<"off" | "work">("off");
  const marks = [...d.overrides.entries()].filter(([x]) => x >= addDay(d.today, -7)).sort(([a], [b]) => (a < b ? -1 : 1));

  async function save() {
    if (!draft) return;
    await saveSchedule(draft);
    toast(draft.from <= d.today ? "Schedule updated." : `New schedule starts ${format(parseISO(draft.from), "d MMM")}.`);
    setDraft(null);
  }

  return (
    <section>
      <SectionTitle>Schedule & days off</SectionTitle>
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-sm font-semibold">{describe(d.schedule)}</p>
          <Button
            size="sm"
            variant="soft"
            onClick={() => setDraft({ from: d.today, period: d.schedule.period, startDow: d.schedule.startDow, startDom: d.schedule.startDom, offDays: d.schedule.offDays })}
          >
            Change
          </Button>
        </div>

        <div className="space-y-2 border-t border-line pt-4">
          <p className="eyebrow text-muted">One-off days</p>
          <p className="text-sm text-muted">A holiday or an extra working day, without changing your normal week.</p>
          {marks.map(([x, k]) => (
            <div key={x} className="flex items-center justify-between rounded-2xl bg-surface-2 py-1 pl-4 pr-1 text-sm">
              <span>
                <b>{format(parseISO(x), "EEE, d MMM")}</b> · {k === "off" ? "day off" : "working day"}
              </span>
              <button aria-label="Remove" onClick={() => setDayOverride(x, null)} className="grid h-9 w-9 place-items-center rounded-full text-muted">
                <X size={16} />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input id="mark-day" type="date" aria-label="Date" className={`${inputClass} h-11 min-w-0 flex-1`} value={day} onChange={(e) => setDay(e.target.value)} />
            <Segmented className="w-36 shrink-0" value={kind} onChange={setKind} options={[{ value: "off", label: "Off" }, { value: "work", label: "Work" }]} />
          </div>
          <Button variant="outline" className="w-full" disabled={!day} onClick={() => setDayOverride(day, kind).then(() => { setDay(""); toast("Day marked"); })}>
            Mark this day
          </Button>
        </div>
      </Card>

      <Sheet open={draft !== null} onClose={() => setDraft(null)} title="Change schedule">
        {draft && (
          <div className="space-y-4">
            <ScheduleFields value={draft} onChange={(v) => setDraft({ ...draft, ...v })} />
            <Field label="Applies from" hint="Earlier days keep the schedule they had, so past reports don't change.">
              <input id="sched-from" type="date" className={inputClass} value={draft.from} onChange={(e) => e.target.value && setDraft({ ...draft, from: e.target.value })} />
            </Field>
            <Button className="w-full" onClick={save}>
              Save schedule
            </Button>
          </div>
        )}
      </Sheet>
    </section>
  );
}

type ReserveDraft = { id?: string; name: string; amount: string; kind: Reserve["kind"]; once: boolean };

/** Money kept out of the daily budget: things to pay (fare home, a gift) and amounts to save. */
export function ReserveSettings() {
  const d = useAppData();
  const noun = periodNoun(d.period.kind);
  const [edit, setEdit] = useState<ReserveDraft | null>(null);

  async function save() {
    if (!edit) return;
    await upsertReserve({ id: edit.id, name: edit.name.trim(), amount: parseAmount(edit.amount), kind: edit.kind, onlyUntil: edit.once ? d.period.end : null });
    toast(edit.id ? "Updated" : "Set aside");
    setEdit(null);
  }

  return (
    <section id="set-aside" className="scroll-mt-4">
      <SectionTitle
        action={
          <Button size="sm" variant="ghost" onClick={() => setEdit({ name: "", amount: "", kind: "spend", once: false })}>
            <Plus size={16} /> Add
          </Button>
        }
      >
        Set aside
      </SectionTitle>
      <Card className="divide-y divide-line py-1">
        {d.reserves.length === 0 && (
          <p className="py-3 text-sm text-muted">
            Money to keep out of your daily budget: the fare home, rent, a gift this weekend, or an amount you want to save each {noun}.
          </p>
        )}
        {d.reserves.map((r) => {
          const amount = reserveAmountFor(r, d.period) ?? 0;
          return (
            <button
              key={r.id}
              onClick={() => setEdit({ id: r.id, name: r.name, amount: toInput(amount), kind: r.kind, once: Boolean(r.until) })}
              className="flex w-full items-center justify-between gap-3 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{r.name}</span>
                <span className="block text-sm text-muted">
                  {r.kind === "save" ? "To save" : "To pay"} · {r.until ? `this ${noun} only` : `every ${noun}`}
                </span>
              </span>
              <span className="tnum shrink-0 font-semibold">{money(amount)}</span>
            </button>
          );
        })}
      </Card>
      <Sheet open={edit !== null} onClose={() => setEdit(null)} title={edit?.id ? "Edit" : "Set money aside"}>
        {edit && (
          <div className="space-y-4">
            {!edit.id && (
              <Segmented
                value={edit.kind}
                onChange={(kind) => setEdit({ ...edit, kind })}
                options={[
                  { value: "spend", label: "Something to pay" },
                  { value: "save", label: "An amount to save" },
                ]}
              />
            )}
            <Field label="Name">
              <input
                id="reserve-name"
                className={inputClass}
                value={edit.name}
                maxLength={40}
                placeholder={edit.kind === "save" ? "e.g. Weekly saving" : "e.g. Fare home, Gift for the kids"}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label="Amount" hint={edit.id ? "A new amount applies from now on. Earlier periods keep the old one." : undefined}>
              <AmountInput id="reserve-amount" value={edit.amount} onChange={(amount) => setEdit({ ...edit, amount })} />
            </Field>
            {!edit.id && (
              <Field label="How often">
                <Segmented
                  value={edit.once ? "once" : "every"}
                  onChange={(v) => setEdit({ ...edit, once: v === "once" })}
                  options={[
                    { value: "every", label: `Every ${noun}` },
                    { value: "once", label: `Only this ${noun}` },
                  ]}
                />
              </Field>
            )}
            <Button className="w-full" disabled={!edit.name.trim() || !parseAmount(edit.amount)} onClick={save}>
              Save
            </Button>
            {edit.id && (
              <Button variant="danger" className="w-full" onClick={() => endReserve(edit.id!).then(() => { toast("Removed"); setEdit(null); })}>
                Stop setting this aside
              </Button>
            )}
          </div>
        )}
      </Sheet>
    </section>
  );
}

export function SavingSettings() {
  const d = useAppData();
  const buffer = d.goals.find((g) => g.kind === "buffer");
  return (
    <section>
      <SectionTitle>Saving</SectionTitle>
      <Card className="space-y-4">
        <SavedAmount
          id="set-buffer"
          label="Emergency buffer target"
          hint="Fill this first. It is what stops you borrowing."
          value={buffer?.target ?? d.settings.bufferTarget}
          onSave={async (n) => {
            await updateSettings({ bufferTarget: n });
            if (buffer) await patch("goals", buffer.id, { target: n });
            toast("Buffer target updated");
          }}
        />
        <Field label="Suggest saving from extra income" hint="Asked when you log money in that isn't your budget.">
          <Segmented
            value={String(d.settings.extraSavePercent)}
            onChange={(v) => updateSettings({ extraSavePercent: Number(v) })}
            options={["0", "25", "50", "75", "100"].map((p) => ({ value: p, label: p === "0" ? "Off" : `${p}%` }))}
          />
        </Field>
      </Card>
    </section>
  );
}
