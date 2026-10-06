import { z } from "zod";
import type { SyncTable } from "@/lib/types";

// Server-side validation for everything the phone sends to /api/sync.
// Unknown fields are stripped, so the client can't write arbitrary data into MongoDB.

const id = z.string().min(1).max(120);
const iso = z.string().max(40);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().int().min(0).max(1_000_000_000_000); // hundredths
const dow = z.number().int().min(0).max(6);
const text = (max: number) => z.string().max(max);

const base = {
  id,
  updatedAt: iso,
  deletedAt: iso.nullable(),
};

export const schemas: Record<SyncTable, z.ZodTypeAny> = {
  transactions: z.object({
    ...base,
    type: z.enum([
      "expense", "income", "loan_taken", "loan_repaid", "loan_given",
      "loan_collected", "saving", "saving_withdraw", "transfer",
    ]),
    amount: money,
    walletId: id.optional(),
    toWalletId: id.optional(),
    categoryId: id.optional(),
    loanId: id.optional(),
    goalId: id.optional(),
    reserveId: id.optional(),
    needWant: z.enum(["need", "want"]),
    isOneOff: z.boolean(),
    note: text(300).optional(),
    occurredAt: iso,
    day,
  }),
  wallets: z.object({ ...base, name: text(40), isDefault: z.boolean(), sort: z.number() }),
  categories: z.object({
    ...base,
    key: text(60).optional(),
    name: text(40),
    kind: z.enum(["expense", "income"]),
    icon: text(40),
    limit: money.nullable().optional(),
    archived: z.boolean(),
    sort: z.number(),
  }),
  people: z.object({ ...base, name: text(60) }),
  loans: z.object({
    ...base,
    personId: id.nullable(),
    direction: z.enum(["borrowed", "lent"]),
    principal: money,
    dueDate: day.nullable().optional(),
    goalId: id.nullable().optional(),
    status: z.enum(["open", "closed"]),
    note: text(300).optional(),
    createdDay: day,
  }),
  goals: z.object({
    ...base,
    name: text(60),
    target: money,
    kind: z.enum(["buffer", "goal"]),
    targetDate: day.nullable().optional(),
    sort: z.number(),
  }),
  templates: z.object({
    ...base,
    label: text(40),
    amount: money,
    type: z.enum(["expense", "income"]),
    categoryId: id,
    walletId: id.optional(),
    needWant: z.enum(["need", "want"]),
    sort: z.number(),
  }),
  settings: z.object({
    ...base,
    currency: z.string().regex(/^[A-Z]{3}$/),
    budgetAmount: money,
    timezone: text(60),
    reminderHour: z.number().int().min(0).max(23),
    extraSavePercent: z.number().int().min(0).max(100),
    bufferTarget: money,
    onboarded: z.boolean(),
  }),
  schedules: z.object({
    ...base,
    from: day,
    period: z.enum(["weekly", "biweekly", "monthly"]),
    startDow: dow,
    startDom: z.number().int().min(1).max(28),
    offDays: z.array(dow).max(7),
  }),
  reserves: z.object({
    ...base,
    name: text(40),
    kind: z.enum(["spend", "save"]),
    amounts: z.array(z.object({ from: day, amount: money })).min(1).max(200),
    until: day.nullable(),
    sort: z.number(),
  }),
  periodSettings: z.object({
    ...base,
    periodStart: day,
    carryIn: money,
    sweptPrev: z.boolean(),
    reservesOff: z.array(id).max(50),
  }),
  dayOverrides: z.object({ ...base, day, kind: z.enum(["off", "work"]) }),
  dayClosures: z.object({ ...base, day }),
  cashCounts: z.object({
    ...base,
    walletId: id,
    counted: z.number().int(),
    expected: z.number().int(),
    countedAt: iso,
  }),
};
