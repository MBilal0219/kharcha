import type { Loan, Tx, TxType } from "@/lib/types";

// Two linked people each keep their own copy of a loan between them, seen from their own side:
// what one borrowed, the other lent. These pure functions turn one side's record into the other's.
// The server applies them whenever either side syncs a change (lib/server/links.ts).

/** The other side's id for the same record. Applying it twice gives the original id back. */
export function flipId(id: string): string {
  return id.endsWith(":m") ? id.slice(0, -2) : `${id}:m`;
}

const FLIP_DIRECTION = { borrowed: "lent", lent: "borrowed" } as const;

const FLIP_TYPE: Partial<Record<TxType, TxType>> = {
  loan_taken: "loan_given",
  loan_given: "loan_taken",
  loan_repaid: "loan_collected",
  loan_collected: "loan_repaid",
};

/** Only loan movements between people are shared. Everything else in a ledger stays private. */
export function isSharedTx(tx: Pick<Tx, "type" | "loanId">): boolean {
  return Boolean(tx.loanId) && tx.type in FLIP_TYPE;
}

/** Who created the record, as seen by `holder`: nothing when it is their own, else the other person's user id. */
function addedBy(source: { by?: string }, sourceHolder: string, holder: string): string | undefined {
  const creator = source.by ?? sourceHolder;
  return creator === holder ? undefined : creator;
}

/** `loan` as held by `from`, rewritten for `to`, who knows the other person as `toPersonId`. */
export function mirrorLoan(loan: Loan, from: string, to: string, toPersonId: string): Loan {
  return {
    id: flipId(loan.id),
    personId: toPersonId,
    direction: FLIP_DIRECTION[loan.direction],
    principal: loan.principal,
    dueDate: loan.dueDate ?? null,
    goalId: null,
    status: loan.status,
    note: loan.note,
    createdDay: loan.createdDay,
    by: addedBy(loan, from, to),
    updatedAt: loan.updatedAt,
    deletedAt: loan.deletedAt,
  };
}

/** A loan movement as held by `from`, rewritten for `to`. Wallet and category are each person's own, so they are left out. */
export function mirrorTx(tx: Tx, from: string, to: string): Tx {
  return {
    id: flipId(tx.id),
    type: FLIP_TYPE[tx.type]!,
    amount: tx.amount,
    loanId: flipId(tx.loanId!),
    needWant: "need",
    isOneOff: false,
    note: tx.note,
    occurredAt: tx.occurredAt,
    day: tx.day,
    by: addedBy(tx, from, to),
    updatedAt: tx.updatedAt,
    deletedAt: tx.deletedAt,
  };
}
