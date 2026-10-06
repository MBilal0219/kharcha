"use client";

import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart,
} from "recharts";
import { num, money } from "@/lib/money";

// Shared chart styling: thin marks, recessive grid, text in ink tokens, hover tooltip on every chart.

const axis = { fontSize: 11, fill: "var(--muted)" };

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
          <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => num(v)} width={48} />
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

export function InOutBars({ data, tickFmt }: { data: { weekStart: string; income: number; spent: number }[]; tickFmt: (d: string) => string }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="weekStart" tickFormatter={tickFmt} tick={axis} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
          <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => num(v)} width={48} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip labelFmt={(l) => `Week of ${tickFmt(l)}`} />} />
          <Bar dataKey="income" name="Money in" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="spent" name="Spent" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
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
          <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(v) => num(v)} width={48} />
          <Tooltip content={<Tip labelFmt={labelFmt} />} />
          <Area type="monotone" dataKey="total" name="Saved" stroke="var(--series-1)" strokeWidth={2} fill="url(#saveFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export { Line, LineChart };
