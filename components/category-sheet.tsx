"use client";

import { useAppData } from "@/lib/local/app-data";
import { upsertCategory } from "@/lib/local/ops";
import { parseAmount, toInput } from "@/lib/money";
import type { Category } from "@/lib/types";
import { AmountInput } from "./amount-input";
import { CatIcon, ICON_CHOICES } from "./icons";
import { Button, Field, Segmented, Sheet, Toggle, inputClass, toast, cx } from "./ui";

export type CategoryDraft = { id?: string; name: string; kind: Category["kind"]; icon: string; limit: string; archived?: boolean; sort?: number };

export const newCategory = (kind: Category["kind"]): CategoryDraft => ({ name: "", kind, icon: "dots", limit: "" });
export const editCategory = (c: Category): CategoryDraft => ({ id: c.id, name: c.name, kind: c.kind, icon: c.icon, limit: c.limit ? toInput(c.limit) : "", archived: c.archived, sort: c.sort });

/** Add or edit a category, for spending or for money in. Opened from Settings, the Add screen and Home. */
export function CategorySheet({ draft, onChange, onClose, onSaved }: { draft: CategoryDraft | null; onChange: (d: CategoryDraft) => void; onClose: () => void; onSaved?: (c: Category) => void }) {
  const d = useAppData();
  const name = draft?.name.trim() ?? "";
  const taken = draft && d.categories.some((c) => c.id !== draft.id && c.kind === draft.kind && c.name.toLowerCase() === name.toLowerCase());

  async function save() {
    if (!draft || !name || taken) return;
    const saved = await upsertCategory({
      id: draft.id,
      name,
      kind: draft.kind,
      icon: draft.icon,
      limit: draft.kind === "expense" ? parseAmount(draft.limit) || null : null,
      archived: draft.archived ?? false,
      sort: draft.sort ?? d.categories.filter((c) => c.kind === draft.kind).length,
    });
    toast(draft.id ? "Category saved" : `${name} added`);
    onSaved?.(saved);
    onClose();
  }

  return (
    <Sheet open={draft !== null} onClose={onClose} title={draft?.id ? "Edit category" : "New category"}>
      {draft && (
        <div className="space-y-4">
          {!draft.id && (
            <Segmented
              value={draft.kind}
              onChange={(kind) => onChange({ ...draft, kind })}
              options={[
                { value: "expense", label: "For spending" },
                { value: "income", label: "For money in" },
              ]}
            />
          )}
          <Field label="Name" hint={taken ? "You already have a category with this name." : undefined}>
            <input
              id="cat-name"
              className={inputClass}
              value={draft.name}
              maxLength={40}
              autoFocus={!draft.id}
              placeholder={draft.kind === "income" ? "e.g. Rent received, Bonus" : "e.g. Petrol, Gifts, Kids"}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Icon">
            <div className="grid grid-cols-7 gap-2">
              {ICON_CHOICES.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onChange({ ...draft, icon: i })}
                  aria-label={i}
                  aria-pressed={draft.icon === i}
                  className={cx("grid h-10 place-items-center rounded-xl", draft.icon === i ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2")}
                >
                  <CatIcon name={i} size={17} />
                </button>
              ))}
            </div>
          </Field>
          {draft.kind === "expense" && (
            <Field label="Limit per budget period (optional)" hint="Shows a progress bar on the home screen.">
              <AmountInput id="cat-limit" value={draft.limit} placeholder="No limit" onChange={(limit) => onChange({ ...draft, limit })} />
            </Field>
          )}
          {draft.id && <Toggle checked={!draft.archived} onChange={(v) => onChange({ ...draft, archived: !v })} label="Show when adding" sub="Hidden categories keep their history" />}
          <Button className="w-full" onClick={save} disabled={!name || Boolean(taken)}>
            {draft.id ? "Save" : "Add category"}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
