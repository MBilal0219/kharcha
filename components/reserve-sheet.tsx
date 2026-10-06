"use client";

import Link from "next/link";
import { useAppData } from "@/lib/local/app-data";
import { moveToGoal, setPeriod } from "@/lib/local/ops";
import { periodNoun } from "@/lib/budget/period";
import type { ReserveState } from "@/lib/budget/calc";
import { defaultGoal } from "@/lib/goal";
import { money } from "@/lib/money";
import { Button, Sheet, Toggle, toast } from "./ui";

/** This period's set-aside money: what is held back, what is done, and a switch to release one for now. */
export function ReserveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useAppData();
  const noun = periodNoun(d.period.kind);
  const off = d.periodSettings.get(d.period.start)?.reservesOff ?? [];
  const goal = defaultGoal(d.goals, d.goalBal);

  async function setLocked(id: string, locked: boolean) {
    await setPeriod(d.period.start, { reservesOff: locked ? off.filter((x) => x !== id) : [...off, id] });
    toast(locked ? "Set aside again." : `Released for this ${noun}.`);
  }

  async function saveNow(r: ReserveState) {
    if (!goal) return;
    await moveToGoal(goal.id, r.amount, r.reserve.name, undefined, r.reserve.id);
    toast(`${money(r.amount)} saved to ${goal.name}.`);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Set aside">
      <div className="space-y-4">
        <p className="text-ink-2">Kept out of your daily budget until you pay or save it, so it is always covered.</p>
        {d.sum.reserves.length === 0 && <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">Nothing is set aside yet.</p>}
        {d.sum.reserves.map((r) => {
          const saving = r.reserve.kind === "save";
          return (
            <div key={r.reserve.id} className="rounded-2xl bg-surface-2 px-4 py-2">
              {r.spent > 0 ? (
                <div className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate font-semibold">{r.reserve.name}</span>
                  <span className="tnum shrink-0 text-sm text-accent">
                    {saving ? "Saved" : "Paid"} {money(r.spent)}
                  </span>
                </div>
              ) : (
                <>
                  <Toggle
                    checked={!r.off}
                    onChange={(v) => setLocked(r.reserve.id, v)}
                    label={`${r.reserve.name} · ${money(r.amount)}`}
                    sub={r.off ? `Free to spend this ${noun}` : saving ? "Held back to save" : "Held back to pay"}
                  />
                  {saving ? (
                    goal && (
                      <Button variant="outline" size="sm" className="mb-2 w-full bg-surface" onClick={() => saveNow(r)}>
                        Save it now
                      </Button>
                    )
                  ) : (
                    <Link href={`/add?type=expense&reserve=${r.reserve.id}`} className="mb-2 flex h-9 items-center justify-center rounded-2xl border border-line bg-surface text-sm font-semibold">
                      Pay it now
                    </Link>
                  )}
                </>
              )}
            </div>
          );
        })}
        <Link href="/settings#set-aside" className="flex h-11 items-center justify-center rounded-2xl bg-accent-soft font-semibold text-accent">
          Add or change in Settings
        </Link>
      </div>
    </Sheet>
  );
}
