import type { DayOverride, PeriodKind, Reserve, Schedule } from "@/lib/types";
import { addDay, dayIndex, daysBetween } from "./week";

// Budget periods and working days. Pure: callers pass every day in.
// The schedule is a list of rows, each applying from its `from` day until the next row starts.
// Nothing here looks at "today", so changing the schedule never changes how earlier days are read.

export type ScheduleLike = Pick<Schedule, "from" | "period" | "startDow" | "startDom" | "offDays">;

export const DEFAULT_SCHEDULE: ScheduleLike = { from: "1970-01-01", period: "weekly", startDow: 0, startDom: 1, offDays: [6] };

export interface Period {
  start: string;
  end: string;
  days: string[];
  kind: PeriodKind;
}

export function sortSchedules<T extends ScheduleLike>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

function indexAt(day: string, sorted: ScheduleLike[]): number {
  let i = 0;
  for (let k = 0; k < sorted.length; k++) if (sorted[k].from <= day) i = k;
  return i;
}

/** The schedule row in force on a day. Days before the first row use the first row. */
export function scheduleAt(day: string, sorted: ScheduleLike[]): ScheduleLike {
  return sorted.length ? sorted[indexAt(day, sorted)] : DEFAULT_SCHEDULE;
}

/** Same period layout? Off days can differ without starting a new period. */
function sameLayout(a: ScheduleLike, b: ScheduleLike) {
  if (a.period !== b.period) return false;
  return a.period === "monthly" ? a.startDom === b.startDom : a.startDow === b.startDow;
}

const rollBack = (day: string, dow: number) => addDay(day, -((dayIndex(day) - dow + 7) % 7));

function monthStart(day: string, dom: number): string {
  const d = Math.min(Math.max(dom, 1), 28);
  let [y, m] = day.split("-").map(Number);
  if (Number(day.slice(8)) < d) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function nextMonth(day: string): string {
  const [y, m] = day.split("-").map(Number);
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-${day.slice(8)}`;
}

/**
 * The budget period a day falls in. When the layout changes (weekly to monthly, or a new start day),
 * the old period ends the day before the change and a new one starts on the change date.
 */
export function periodOf(day: string, sorted: ScheduleLike[]): Period {
  const list = sorted.length ? sorted : [DEFAULT_SCHEDULE];
  const i = indexAt(day, list);
  const s = list[i];
  let a = i;
  while (a > 0 && sameLayout(list[a - 1], s)) a--;
  let b = i;
  while (b < list.length - 1 && sameLayout(list[b + 1], s)) b++;
  const layoutStart = a === 0 ? null : list[a].from;
  const layoutEnd = b === list.length - 1 ? null : addDay(list[b + 1].from, -1);

  let start: string;
  let end: string;
  if (s.period === "monthly") {
    start = monthStart(day, s.startDom);
    end = addDay(nextMonth(start), -1);
  } else {
    const len = s.period === "biweekly" ? 14 : 7;
    const anchor = rollBack(list[a].from, s.startDow);
    start = addDay(anchor, Math.floor(daysBetween(anchor, day) / len) * len);
    end = addDay(start, len - 1);
  }
  if (layoutStart && layoutStart > start) start = layoutStart;
  if (layoutEnd && layoutEnd < end) end = layoutEnd;

  const days: string[] = [];
  for (let d = start; d <= end; d = addDay(d, 1)) days.push(d);
  return { start, end, days, kind: s.period };
}

export type Overrides = Map<string, DayOverride["kind"]>;

/** A working day is one with planned spending: not an off day of the week, unless that single date says otherwise. */
export function isWorkDay(day: string, sorted: ScheduleLike[], overrides?: Overrides): boolean {
  const o = overrides?.get(day);
  if (o) return o === "work";
  return !scheduleAt(day, sorted).offDays.includes(dayIndex(day));
}

/** The reserve's amount for a period, or null if it didn't exist yet or was removed before the period ended. */
export function reserveAmountFor(r: Pick<Reserve, "amounts" | "until">, period: Pick<Period, "end">): number | null {
  if (r.until && r.until < period.end) return null;
  let amount: number | null = null;
  for (const a of [...r.amounts].sort((x, y) => (x.from < y.from ? -1 : 1))) if (a.from <= period.end) amount = a.amount;
  return amount;
}

export function periodNoun(kind: PeriodKind): string {
  return kind === "weekly" ? "week" : kind === "monthly" ? "month" : "period";
}

export const PERIOD_LABEL: Record<PeriodKind, string> = { weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly" };
