"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, CircleHelp, PiggyBank, Receipt } from "lucide-react";
import { useAppData } from "@/lib/local/app-data";
import { addTx, moveToGoal, remove, setPeriod } from "@/lib/local/ops";
import { periodNoun } from "@/lib/budget/period";
import { prettyDay } from "@/lib/budget/week";
import { defaultGoal } from "@/lib/goal";
import { money, parseAmount, toInput } from "@/lib/money";
import { AmountInput } from "./amount-input";
import { DayPicker } from "./day-picker";
import { CatIcon } from "./icons";
import { Button, Chip, Sheet, inputClass, toast } from "./ui";

type View = "menu" | "spent" | "save" | "lost";

/** "last week", or "earlier weeks" once more than the last period is waiting. */
function useLeftoverWords() {
  const d = useAppData();
  const noun = periodNoun(d.period.kind);
  return { noun, from: d.leftover.older ? `earlier ${noun}s` : `last ${noun}` };
}

/** Stays at the top of Home until the money left from ended periods is dealt with. */
export function LeftoverRibbon({ onOpen }: { onOpen: () => void }) {
  const d = useAppData();
  const { from } = useLeftoverWords();
  if (d.leftover.amount <= 0) return null;
  return (
    <button onClick={onOpen} className="anim-rise flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold-soft px-4 py-2 text-left">
      <span className="min-w-0 text-sm text-ink">
        <b className="tnum">{money(d.leftover.amount)}</b> left from {from}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-sm font-bold text-gold">
        Decide <ChevronRight size={16} />
      </span>
    </button>
  );
}

/**
 * What to do with money left from ended periods. Spending, saving and "don't know" are entries dated in the
 * last period, so they come out of that leftover and never out of the current budget; carrying it over adds it to this one.
 */
export function LeftoverSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useAppData();
  const { noun, from } = useLeftoverWords();
  const left = d.leftover.amount;
  const last = d.prevPeriod;
  const [view, setView] = useState<View>("menu");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(last.end);
  const [categoryId, setCategoryId] = useState<string>();
  const [goalId, setGoalId] = useState<string>();
  const [busy, setBusy] = useState(false);

  const expenseCats = d.categories.filter((c) => c.kind === "expense" && !c.archived && c.key !== "unaccounted");
  const unaccounted = d.categories.find((c) => c.key === "unaccounted");
  const goal = d.goals.find((g) => g.id === goalId) ?? defaultGoal(d.goals, d.goalBal);
  const value = parseAmount(amount);

  function show(next: View) {
    setAmount(toInput(left));
    setNote("");
    setDay(last.end);
    setView(next);
  }
  useEffect(() => {
    if (open) setView("menu");
  }, [open]);
  // Nothing left to decide (it was dealt with here, or on another device): close.
  useEffect(() => {
    if (open && left <= 0) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, left]);

  /** Back to the choices while some of it is still waiting. */
  function done(used: number) {
    if (used < left) setView("menu");
    else onClose();
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const spend = () =>
    run(async () => {
      const cat = d.cats.get(categoryId ?? "");
      if (!cat || !value) return;
      const tx = await addTx({ type: "expense", amount: value, categoryId: cat.id, day, note: note.trim() || undefined });
      toast(`${cat.name} · ${money(value)} spent · ${prettyDay(day, d.today)}`, { label: "Undo", run: () => void remove("transactions", tx.id) });
      done(value);
    });

  const save = () =>
    run(async () => {
      if (!goal || !value || value > left) return;
      const tx = await moveToGoal(goal.id, value, `Left from ${from}`, last.end);
      toast(`${money(value)} saved to ${goal.name}.`, { label: "Undo", run: () => void remove("transactions", tx.id) });
      done(value);
    });

  const carry = () =>
    run(async () => {
      await setPeriod(d.period.start, { sweptPrev: true, carryIn: left });
      toast(`${money(left)} carried into this ${noun}.`, { label: "Undo", run: () => void setPeriod(d.period.start, { sweptPrev: false, carryIn: 0 }) });
      onClose();
    });

  const lose = () =>
    run(async () => {
      if (!unaccounted) return;
      const tx = await addTx({ type: "expense", amount: left, categoryId: unaccounted.id, day: last.end, note: `Left from ${from}` });
      toast(`${money(left)} recorded as ${unaccounted.name}.`, { label: "Undo", run: () => void remove("transactions", tx.id) });
      onClose();
    });

  return (
    <Sheet open={open && left > 0} onClose={onClose} title={`${money(left)} left from ${from}`}>
      {view === "menu" && (
        <div className="space-y-2">
          <p className="pb-1 text-sm text-muted">It isn&apos;t in this {noun}&apos;s budget or in your savings yet. Where did it go?</p>
          <Choice icon={<Receipt size={19} />} title="I spent it" sub="Add it as an expense on the day you spent it." onClick={() => show("spent")} />
          {goal && <Choice icon={<PiggyBank size={19} />} title="Save it" sub="Move all or part of it to a savings goal." onClick={() => show("save")} />}
          <Choice icon={<ArrowRight size={19} />} title="Carry over" sub={`Add it to this ${noun}'s money. Pick this too if you spent it this ${noun}, then log that as usual.`} onClick={carry} />
          {unaccounted && <Choice icon={<CircleHelp size={19} />} title="Don't know where it went" sub={`Record it as ${unaccounted.name}.`} onClick={() => show("lost")} />}
        </div>
      )}

      {view === "spent" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void spend();
          }}
        >
          <Back onClick={() => setView("menu")} />
          <AmountInput id="left-amount" value={amount} onChange={setAmount} size="xl" autoFocus />
          <input id="left-note" className={inputClass} value={note} maxLength={120} placeholder="What was it for? (optional)" onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {expenseCats.map((c) => (
              <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                <CatIcon name={c.icon} size={16} /> {c.name}
              </Chip>
            ))}
          </div>
          <DayPicker id="left-day" value={day} onChange={setDay} today={d.today} min={last.start} max={last.end} />
          <Button type="submit" size="lg" className="w-full" disabled={!value || !categoryId || busy}>
            Save expense
          </Button>
        </form>
      )}

      {view === "save" && goal && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Back onClick={() => setView("menu")} />
          <AmountInput id="left-amount" value={amount} onChange={setAmount} size="xl" autoFocus />
          {value > left && <p className="text-sm text-danger">Only {money(left)} is left over.</p>}
          {d.goals.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {d.goals.map((g) => (
                <Chip key={g.id} active={goal.id === g.id} onClick={() => setGoalId(g.id)}>
                  {g.name} <span className="tnum text-muted">{money(d.goalBal.get(g.id) ?? 0)}</span>
                </Chip>
              ))}
            </div>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={!value || value > left || busy}>
            Save to {goal.name}
          </Button>
        </form>
      )}

      {view === "lost" && unaccounted && (
        <div className="space-y-3">
          <Back onClick={() => setView("menu")} />
          <p className="text-sm text-ink-2">
            <b className="tnum">{money(left)}</b> is recorded as spent under {unaccounted.name} on {prettyDay(last.end, d.today)}. It also comes off your account balance, so use this only if the money is gone.
          </p>
          <Button size="lg" className="w-full" disabled={busy} onClick={lose}>
            Record {money(left)} as {unaccounted.name}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function Choice({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition active:scale-[0.99]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold-soft text-gold">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{sub}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </button>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-1 flex h-11 items-center gap-1 text-sm font-semibold text-accent">
      <ChevronLeft size={17} /> Other choices
    </button>
  );
}
