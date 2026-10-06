"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useAppData } from "@/lib/local/app-data";
import { buildReport, monthRange, toCSV } from "@/lib/budget/report";
import { summarizePeriod } from "@/lib/budget/calc";
import { periodNoun, periodOf, type Period } from "@/lib/budget/period";
import { addDay, dayShort, monthKey, prettyMonth, prettyRange, shiftMonth } from "@/lib/budget/week";
import { txTitle } from "@/lib/labels";
import { money } from "@/lib/money";
import { downloadFile } from "@/lib/download";
import { DailyBars, FlowBars, SavingsArea } from "@/components/charts";
import { PeriodBreakdown } from "@/components/period-breakdown";
import { CatIcon } from "@/components/icons";
import { Button, Card, Segmented, SectionTitle, cx } from "@/components/ui";

type Kind = "period" | "month";

export default function ReportsPage() {
  const d = useAppData();
  const [kind, setKind] = useState<Kind>("period");
  const [offset, setOffset] = useState(0); // 0 = current period, -1 = previous …

  const noun = periodNoun(d.period.kind);
  const { days, title, period, prevDays } = useMemo(() => {
    if (kind === "period") {
      // Walk back one period at a time, so each one is read with the schedule it had.
      let p: Period = d.period;
      for (let i = 0; i > offset; i--) p = periodOf(addDay(p.start, -1), d.schedules);
      const title = offset === 0 ? `This ${noun}` : offset === -1 ? `Last ${noun}` : prettyRange(p.start, p.end);
      return { days: p.days, title, period: p as Period | null, prevDays: periodOf(addDay(p.start, -1), d.schedules).days };
    }
    const m = shiftMonth(monthKey(d.today), offset);
    return { days: monthRange(m), title: prettyMonth(m), period: null as Period | null, prevDays: monthRange(shiftMonth(m, -1)) };
  }, [kind, offset, d.period, d.schedules, d.today, noun]);

  const rep = useMemo(() => buildReport(d.txs, d.cats, days), [d.txs, d.cats, days]);
  const prev = useMemo(() => buildReport(d.txs, d.cats, prevDays), [d.txs, d.cats, prevDays]);
  const periodSum = useMemo(
    () => (period ? summarizePeriod({ txs: d.txs, cats: d.cats, period, reserves: d.allReserves, setting: d.periodSettings.get(period.start), today: d.today, isWork: d.isWork }) : null),
    [period, d],
  );

  const spentNoFare = rep.spent - rep.reserved;
  const prevNoFare = prev.spent - prev.reserved;
  const change = prevNoFare > 0 ? Math.round(((spentNoFare - prevNoFare) / prevNoFare) * 100) : null;
  const catTotal = rep.categories.reduce((a, c) => a + c.total, 0);
  const periodTxs = d.txs.filter((t) => t.day >= days[0] && t.day <= days[days.length - 1]);
  const incomeTotal = rep.incomeCategories.reduce((a, c) => a + c.total, 0);
  const short = days.length <= 7;

  const tick = (day: string) => (short ? dayShort(day) : format(parseISO(day), "d"));
  const dayLabel = (day: string) => format(parseISO(day), "EEE, d MMM");
  const visibleDays = rep.daily.filter((x) => x.day <= d.today);

  function exportCsv() {
    const csv = toCSV(periodTxs, (t) => txTitle(t, d), d.cats, new Map(d.wallets.map((w) => [w.id, w.name])), d.settings.currency);
    downloadFile(`kharcha-${days[0]}-to-${days[days.length - 1]}.csv`, csv, "text/csv");
  }

  return (
    <div className="space-y-5">
      <header className="page-header glass justify-between">
        <h1 className="font-display text-[1.7rem] font-bold tracking-tight">Reports</h1>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download size={16} /> CSV
        </Button>
      </header>

      <Segmented value={kind} onChange={(k) => { setKind(k); setOffset(0); }} options={[{ value: "period", label: d.period.kind === "monthly" ? "Budget month" : d.period.kind === "weekly" ? "Budget week" : "Budget period" }, { value: "month", label: "Calendar month" }]} />

      <div className="flex items-center justify-between">
        <button onClick={() => setOffset((o) => o - 1)} aria-label="Previous period" className="grid h-10 w-10 place-items-center rounded-full bg-surface shadow-card">
          <ChevronLeft size={20} />
        </button>
        <p className="font-display text-lg font-semibold">{title}</p>
        <button onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset === 0} aria-label="Next period" className="grid h-10 w-10 place-items-center rounded-full bg-surface shadow-card disabled:opacity-30">
          <ChevronRight size={20} />
        </button>
      </div>

      {periodSum && <PeriodBreakdown title={offset === 0 ? `This ${noun}'s money` : "Money in this period"} sum={periodSum} txs={d.txs} cats={d.cats} noun={offset === 0 ? noun : "period"} />}

      {/* headline numbers */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Spent" value={money(spentNoFare)} sub={rep.reserved ? `+ ${money(rep.reserved)} from reserves` : "everyday spending"} trend={change} />
        <Kpi label="Money in" value={money(rep.income)} sub={rep.otherIncome ? `${money(rep.otherIncome)} on top of budget` : "budget"} />
        <Kpi label="Saved" value={money(rep.saved)} sub="into goals" tone="good" />
        <Kpi label="Wants" value={money(rep.want)} sub={rep.spent ? `${Math.round((rep.want / rep.spent) * 100)}% of spending` : "need vs want"} tone={rep.want > rep.spent * 0.2 ? "warn" : undefined} />
      </div>

      <Card>
        <SectionTitle>Daily spending</SectionTitle>
        <DailyBars
          data={short ? rep.daily : visibleDays.length ? visibleDays : rep.daily}
          reference={periodSum && periodSum.perDay > 0 ? periodSum.perDay : rep.avgPerDay || undefined}
          tickFmt={tick}
          labelFmt={dayLabel}
        />
        <p className="mt-2 text-sm text-muted">
          {periodSum && periodSum.perDay > 0 ? `Dashed line: the ${noun}'s money split over its ${periodSum.workDays} working days.` : `Dashed line: your average ${money(rep.avgPerDay)} on days you spent.`}
        </p>
      </Card>

      <Card>
        <SectionTitle>Where it went</SectionTitle>
        {rep.categories.length === 0 ? (
          <p className="py-4 text-sm text-muted">No spending in this period.</p>
        ) : (
          <ul className="space-y-3">
            {rep.categories.map((c) => {
              const pct = Math.round((c.total / catTotal) * 100);
              return (
                <li key={c.categoryId} className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                    <CatIcon name={c.category?.icon} size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">{c.category?.name ?? "Uncategorised"}</span>
                      <span className="tnum shrink-0 text-ink-2">
                        {money(c.total)} <span className="text-muted">· {pct}%</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle>Needs vs wants</SectionTitle>
        {rep.spent ? (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-[var(--series-1)]" style={{ width: `${(rep.need / rep.spent) * 100}%` }} />
              <div className="h-full border-l-2 border-surface bg-[var(--series-2)]" style={{ width: `${(rep.want / rep.spent) * 100}%` }} />
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--series-1)]" /> Needs <b className="tnum">{money(rep.need)}</b>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--series-2)]" /> Wants <b className="tnum">{money(rep.want)}</b>
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">No spending in this period.</p>
        )}
      </Card>

      <Card>
        <SectionTitle>Money in, saved and spent</SectionTitle>
        {days.length <= 14 ? (
          <FlowBars data={rep.daily} xKey="day" tickFmt={tick} labelFmt={dayLabel} />
        ) : (
          <FlowBars data={rep.weekly} xKey="weekStart" tickFmt={(w) => format(parseISO(w), "d MMM")} labelFmt={(w) => `Week of ${format(parseISO(w), "d MMM")}`} />
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[var(--series-1)]" /> Money in <b className="tnum text-ink">{money(rep.income)}</b></span>
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[var(--series-3)]" /> Saved <b className="tnum text-ink">{money(rep.saved)}</b></span>
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[var(--series-2)]" /> Spent <b className="tnum text-ink">{money(spentNoFare)}</b></span>
        </div>
        <p className="mt-2 text-sm text-muted">{days.length <= 14 ? "By day." : "By week."} Spent leaves out what was paid from set-aside money.</p>
      </Card>

      {rep.incomeCategories.length > 0 && (
        <Card>
          <SectionTitle action={<span className="tnum text-sm font-semibold text-good">{money(incomeTotal)}</span>}>Where it came from</SectionTitle>
          <ul className="divide-y divide-line">
            {rep.incomeCategories.map((c) => (
              <li key={c.categoryId} className="flex items-center gap-3 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <CatIcon name={c.category?.icon} size={17} />
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{c.category?.name ?? "Other"}</span>
                <span className="tnum text-ink-2">
                  {money(c.total)} <span className="text-muted">· {Math.round((c.total / incomeTotal) * 100)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <SectionTitle action={<span className="tnum text-sm font-semibold">{money(rep.savingsCurve[rep.savingsCurve.length - 1]?.total ?? 0)}</span>}>Savings</SectionTitle>
        <SavingsArea data={rep.savingsCurve.filter((x) => x.day <= d.today)} tickFmt={tick} labelFmt={dayLabel} />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Avg spend / day" value={money(rep.avgPerDay)} sub={`${rep.activeDays} spending days`} />
        <Kpi label="Biggest day" value={money(Math.max(0, ...rep.daily.map((x) => x.spent)))} sub="most spent in one day" />
        {(rep.borrowed > 0 || rep.repaid > 0) && (
          <>
            <Kpi label="Borrowed" value={money(rep.borrowed)} sub="from others" tone="warn" />
            <Kpi label="Paid back" value={money(rep.repaid)} sub="to others" tone="good" />
          </>
        )}
      </div>

      {rep.top.length > 0 && (
        <Card>
          <SectionTitle>Biggest expenses</SectionTitle>
          <ol className="divide-y divide-line">
            {rep.top.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <span className="tnum w-5 text-sm font-semibold text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{t.note || txTitle(t, d)}</p>
                  <p className="text-sm text-muted">{dayLabel(t.day)}</p>
                </div>
                <span className="tnum font-semibold">{money(t.amount)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {kind === "period" && offset === 0 && d.insights.length > 0 && (
        <Card>
          <SectionTitle>What stands out</SectionTitle>
          <ul className="space-y-3">
            {d.insights.map((i, k) => (
              <li key={k} className="flex gap-3">
                <Lightbulb size={17} className={cx("mt-0.5 shrink-0", i.tone === "warn" ? "text-danger" : i.tone === "good" ? "text-accent" : "text-muted")} />
                <span className="text-[0.95rem]">{i.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, trend, tone }: { label: string; value: string; sub: string; trend?: number | null; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-3xl bg-surface p-4 shadow-card">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={cx("font-display text-xl font-semibold tnum", tone === "good" && "text-good", tone === "warn" && "text-danger")}>{value}</p>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {trend !== undefined && trend !== null && (
          <span className={cx("inline-flex items-center gap-0.5 font-semibold", trend > 0 ? "text-danger" : "text-good")}>
            {trend > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {Math.abs(trend)}%
          </span>
        )}
        <span className="truncate">{sub}</span>
      </div>
    </div>
  );
}
