"use client";

import { useRef } from "react";
import { CalendarDays } from "lucide-react";
import { addDay, prettyDay } from "@/lib/budget/week";
import { Chip, cx } from "./ui";

/**
 * Which day an entry is for: today by default, the two days before one tap away, any earlier date from the calendar.
 * `min` keeps the choice inside a range (e.g. the current budget period).
 */
export function DayPicker({ id, value, onChange, today, min }: { id: string; value: string; onChange: (day: string) => void; today: string; min?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const recent = [today, addDay(today, -1), addDay(today, -2)].filter((x) => !min || x >= min);
  const other = !recent.includes(value);

  // A plain click on a date field doesn't open the calendar on desktop browsers, so ask for it.
  function openCalendar() {
    const el = input.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  }

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar">
      {recent.map((x) => (
        <Chip key={x} active={value === x} onClick={() => onChange(x)}>
          {prettyDay(x, today)}
        </Chip>
      ))}
      <span className="relative shrink-0">
        <button
          type="button"
          onClick={openCalendar}
          aria-pressed={other}
          className={cx(
            "inline-flex h-10 items-center gap-2 rounded-2xl border px-3 text-sm font-semibold transition active:scale-[0.97]",
            other ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-2",
          )}
        >
          <CalendarDays size={16} />
          {other ? prettyDay(value, today) : "Pick a date"}
        </button>
        {/* Kept in the layout (not display:none) so the calendar opens next to the button. */}
        <input
          ref={input}
          id={id}
          type="date"
          max={today}
          min={min}
          value={value}
          tabIndex={-1}
          aria-label="Date"
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
        />
      </span>
    </div>
  );
}
