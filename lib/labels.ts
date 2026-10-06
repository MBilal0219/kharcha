import type { Category, Goal, Loan, Person, Tx, Wallet } from "@/lib/types";

export interface LabelCtx {
  cats: Map<string, Category>;
  loans: Loan[];
  peopleById: Map<string, Person>;
  goals: Goal[];
  wallets: Wallet[];
}

function loanPerson(tx: Tx, ctx: LabelCtx) {
  const loan = ctx.loans.find((l) => l.id === tx.loanId);
  if (!loan) return "someone";
  if (loan.personId === null) return "savings";
  return ctx.peopleById.get(loan.personId)?.name ?? "someone";
}

export function txTitle(tx: Tx, ctx: LabelCtx): string {
  switch (tx.type) {
    case "expense":
    case "income":
      return (tx.categoryId && ctx.cats.get(tx.categoryId)?.name) || (tx.type === "income" ? "Income" : "Expense");
    case "loan_taken":
      return `Borrowed from ${loanPerson(tx, ctx)}`;
    case "loan_repaid":
      return `Paid back ${loanPerson(tx, ctx)}`;
    case "loan_given":
      return `Lent to ${loanPerson(tx, ctx)}`;
    case "loan_collected":
      return `${loanPerson(tx, ctx)} paid you back`;
    case "saving": {
      const g = ctx.goals.find((x) => x.id === tx.goalId)?.name ?? "savings";
      return tx.loanId ? `Paid back to ${g}` : `Saved to ${g}`;
    }
    case "saving_withdraw": {
      const g = ctx.goals.find((x) => x.id === tx.goalId)?.name ?? "savings";
      return tx.loanId ? `Borrowed from ${g}` : `Took from ${g}`;
    }
    case "transfer": {
      const a = ctx.wallets.find((w) => w.id === tx.walletId)?.name ?? "?";
      const b = ctx.wallets.find((w) => w.id === tx.toWalletId)?.name ?? "?";
      return `${a} → ${b}`;
    }
  }
}

/** +1 money in to spendable, −1 money out, 0 neutral. */
export function txDirection(tx: Tx): 1 | -1 | 0 {
  switch (tx.type) {
    case "income":
    case "loan_taken":
    case "loan_collected":
    case "saving_withdraw":
      return 1;
    case "transfer":
      return 0;
    default:
      return -1;
  }
}
