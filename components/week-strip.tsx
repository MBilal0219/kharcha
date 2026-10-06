"use client";

import { dayShort } from "@/lib/budget/week";
import { money, num } from "@/lib/money";
import { cx } from "./ui";

/** Up to 7 daily spend bars against the period's even daily share (dashed line). Days off are dimmed. */
export function WeekStrip({
  days,
  reference,
  today,
}: {
  days: { day: string; amount: number; off?: boolean }[];
  reference: number;
  today: string;
}) {
  const max = Math.max(reference * 1.25, ...days.map((d) => d.amount), 1);
  const refPct = (reference / max) * 100;
  const H = 96;
  return (
    <div>
      <div className="relative" style={{ height: H }}>
        {reference > 0 && (
          <div
            className="absolute inset-x-0 border-t border-dashed border-muted/70"
            style={{ bottom: `${refPct}%` }}
            aria-hidden="true"
          >
            <span className="absolute -top-5 right-0 rounded bg-surface px-1 text-[0.68rem] font-semibold text-muted tnum">
              {num(reference)}/day
            </span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end gap-2">
          {days.map((d) => {
            const h = d.amount > 0 ? Math.max(4, (d.amount / max) * 100) : 0;
            const over = reference > 0 && d.amount > reference;
            const future = d.day > today;
            return (
              <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center">
                <div
                  title={`${dayShort(d.day)}: ${money(d.amount)}`}
                  className={cx(
                    "w-full max-w-7 rounded-t-[6px] rounded-b-[3px] transition-all",
                    over ? "bg-danger" : "bg-accent",
                    d.day === today && "ring-2 ring-offset-2 ring-offset-surface ring-accent",
                  )}
                  style={{ height: `${h}%` }}
                />
                {!future && d.amount === 0 && <div className="absolute bottom-0 h-[3px] w-4 rounded-full bg-surface-3" />}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        {days.map((d) => (
          <div key={d.day} className={cx("flex-1 text-center", d.off && d.day !== today && "opacity-50")}>
            <p className={cx("text-[0.7rem] font-semibold", d.day === today ? "text-accent" : "text-muted")}>{dayShort(d.day)}</p>
            <p className="tnum text-[0.7rem] text-ink-2">{d.amount ? num(d.amount) : d.off ? "off" : "–"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
