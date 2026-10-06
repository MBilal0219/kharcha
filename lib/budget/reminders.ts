// Which reminder of the day is due. Pure: the caller passes the user's current hour.

/** The user's reminder hours, earliest first, without repeats. */
export function reminderHours(first: number, second?: number | null): number[] {
  return [...new Set([first, second].filter((h): h is number => typeof h === "number"))].sort((a, b) => a - b);
}

/**
 * The reminder that applies at `hour`: its number (0 = the day's first) and the hour the one before it went out.
 * A later reminder only asks about what happened since the earlier one, so logging in the morning doesn't silence the evening.
 * null means it is too early for any reminder.
 */
export function reminderSlot(hours: number[], hour: number): { slot: number; sinceHour: number | null } | null {
  const passed = hours.filter((h) => h <= hour).length;
  if (passed === 0) return null;
  return { slot: passed - 1, sinceHour: passed > 1 ? hours[passed - 2] : null };
}

export function hourLabel(h: number): string {
  return h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`;
}
