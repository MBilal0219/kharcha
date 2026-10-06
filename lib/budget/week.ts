import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

// All "which day / which week" decisions go through this file.
// Days are plain yyyy-MM-dd strings in the user's timezone. Budget periods are in period.ts.

export const DEFAULT_TZ = "UTC";

export function localDay(at: Date | string, tz = DEFAULT_TZ): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return formatInTimeZone(d, tz, "yyyy-MM-dd");
}

export function localHour(at: Date, tz = DEFAULT_TZ): number {
  return Number(formatInTimeZone(at, tz, "H"));
}

/** Day-of-week index with Monday = 0 … Sunday = 6. */
export function dayIndex(day: string): number {
  const js = parseISO(day).getDay(); // Sunday = 0
  return (js + 6) % 7;
}

export function addDay(day: string, n: number): string {
  return format(addDays(parseISO(day), n), "yyyy-MM-dd");
}

/** Monday of the calendar week. Used for week-by-week charts, not for budget periods. */
export function weekStartOf(day: string): string {
  return addDay(day, -dayIndex(day));
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDay(weekStart, i));
}

/** Convert a local day + time into a UTC ISO string (used for "Yesterday" entries etc). */
export function localDateTimeToISO(day: string, time: string, tz = DEFAULT_TZ): string {
  return fromZonedTime(`${day}T${time}`, tz).toISOString();
}

/** Current local time HH:mm:ss, used to stamp back-dated entries with a realistic time. */
export function localTime(at: Date, tz = DEFAULT_TZ): string {
  return formatInTimeZone(at, tz, "HH:mm:ss");
}

export function monthKey(day: string): string {
  return day.slice(0, 7);
}

export function monthDays(month: string): string[] {
  const first = `${month}-01`;
  const out: string[] = [];
  let d = first;
  while (d.slice(0, 7) === month) {
    out.push(d);
    d = addDay(d, 1);
  }
  return out;
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function dayShort(day: string): string {
  return DAY_SHORT[dayIndex(day)];
}
export function dayLong(day: string): string {
  return DAY_LONG[dayIndex(day)];
}

export function prettyDay(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDay(today, -1)) return "Yesterday";
  return format(parseISO(day), "EEE, d MMM");
}

export function prettyRange(start: string, end = addDay(start, 6)): string {
  const a = parseISO(start);
  const b = parseISO(end);
  const sameMonth = format(a, "MMM") === format(b, "MMM");
  return sameMonth ? `${format(a, "d")}–${format(b, "d MMM")}` : `${format(a, "d MMM")} – ${format(b, "d MMM")}`;
}

export function prettyMonth(month: string): string {
  return format(parseISO(`${month}-01`), "MMMM yyyy");
}

export function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

export const DAY_NAMES = DAY_LONG;
export const DAY_ABBR = DAY_SHORT;
