"use client";

import { useAppData } from "@/lib/local/app-data";
import { remove, setDefaultWallet, upsertWallet } from "@/lib/local/ops";
import { money } from "@/lib/money";
import type { Wallet } from "@/lib/types";
import { Button, Field, Sheet, inputClass, toast } from "./ui";

export type WalletDraft = { id?: string; name: string };

/**
 * Add or edit a place money is kept: cash, a bank account, a card, any mobile-money or e-wallet account.
 * The name is free text, so any provider works.
 */
export function WalletSheet({ draft, onChange, onClose, onSaved }: { draft: WalletDraft | null; onChange: (d: WalletDraft) => void; onClose: () => void; onSaved?: (w: Wallet) => void }) {
  const d = useAppData();
  const name = draft?.name.trim() ?? "";
  const current = draft?.id ? d.wallets.find((w) => w.id === draft.id) : undefined;
  const balance = current ? d.walletBal.get(current.id) ?? 0 : 0;
  const taken = draft && d.wallets.some((w) => w.id !== draft.id && w.name.toLowerCase() === name.toLowerCase());

  async function save() {
    if (!draft || !name || taken) return;
    const saved = await upsertWallet({ id: draft.id, name, ...(draft.id ? {} : { sort: d.wallets.length }) });
    toast(draft.id ? "Saved" : `${name} added`);
    onSaved?.(saved);
    onClose();
  }

  return (
    <Sheet open={draft !== null} onClose={onClose} title={draft?.id ? "Edit account" : "New account"}>
      {draft && (
        <div className="space-y-4">
          <Field label="Name" hint={taken ? "You already have an account with this name." : "Any name: a bank, a card, a mobile-money or e-wallet account."}>
            <input
              id="wallet-name"
              className={inputClass}
              value={draft.name}
              maxLength={40}
              autoFocus={!draft.id}
              placeholder="e.g. JazzCash, SadaPay, Meezan Bank, Visa card"
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
            />
          </Field>
          <Button className="w-full" onClick={save} disabled={!name || Boolean(taken)}>
            {draft.id ? "Save" : "Add account"}
          </Button>
          {current && !current.isDefault && (
            <Button variant="outline" className="w-full" onClick={() => setDefaultWallet(current.id).then(() => { toast(`${current.name} is now the default`); onClose(); })}>
              Use by default for new entries
            </Button>
          )}
          {current && !current.isDefault && d.wallets.length > 1 && (
            balance === 0 ? (
              <Button variant="danger" className="w-full" onClick={() => remove("wallets", current.id).then(() => { toast(`${current.name} removed`); onClose(); })}>
                Remove this account
              </Button>
            ) : (
              <p className="text-center text-sm text-muted">To remove it, first move its {money(balance)} to another account.</p>
            )
          )}
        </div>
      )}
    </Sheet>
  );
}
