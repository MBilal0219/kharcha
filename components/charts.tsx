"use client";

import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart,
} from "recharts";
import { num, money } from "@/lib/money";

// Shared chart styling: thin marks, recessive grid, text in ink tokens, hover tooltip on every chart.

const axis = { fontSize: 11, fill: "var(--muted)" };
// Axis labels are short (3.5K, 1.2M) so large amounts fit the narrow axis; tooltips show the exact figure.
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const axisNum = (v: number) => compact.format(v / 100);

function Tip({ active, payload, label, labelFmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; labelFmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-card">
      <p className="mb-1 font-semibold text-ink">{labelFmt ? labelFmt(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="tnum font-semibold text-ink">{money(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function DailyBars({
  data,
  reference,
  labelFmt,
  tickFmt,
}: {
  data: { day: string; spent: number }[];
  reference?: number;
  labelFmt: (d: string) => string;
  tickFmt: (d: string) => string;
}) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="day" tickFormatter={tickFmt} tick={axis} axisLine={{ stroke: "var(--line)" }} tickLine={false} interval="preserveStartEnd" minTickGap={6} />
          <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={axisNum} width={48} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip labelFmt={labelFmt} />} />
          {reference ? (
            <ReferenceLine y={reference} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: `limit ${num(reference)}`, position: "insideTopRight", fill: "var(--muted)", fontSize: 10 }} />
          ) : null}
          <Bar dataKey="spent" name="Spent" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Money in, saved and spent side by side, per day or per week. */
export function FlowBars<K extends "day" | "weekStart">({
  data,
  xKey,
  tickFmt,
  labelFmt,
}: {
  data: ({ income: number; saved: number; spent: number } & Record<K, string>)[];
  xKey: K;
  tickFmt: (d: string) => string;
  labelFmt: (d: string) => string;
}) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barGap={1}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey={xKey} tickFormatter={tickFmt} tick={axis} axisLine={{ stroke: "var(--line)" }} tickLine={false} interval="preserveStartEnd" minTickGap={6} />
          <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={axisNum} width={48} />
          <ReferenceLine y={0} stroke="var(--line)" />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip labelFmt={labelFmt} />} />
          <Bar dataKey="income" name="Money in" fill="var(--series-1)" radius={[3, 3, 0, 0]} maxBarSize={16} />
          <Bar dataKey="saved" name="Saved" fill="var(--series-3)" radius={[3, 3, 0, 0]} maxBarSize={16} />
          <Bar dataKey="spent" name="Spent" fill="var(--series-2)" radius={[3, 3, 0, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SavingsArea({ data, tickFmt, labelFmt }: { data: { day: string; total: number }[]; tickFmt: (d: string) => string; labelFmt: (d: string) => string }) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="saveFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="day" tickFormatter={tickFmt} tick={axis} axisLine={{ stroke: "var(--line)" }} tickLine={false} interval="preserveStartEnd" minTickGap={10} />
          <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={axisNum} width={48} />
          <Tooltip content={<Tip labelFmt={labelFmt} />} />
          <Area type="monotone" dataKey="total" name="Saved" stroke="var(--series-1)" strokeWidth={2} fill="url(#saveFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export { Line, LineChart };
