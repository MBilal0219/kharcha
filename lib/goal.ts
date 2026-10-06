import type { Goal } from "@/lib/types";

/** Where saved money goes by default: fill the emergency buffer first, then the first real goal. */
export function defaultGoal(goals: Goal[], balances: Map<string, number>): Goal | undefined {
  const buffer = goals.find((g) => g.kind === "buffer");
  if (buffer && (balances.get(buffer.id) ?? 0) < buffer.target) return buffer;
  return goals.find((g) => g.kind === "goal") ?? buffer;
}
