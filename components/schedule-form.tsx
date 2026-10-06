"use client";

import type { ScheduleLike } from "@/lib/budget/period";
import { DAY_ABBR } from "@/lib/budget/week";
import type { PeriodKind } from "@/lib/types";
import { Chip, Field, Segmented, inputClass } from "./ui";

export type ScheduleDraft = Omit<ScheduleLike, "from">;

/** Budget period, when it starts, and the days off. Shared by first-time setup and Settings. */
export function ScheduleFields({ value, onChange }: { value: ScheduleDraft; onChange: (v: ScheduleDraft) => void }) {
  const toggleOff = (i: number) => {
    const has = value.offDays.includes(i);
    if (!has && value.offDays.length >= 6) return; // at least one working day
    onChange({ ...value, offDays: has ? value.offDays.filter((d) => d !== i) : [...value.offDays, i].sort() });
  };
  return (
    <div className="space-y-4">
      <Field label="I get my budget">
        <Segmented<PeriodKind>
          value={value.period}
          onChange={(period) => onChange({ ...value, period })}
          options={[
            { value: "weekly", label: "Weekly" },
            { value: "biweekly", label: "Every 2 weeks" },
            { value: "monthly", label: "Monthly" },
          ]}
        />
      </Field>

      {value.period === "monthly" ? (
        <Field label="Starting on day" hint="The day of the month your budget arrives.">
          <select id="sched-dom" className={inputClass} value={value.startDom} onChange={(e) => onChange({ ...value, startDom: Number(e.target.value) })}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow text-muted">Starting on</span>
          <DayChips selected={[value.startDow]} onTap={(i) => onChange({ ...value, startDow: i })} />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="eyebrow text-muted">Days off</span>
        <DayChips selected={value.offDays} onTap={toggleOff} />
        <span className="text-xs text-muted">Your budget is split over the other days.</span>
      </div>
    </div>
  );
}

function DayChips({ selected, onTap }: { selected: number[]; onTap: (i: number) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {DAY_ABBR.map((name, i) => (
        <Chip key={name} active={selected.includes(i)} onClick={() => onTap(i)} className="h-11 justify-center px-0 text-[0.8rem]">
          {name}
        </Chip>
      ))}
    </div>
  );
}
