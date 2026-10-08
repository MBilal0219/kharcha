import type { PeriodSetting, Reserve, Tx } from "@/lib/types";
import { summarizePeriod, type CatIndex } from "./calc";
import { periodOf, type Period, type ScheduleLike } from "./period";
import { addDay } from "./week";

// Money left when a period ended. It stays "left over" until the user deals with it: logs it as spent,
// saves it, records it as unaccounted (all three are entries dated in the last period), or carries it over.

/** How many ended periods are looked at. Leftover older than this is no longer asked about. */
export const LEFTOVER_PERIODS = 12;

/**
 * What is left from a run of ended periods, given what each one ended with (oldest first, negative when overspent).
 * A later overspent period uses up what an earlier one left; an old overspend is not held against later leftover.
 */
export function pendingLeftover(ends: number[]): number {
  return ends.reduce((left, end) => Math.max(left + end, 0), 0);
}

/**
 * Leftover from the periods before `period` that has not been dealt with. It goes back to the last period
 * whose settings say the earlier leftover was carried over (`sweptPrev`), or to the first entry.
 * `older` is true when some of it comes from before the last period.
 */
export function leftoverFrom(args: {
  txs: Tx[];
  cats: CatIndex;
  reserves: Reserve[];
  schedules: ScheduleLike[]; // oldest first
  settings: Map<string, Pick<PeriodSetting, "carryIn" | "reservesOff" | "sweptPrev">>; // by period start
  period: Period;
  today: string;
  isWork: (day: string) => boolean;
}): { amount: number; older: boolean } {
  const { txs, cats, reserves, schedules, settings, today, isWork } = args;
  const first = txs.reduce<string | null>((a, t) => (t.deletedAt || (a && a <= t.day) ? a : t.day), null);

  const ends: number[] = [];
  let p = args.period;
  while (first && ends.length < LEFTOVER_PERIODS && !settings.get(p.start)?.sweptPrev) {
    const prev = periodOf(addDay(p.start, -1), schedules);
    if (prev.end < first) break;
    const s = summarizePeriod({ txs, cats, period: prev, reserves, setting: settings.get(prev.start), today, isWork });
    // A reserve that was never paid is still in your pocket, so it counts as left.
    ends.unshift(s.spendable + s.reserveLocked);
    p = prev;
  }

  const amount = pendingLeftover(ends);
  return { amount, older: amount !== Math.max(ends.at(-1) ?? 0, 0) };
}
