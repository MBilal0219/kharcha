"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2, UserPlus, PiggyBank } from "lucide-react";
import { useAppData } from "@/lib/local/app-data";
import { addPerson, addTx, createLoan, moveToGoal, patch, remove, repayLoan, updateTx, withdrawFromGoal } from "@/lib/local/ops";
import { money, parseAmount, toInput } from "@/lib/money";
import type { NeedWant, Tx } from "@/lib/types";
import { defaultGoal } from "@/lib/goal";
import { txTitle } from "@/lib/labels";
import { AmountInput } from "./amount-input";
import { CategorySheet, newCategory, type CategoryDraft } from "./category-sheet";
import { DayPicker } from "./day-picker";
import { WalletSheet, type WalletDraft } from "./wallet-sheet";
import { CatIcon } from "./icons";
import { Button, Chip, Segmented, Sheet, inputClass, toast, cx } from "./ui";

type Mode = "expense" | "income" | "loan" | "save" | "move";
type LoanAction = "borrow" | "lend" | "repay" | "collect";

const MODES: { value: Mode; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Money in" },
  { value: "loan", label: "Loan" },
  { value: "save", label: "Save" },
  { value: "move", label: "Move" },
];

function modeOf(tx: Tx): Mode {
  if (tx.type === "expense" || tx.type === "income") return tx.type;
  if (tx.type === "saving" || tx.type === "saving_withdraw") return tx.loanId ? "loan" : "save";
  if (tx.type === "transfer") return "move";
  return "loan";
}

export function AddScreen() {
  const d = useAppData();
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");
  const editing = useMemo(() => (editId ? d.txs.find((t) => t.id === editId) : undefined), [editId, d.txs]);

  const initialMode = (params.get("type") as Mode) || "expense";
  const [mode, setMode] = useState<Mode>(MODES.some((m) => m.value === initialMode) ? initialMode : "expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [walletId, setWalletId] = useState<string | undefined>(d.wallets.find((w) => w.isDefault)?.id ?? d.wallets[0]?.id);
  const [toWalletId, setToWalletId] = useState<string | undefined>();
  const [day, setDay] = useState(d.today);
  const [note, setNote] = useState("");
  const [needWant, setNeedWant] = useState<NeedWant>("need");
  const [oneOff, setOneOff] = useState(false);
  const [loanAction, setLoanAction] = useState<LoanAction>("borrow");
  const [personId, setPersonId] = useState<string | null | undefined>();
  const [newPerson, setNewPerson] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loanId, setLoanId] = useState<string | undefined>();
  const [saveDir, setSaveDir] = useState<"in" | "out">("in");
  const [goalId, setGoalId] = useState<string | undefined>(defaultGoal(d.goals, d.goalBal)?.id);
  const [busy, setBusy] = useState(false);
  const [savePrompt, setSavePrompt] = useState<number | null>(null);
  const [reserveId, setReserveId] = useState<string | undefined>(() => (d.reserves.some((r) => r.id === params.get("reserve")) ? params.get("reserve")! : undefined));
  const payable = d.reserves.filter((r) => r.kind === "spend");
  // A saving counts towards the first saving target that isn't met yet this period.
  const target = day >= d.period.start && day <= d.period.end ? d.sum.reserves.find((r) => r.reserve.kind === "save" && r.spent === 0 && !r.off) : undefined;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newCat, setNewCat] = useState<CategoryDraft | null>(null);
  const [newWallet, setNewWallet] = useState<WalletDraft | null>(null);

  // Prefill from ?cat=<key> or from the entry being edited.
  useEffect(() => {
    if (editing) {
      setMode(modeOf(editing));
      setAmount(toInput(editing.amount));
      setCategoryId(editing.categoryId);
      setWalletId(editing.walletId);
      setToWalletId(editing.toWalletId);
      setDay(editing.day);
      setNote(editing.note ?? "");
      setNeedWant(editing.needWant);
      setOneOff(editing.isOneOff);
      setGoalId(editing.goalId);
      setReserveId(editing.reserveId);
      return;
    }
    const key = params.get("cat");
    if (key) setCategoryId(d.categories.find((c) => c.key === key)?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  const value = parseAmount(amount);
  const cats = d.categories.filter((c) => !c.archived && c.kind === (mode === "income" ? "income" : "expense"));
  const tpls = d.templates.filter((t) => t.type === (mode === "income" ? "income" : "expense"));
  const openLoans = d.loanStates.filter(
    (s) => s.loan.status === "open" && s.outstanding > 0 && s.loan.direction === (loanAction === "repay" ? "borrowed" : "lent"),
  );

  const canSave = (() => {
    if (value <= 0 || busy) return false;
    if (editing) return true;
    if (mode === "expense" || mode === "income") return Boolean(categoryId);
    if (mode === "move") return Boolean(walletId && toWalletId && walletId !== toWalletId);
    if (mode === "save") return Boolean(goalId) && (saveDir === "in" || value <= (d.goalBal.get(goalId!) ?? 0));
    if (mode === "loan") {
      if (loanAction === "borrow" || loanAction === "lend") return personId !== undefined || newPerson.trim().length > 0;
      return Boolean(loanId);
    }
    return false;
  })();

  const label = (() => {
    if (editing) return "Save changes";
    if (mode === "expense") return `Add ${value ? money(value) : ""} expense`;
    if (mode === "income") return `Add ${value ? money(value) : ""} money in`;
    if (mode === "move") return "Move money";
    if (mode === "save") return saveDir === "in" ? "Save it" : "Take it out";
    return { borrow: "Record loan", lend: "Record lending", repay: "Record payment", collect: "Record payment" }[loanAction];
  })();

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    try {
      if (editing) {
        await updateTx(editing.id, { amount: value, categoryId, walletId, toWalletId, day, note: note.trim() || undefined, needWant, isOneOff: oneOff, reserveId: editing.type === "expense" ? reserveId : undefined });
        // Keep a loan's principal in step with its opening entry.
        if (editing.loanId && (editing.type === "loan_taken" || editing.type === "loan_given" || (editing.type === "saving_withdraw" && editing.loanId))) {
          await patch("loans", editing.loanId, { principal: value });
        }
        toast("Updated");
        router.back();
        return;
      }
      let undoId: string | undefined;
      if (mode === "expense" || mode === "income") {
        const tx = await addTx({ type: mode, amount: value, categoryId, walletId, day, note: note.trim() || undefined, needWant: mode === "expense" ? needWant : "need", isOneOff: oneOff, reserveId: mode === "expense" ? reserveId : undefined });
        undoId = tx.id;
        // Extra money (anything but the budget itself) is the easiest money to save.
        if (mode === "income" && d.cats.get(categoryId!)?.key !== "budget" && d.settings.extraSavePercent > 0 && d.goals.length) {
          setSavePrompt(value);
          setBusy(false);
          return;
        }
      } else if (mode === "move") {
        undoId = (await addTx({ type: "transfer", amount: value, walletId, toWalletId, day, note: note.trim() || undefined })).id;
      } else if (mode === "save") {
        undoId = (saveDir === "in" ? await moveToGoal(goalId!, value, note.trim() || undefined, day, target?.reserve.id) : await withdrawFromGoal(goalId!, value, note.trim() || undefined)).id;
      } else if (mode === "loan") {
        if (loanAction === "borrow" || loanAction === "lend") {
          let pid = personId ?? null;
          if (personId === undefined && newPerson.trim()) pid = (await addPerson(newPerson)).id;
          const fromSavings = loanAction === "borrow" && personId === null;
          await createLoan({
            direction: loanAction === "borrow" ? "borrowed" : "lent",
            amount: value,
            personId: fromSavings ? null : pid,
            goalId: fromSavings ? goalId ?? null : null,
            dueDate: dueDate || null,
            walletId,
            note: note.trim() || undefined,
            day,
          });
        } else {
          const st = d.loanStates.find((s) => s.loan.id === loanId);
          if (st) await repayLoan(st, value, walletId);
        }
      }
      toast("Added", undoId ? { label: "Undo", run: () => void remove("transactions", undoId!) } : undefined);
      router.push("/");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!editing) return;
    await remove("transactions", editing.id);
    if (editing.loanId && (editing.type === "loan_taken" || editing.type === "loan_given")) await remove("loans", editing.loanId);
    toast("Deleted", { label: "Undo", run: () => void patch("transactions", editing.id, { deletedAt: null }) });
    router.back();
  }

  return (
    <div className="flex min-h-dvh flex-col pt-[max(env(safe-area-inset-top),12px)]">
      <header className="flex items-center gap-2 py-2">
        <button onClick={() => router.back()} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full bg-surface shadow-card">
          <ArrowLeft size={19} />
        </button>
        <h1 className="flex-1 font-display text-xl font-semibold tracking-tight">{editing ? txTitle(editing, d) : "New entry"}</h1>
        {editing && (
          <button onClick={() => setConfirmDelete(true)} aria-label="Delete entry" className="grid h-10 w-10 place-items-center rounded-full bg-danger-soft text-danger">
            <Trash2 size={18} />
          </button>
        )}
      </header>

      {!editing && <Segmented className="mt-1" value={mode} onChange={(m) => { setMode(m); setCategoryId(undefined); }} options={MODES} />}

      <div className="py-4">
        <AmountInput id="entry-amount" value={amount} onChange={setAmount} size="xl" autoFocus={!editId} />
      </div>

      <div className="flex-1 space-y-4 pb-4">
        {(mode === "expense" || mode === "income") && !editing && tpls.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
            {tpls.map((t) => (
              <Chip
                key={t.id}
                onClick={() => {
                  setAmount(toInput(t.amount));
                  setCategoryId(t.categoryId);
                  setNeedWant(t.needWant);
                  if (t.walletId) setWalletId(t.walletId);
                  setNote(t.label);
                }}
              >
                {t.label} <span className="tnum text-muted">{money(t.amount)}</span>
              </Chip>
            ))}
          </div>
        )}

        {(mode === "expense" || mode === "income") && (
          <div className="grid grid-cols-4 gap-2">
            {cats.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                aria-pressed={categoryId === c.id}
                className={cx(
                  "flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 text-center transition active:scale-[0.97]",
                  categoryId === c.id ? "border-accent bg-accent-soft text-accent" : "border-transparent bg-surface text-ink-2",
                )}
              >
                <CatIcon name={c.icon} size={20} />
                <span className="line-clamp-2 text-[0.72rem] font-semibold leading-tight">{c.name}</span>
              </button>
            ))}
            <button
              onClick={() => setNewCat(newCategory(mode === "income" ? "income" : "expense"))}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-line px-1 py-2.5 text-center text-accent transition active:scale-[0.97]"
            >
              <Plus size={20} />
              <span className="text-[0.72rem] font-semibold leading-tight">New</span>
            </button>
          </div>
        )}

        {mode === "expense" && (
          <div className="flex gap-2">
            <Segmented
              className="flex-1"
              value={needWant}
              onChange={setNeedWant}
              options={[
                { value: "need", label: "Need" },
                { value: "want", label: "Want" },
              ]}
            />
            <Chip active={oneOff} onClick={() => setOneOff(!oneOff)}>
              One-off
            </Chip>
          </div>
        )}

        {mode === "expense" && payable.length > 0 && (
          <div className="space-y-1.5">
            <p className="eyebrow text-muted">Paid from</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <Chip active={!reserveId} onClick={() => setReserveId(undefined)}>
                My budget
              </Chip>
              {payable.map((r) => (
                <Chip key={r.id} active={reserveId === r.id} onClick={() => setReserveId(r.id)}>
                  {r.name}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {mode === "loan" && !editing && (
          <div className="space-y-3">
            <Segmented
              value={loanAction}
              onChange={(v) => { setLoanAction(v); setLoanId(undefined); setPersonId(undefined); }}
              options={[
                { value: "borrow", label: "Borrow" },
                { value: "lend", label: "Lend" },
                { value: "repay", label: "Pay back" },
                { value: "collect", label: "Collect" },
              ]}
            />
            {(loanAction === "borrow" || loanAction === "lend") && (
              <>
                <div className="flex flex-wrap gap-2">
                  {loanAction === "borrow" && d.goals.length > 0 && (
                    <Chip active={personId === null} onClick={() => { setPersonId(null); setNewPerson(""); }}>
                      <PiggyBank size={16} /> My savings
                    </Chip>
                  )}
                  {d.people.map((p) => (
                    <Chip key={p.id} active={personId === p.id} onClick={() => { setPersonId(p.id); setNewPerson(""); }}>
                      {p.name}
                    </Chip>
                  ))}
                </div>
                {personId === null ? (
                  <p className="rounded-2xl bg-gold-soft p-3 text-sm text-ink-2">
                    It comes out of <b>{d.goals.find((g) => g.id === goalId)?.name ?? "savings"}</b> and you pay it back
                    later.
                  </p>
                ) : (
                  <div className="relative">
                    <UserPlus size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      id="loan-new-person"
                      value={newPerson}
                      onChange={(e) => { setNewPerson(e.target.value); setPersonId(undefined); }}
                      placeholder={d.people.length ? "Or a new name…" : "Their name"}
                      className={cx(inputClass, "pl-11")}
                    />
                  </div>
                )}
                <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2.5">
                  <span className="text-sm font-semibold text-ink-2">{loanAction === "borrow" ? "Pay back by" : "Due back by"} (optional)</span>
                  <input id="loan-due" type="date" value={dueDate} min={d.today} onChange={(e) => setDueDate(e.target.value)} className="bg-transparent text-sm font-semibold text-ink outline-none" />
                </label>
              </>
            )}
            {(loanAction === "repay" || loanAction === "collect") &&
              (openLoans.length ? (
                <div className="space-y-2">
                  {openLoans.map((s) => (
                    <button
                      key={s.loan.id}
                      onClick={() => { setLoanId(s.loan.id); if (!amount) setAmount(toInput(s.outstanding)); }}
                      className={cx(
                        "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left",
                        loanId === s.loan.id ? "border-accent bg-accent-soft" : "border-line bg-surface",
                      )}
                    >
                      <span className="font-semibold">{s.loan.personId ? d.peopleById.get(s.loan.personId)?.name : "My savings"}</span>
                      <span className="tnum text-sm text-muted">{money(s.outstanding)} left</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl bg-surface p-4 text-sm text-muted">{loanAction === "repay" ? "You don't owe anyone. Nice." : "Nobody owes you right now."}</p>
              ))}
          </div>
        )}

        {mode === "save" && !editing && (
          <div className="space-y-3">
            <Segmented value={saveDir} onChange={setSaveDir} options={[{ value: "in", label: "Put in" }, { value: "out", label: "Take out" }]} />
            <div className="flex flex-wrap gap-2">
              {d.goals.map((g) => (
                <Chip key={g.id} active={goalId === g.id} onClick={() => setGoalId(g.id)}>
                  {g.name} <span className="tnum text-muted">{money(d.goalBal.get(g.id) ?? 0)}</span>
                </Chip>
              ))}
            </div>
            {saveDir === "in" && target && (
              <p className="rounded-2xl bg-accent-soft p-3 text-sm text-accent">
                Counts towards <b>{target.reserve.name}</b> ({money(target.amount)} set aside this period).
              </p>
            )}
            {saveDir === "out" && goalId && value > (d.goalBal.get(goalId) ?? 0) && (
              <p className="text-sm text-danger">Only {money(d.goalBal.get(goalId) ?? 0)} in this goal.</p>
            )}
          </div>
        )}

        {mode === "move" && (
          <div className="space-y-2">
            <p className="eyebrow text-muted">From</p>
            <div className="flex flex-wrap gap-2">
              {d.wallets.map((w) => (
                <Chip key={w.id} active={walletId === w.id} onClick={() => setWalletId(w.id)}>
                  {w.name} <span className="tnum text-muted">{money(d.walletBal.get(w.id) ?? 0)}</span>
                </Chip>
              ))}
            </div>
            <p className="eyebrow pt-1 text-muted">To</p>
            <div className="flex flex-wrap gap-2">
              {d.wallets.filter((w) => w.id !== walletId).map((w) => (
                <Chip key={w.id} active={toWalletId === w.id} onClick={() => setToWalletId(w.id)}>
                  {w.name}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {mode !== "move" && mode !== "save" && !(mode === "loan" && personId === null) && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {d.wallets.map((w) => (
              <Chip key={w.id} active={walletId === w.id} onClick={() => setWalletId(w.id)}>
                {w.name}
              </Chip>
            ))}
            <Chip onClick={() => setNewWallet({ name: "" })} className="border-dashed text-accent">
              <Plus size={15} /> Account
            </Chip>
          </div>
        )}

        <DayPicker id="entry-day" value={day} onChange={setDay} today={d.today} />

        <input id="entry-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={120} className={inputClass} />
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur">
        <Button size="lg" className="w-full" disabled={!canSave} onClick={submit}>
          {label}
        </Button>
      </div>

      <Sheet open={savePrompt !== null} onClose={() => router.push("/")} title="Save some of it?">
        {savePrompt !== null && <SaveExtra amount={savePrompt} onDone={() => router.push("/")} />}
      </Sheet>

      <CategorySheet draft={newCat} onChange={setNewCat} onClose={() => setNewCat(null)} onSaved={(c) => setCategoryId(c.id)} />
      <WalletSheet draft={newWallet} onChange={setNewWallet} onClose={() => setNewWallet(null)} onSaved={(w) => setWalletId(w.id)} />

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this entry?">
        <p className="mb-4 text-ink-2">It disappears from your reports. You can undo right after.</p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
            Keep
          </Button>
          <Button variant="danger" className="flex-1" onClick={doDelete}>
            Delete
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function SaveExtra({ amount, onDone }: { amount: number; onDone: () => void }) {
  const d = useAppData();
  const goal = defaultGoal(d.goals, d.goalBal);
  const pct = d.settings.extraSavePercent;
  const options = [...new Set([pct, 50, 100])].filter((p) => p > 0).sort((a, b) => a - b);
  if (!goal) return null;
  return (
    <div className="space-y-4">
      <p className="text-ink-2">
        This is on top of your budget. Saving part of it is the fastest way to build your <b>{goal.name}</b>.
      </p>
      <div className="grid gap-2">
        {options.map((p) => {
          const amt = Math.round((amount * p) / 100);
          return (
            <Button
              key={p}
              variant={p === pct ? "primary" : "outline"}
              onClick={() => moveToGoal(goal.id, amt, "From extra income").then(() => { toast(`${money(amt)} saved to ${goal.name}.`); onDone(); })}
            >
              Save {p}% · {money(amt)}
            </Button>
          );
        })}
        <Button variant="ghost" onClick={onDone}>
          Not this time
        </Button>
      </div>
    </div>
  );
}
