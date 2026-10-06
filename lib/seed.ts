import type { Category, Goal, Settings, Wallet } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

type New<T> = Omit<T, "updatedAt" | "deletedAt">;

/**
 * Starter data for a brand-new account. Built server-side on the first sync.
 * Currency, schedule, budget and reserves are the user's own choices, made on the setup screen.
 */
export function starterData(userId: string, uuid: () => string) {
  const wallets: New<Wallet>[] = [
    { id: uuid(), name: "Cash", isDefault: true, sort: 0 },
    { id: uuid(), name: "Bank", isDefault: false, sort: 1 },
  ];

  const c = (key: string, name: string, kind: "expense" | "income", icon: string, sort: number): New<Category> => ({
    id: uuid(), key, name, kind, icon, sort, limit: null, archived: false,
  });

  const categories: New<Category>[] = [
    c("food", "Food", "expense", "food", 0),
    c("groceries", "Groceries", "expense", "cart", 1),
    c("transport", "Transport", "expense", "bus", 2),
    c("fuel", "Fuel", "expense", "fuel", 3),
    c("bills", "Bills", "expense", "receipt", 4),
    c("mobile", "Mobile & internet", "expense", "phone", 5),
    c("shopping", "Shopping", "expense", "bag", 6),
    c("health", "Health", "expense", "pill", 7),
    c("education", "Education", "expense", "book", 8),
    c("fun", "Fun", "expense", "sparkles", 9),
    c("family", "Family", "expense", "heart", 10),
    c("unaccounted", "Unaccounted", "expense", "help", 11),
    c("other_expense", "Other", "expense", "dots", 12),
    c("budget", "Budget", "income", "coins", 0),
    c("salary", "Salary", "income", "briefcase", 1),
    c("freelance", "Freelance", "income", "laptop", 2),
    c("gift", "Gift", "income", "gift", 3),
    c("found", "Found / extra", "income", "sparkles", 4),
    c("other_income", "Other", "income", "plus", 5),
  ];

  const goals: New<Goal>[] = [{ id: uuid(), name: "Emergency buffer", target: 0, kind: "buffer", targetDate: null, sort: 0 }];

  const settings: New<Settings> = { id: `settings:${userId}`, ...DEFAULT_SETTINGS };

  return { wallets, categories, goals, settings: [settings] };
}
