"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Bell, Download, LogOut, Moon, Plus, RefreshCw, Sun, Monitor, Upload, Trash2, Star } from "lucide-react";
import { useAppData } from "@/lib/local/app-data";
import { remove, setDefaultWallet, updateSettings, upsertTemplate, upsertWallet, patch as patchRow } from "@/lib/local/ops";
import { syncNow } from "@/lib/local/sync";
import { exportBackup, importBackup, clearLocal } from "@/lib/local/backup";
import { hourLabel } from "@/lib/budget/reminders";
import { toCSV } from "@/lib/budget/report";
import { txTitle } from "@/lib/labels";
import { downloadFile } from "@/lib/download";
import { money, parseAmount, toInput } from "@/lib/money";
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from "@/lib/push-client";
import { signOutAction, signOutEverywhereAction } from "@/app/actions";
import { AmountInput } from "@/components/amount-input";
import { CategorySheet, editCategory, newCategory, type CategoryDraft } from "@/components/category-sheet";
import { CatIcon } from "@/components/icons";
import { BudgetSettings, ReserveSettings, SavingSettings, ScheduleSettings } from "@/components/settings-budget";
import { Button, Card, Field, Segmented, SectionTitle, Sheet, Toggle, inputClass, toast, cx } from "@/components/ui";

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 am to 11 pm

export default function SettingsPage() {
  const d = useAppData();
  const router = useRouter();
  return (
    <div className="space-y-6">
      <header className="page-header glass gap-2">
        <button onClick={() => router.back()} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full bg-surface shadow-card">
          <ArrowLeft size={19} />
        </button>
        <h1 className="font-display text-[1.7rem] font-bold tracking-tight">Settings</h1>
      </header>

      <BudgetSettings />
      <ScheduleSettings />
      <ReserveSettings />
      <Categories />
      <Templates />
      <Wallets />
      <SavingSettings />
      <Reminders />
      <Appearance />
      <Data />

      <p className="pb-4 text-center text-xs text-muted">
        Kharcha · signed in as {d.user?.email}
        <br />
        <a href="/privacy" className="inline-block py-2 underline">Privacy</a> · <a href="/terms" className="inline-block py-2 underline">Terms</a>
      </p>
    </div>
  );
}

function Reminders() {
  const d = useAppData();
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushState().then(setState).catch(() => setState("unsupported"));
  }, []);

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      setState(on ? await enablePush() : await disablePush());
      if (on) toast("Reminders on. You'll get a nudge in the evening if you forget.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SectionTitle>Reminders</SectionTitle>
      <Card className="space-y-3">
        {state === "needs-install" ? (
          <p className="text-sm text-ink-2">
            On iPhone, tap <b>Share → Add to Home Screen</b>, open Kharcha from there, then turn on reminders here.
          </p>
        ) : state === "unsupported" ? (
          <p className="text-sm text-ink-2">This browser can&apos;t receive notifications. Install the app from Chrome on Android for reminders.</p>
        ) : state === "denied" ? (
          <p className="text-sm text-danger">Notifications are blocked. Allow them for this site in your browser settings, then come back.</p>
        ) : (
          <Toggle
            checked={state === "on"}
            onChange={(v) => !busy && toggle(v)}
            label="Reminders"
            sub="Only if nothing is logged that day. Also loan due dates and a summary when your budget period ends."
          />
        )}
        {state === "on" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendTestPush().then((n) => toast(n ? "Test sent. Check your notifications." : "No device reached. Try turning reminders off and on.")).catch(() => toast("Test failed. Are you online?"))}
          >
            <Bell size={15} /> Send a test
          </Button>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First reminder">
            <select id="set-reminder-hour" className={inputClass} value={d.settings.reminderHour} onChange={(e) => updateSettings({ reminderHour: Number(e.target.value) })}>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Second reminder">
            <select
              id="set-reminder-hour-2"
              className={inputClass}
              value={d.settings.reminderHour2 ?? ""}
              onChange={(e) => updateSettings({ reminderHour2: e.target.value === "" ? null : Number(e.target.value) })}
            >
              <option value="">Off</option>
              {HOURS.filter((h) => h !== d.settings.reminderHour).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Toggle
          checked={d.settings.remindAlways === true}
          onChange={(v) => updateSettings({ remindAlways: v })}
          label="Remind me every time"
          sub={d.settings.remindAlways ? "At these times, whether or not you logged anything" : "Only when nothing is logged (since the earlier reminder, for the second one)"}
        />
        <p className="text-xs text-muted">Times are in your own time zone. The home screen also shows a banner after the earlier time if nothing is logged.</p>
      </Card>
    </section>
  );
}

function Categories() {
  const d = useAppData();
  const [edit, setEdit] = useState<CategoryDraft | null>(null);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const list = d.categories.filter((c) => c.kind === kind);

  return (
    <section id="categories" className="scroll-mt-4">
      <SectionTitle>Categories</SectionTitle>
      <Segmented className="mb-3" value={kind} onChange={setKind} options={[{ value: "expense", label: "Spending" }, { value: "income", label: "Money in" }]} />
      <Card className="divide-y divide-line py-1">
        {list.map((c) => (
          <button key={c.id} onClick={() => setEdit(editCategory(c))} className={cx("flex w-full items-center gap-3 py-3 text-left", c.archived && "opacity-50")}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-ink-2">
              <CatIcon name={c.icon} size={17} />
            </span>
            <span className="flex-1 font-semibold">{c.name}</span>
            <span className="tnum text-sm text-muted">{c.archived ? "Hidden" : c.limit ? `limit ${money(c.limit)}` : ""}</span>
          </button>
        ))}
        <div className="py-3">
          <Button variant="soft" className="w-full" onClick={() => setEdit(newCategory(kind))}>
            <Plus size={17} /> Add a {kind === "expense" ? "spending" : "money-in"} category
          </Button>
        </div>
      </Card>
      <CategorySheet draft={edit} onChange={setEdit} onClose={() => setEdit(null)} />
    </section>
  );
}

function Templates() {
  const d = useAppData();
  const [form, setForm] = useState<{ label: string; amount: string; type: "expense" | "income"; categoryId: string } | null>(null);
  const cats = d.categories.filter((c) => !c.archived && c.kind === (form?.type ?? "expense"));
  return (
    <section>
      <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => setForm({ label: "", amount: "", type: "expense", categoryId: "" })}><Plus size={16} /> Add</Button>}>
        One-tap buttons
      </SectionTitle>
      <Card className="divide-y divide-line py-1">
        {d.templates.length === 0 && <p className="py-3 text-sm text-muted">For things you buy often at the same price. One tap on the home screen logs them.</p>}
        {d.templates.map((t) => (
          <div key={t.id} className="flex items-center gap-3 py-3">
            <div className="flex-1">
              <p className="font-semibold">{t.label}</p>
              <p className="text-sm text-muted">{d.cats.get(t.categoryId)?.name}</p>
            </div>
            <span className={cx("tnum font-semibold", t.type === "income" && "text-good")}>{money(t.amount)}</span>
            <button aria-label={`Remove ${t.label}`} onClick={() => remove("templates", t.id).then(() => toast("Removed"))} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-2">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </Card>
      <Sheet open={form !== null} onClose={() => setForm(null)} title="New one-tap button">
        {form && (
          <div className="space-y-4">
            <Segmented value={form.type} onChange={(v) => setForm({ ...form, type: v, categoryId: "" })} options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Money in" }]} />
            <Field label="Label">
              <input id="tpl-label" className={inputClass} value={form.label} placeholder="e.g. Morning coffee" onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </Field>
            <Field label="Amount">
              <AmountInput id="tpl-amount" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} />
            </Field>
            <Field label="Category">
              <select id="tpl-cat" className={inputClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Choose…</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              className="w-full"
              disabled={!form.label.trim() || !parseAmount(form.amount) || !form.categoryId}
              onClick={() =>
                upsertTemplate({ label: form.label.trim(), amount: parseAmount(form.amount), type: form.type, categoryId: form.categoryId, needWant: "need", sort: d.templates.length }).then(() => {
                  toast("Button added");
                  setForm(null);
                })
              }
            >
              Add button
            </Button>
          </div>
        )}
      </Sheet>
    </section>
  );
}

function Wallets() {
  const d = useAppData();
  const [name, setName] = useState("");
  return (
    <section>
      <SectionTitle>Wallets & accounts</SectionTitle>
      <Card className="space-y-1">
        {d.wallets.map((w) => (
          <div key={w.id} className="flex items-center gap-2 py-1.5">
            <input
              id={`wallet-${w.id}`}
              defaultValue={w.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== w.name && patchRow("wallets", w.id, { name: e.target.value.trim() })}
              className={cx(inputClass, "h-11 flex-1")}
            />
            <button
              onClick={() => setDefaultWallet(w.id).then(() => toast(`${w.name} is now the default`))}
              aria-label={`Make ${w.name} default`}
              className={cx("grid h-11 w-11 place-items-center rounded-2xl", w.isDefault ? "bg-gold-soft text-gold" : "bg-surface-2 text-muted")}
            >
              <Star size={17} fill={w.isDefault ? "currentColor" : "none"} />
            </button>
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <input id="wallet-new" value={name} onChange={(e) => setName(e.target.value)} placeholder="New: any bank, card or e-wallet" className={cx(inputClass, "h-11 flex-1")} />
          <Button
            variant="soft"
            disabled={!name.trim()}
            onClick={() => upsertWallet({ name: name.trim(), sort: d.wallets.length }).then(() => { setName(""); toast("Wallet added"); })}
          >
            Add
          </Button>
        </div>
      </Card>
    </section>
  );
}

function Appearance() {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("kharcha-theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
  }, []);
  function apply(t: "system" | "light" | "dark") {
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("kharcha-theme");
      else localStorage.setItem("kharcha-theme", t);
    } catch {}
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }
  return (
    <section>
      <SectionTitle>Appearance</SectionTitle>
      <Segmented
        value={theme}
        onChange={apply}
        options={[
          { value: "system", label: <span className="inline-flex items-center gap-1.5"><Monitor size={15} /> Auto</span> },
          { value: "light", label: <span className="inline-flex items-center gap-1.5"><Sun size={15} /> Light</span> },
          { value: "dark", label: <span className="inline-flex items-center gap-1.5"><Moon size={15} /> Dark</span> },
        ]}
      />
    </section>
  );
}

function Data() {
  const d = useAppData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function doSignOut(everywhere = false) {
    // Needs the session, so it runs first. Otherwise this phone keeps getting the account's reminders.
    await disablePush().catch(() => {});
    await clearLocal();
    await (everywhere ? signOutEverywhereAction() : signOutAction());
  }

  async function doReset() {
    setDeleting(true);
    try {
      const res = await fetch("/api/me/reset", { method: "POST" });
      if (!res.ok) throw new Error();
      await syncNow(); // the server answers "start over", which empties this phone's copy and pulls the fresh one
      setConfirmReset(false);
      toast("Started over. Set up your budget again.");
    } catch {
      toast(navigator.onLine ? "Couldn't start over. Try again." : "Connect to the internet to start over.");
    } finally {
      setDeleting(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await disablePush().catch(() => {});
      const res = await fetch("/api/me", { method: "DELETE" });
      if (!res.ok) throw new Error(res.status === 401 ? "Sign in again, then delete your account." : "Couldn't delete the account. Try again.");
      await clearLocal();
      await signOutAction();
    } catch (e) {
      toast(navigator.onLine ? (e as Error).message : "Connect to the internet to delete your account.");
      setDeleting(false);
    }
  }

  return (
    <section>
      <SectionTitle>Data & sync</SectionTitle>
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{d.pending ? `${d.pending} changes waiting` : "Everything synced"}</p>
            <p className="text-sm text-muted">
              {d.sync.lastSyncedAt ? `Last sync ${format(parseISO(d.sync.lastSyncedAt), "d MMM, h:mm a")}` : "Not synced yet"}
              {d.sync.message ? ` · ${d.sync.message}` : ""}
            </p>
          </div>
          <Button size="sm" variant="soft" onClick={() => syncNow().then(() => toast("Sync finished"))}>
            <RefreshCw size={15} /> Sync
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadFile(`kharcha-all-${d.today}.csv`, toCSV(d.txs, (t) => txTitle(t, d), d.cats, new Map(d.wallets.map((w) => [w.id, w.name])), d.settings.currency), "text/csv")}
          >
            <Download size={15} /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportBackup().then((j) => downloadFile(`kharcha-backup-${d.today}.json`, j, "application/json"))}>
            <Download size={15} /> Backup JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Restore backup
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmOut(true)}>
            <LogOut size={15} /> Sign out
          </Button>
        </div>
        <input
          ref={fileRef}
          id="backup-file"
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const n = await importBackup(await f.text());
              toast(`Restored ${n} records`);
            } catch (err) {
              toast((err as Error).message);
            }
            e.target.value = "";
          }}
        />
        <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
          <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirmReset(true)}>
            <RefreshCw size={15} /> Start over
          </Button>
          <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={15} /> Delete account
          </Button>
        </div>
      </Card>
      <Sheet open={confirmReset} onClose={() => setConfirmReset(false)} title="Start over?">
        <p className="mb-4 text-ink-2">
          This deletes every entry, category, loan, goal and setting on all your devices and takes you back to setup. Your account and sign-in stay.
          It can&apos;t be undone.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" disabled={deleting} onClick={doReset}>
            {deleting ? "Clearing…" : "Delete my data"}
          </Button>
        </div>
      </Sheet>
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your account?">
        <p className="mb-4 text-ink-2">
          This removes your account and every entry, loan and goal from the server and this phone. It can't be undone. Download a backup first if
          you want a copy.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" disabled={deleting} onClick={doDelete}>
            {deleting ? "Deleting…" : "Delete everything"}
          </Button>
        </div>
      </Sheet>
      <Sheet open={confirmOut} onClose={() => setConfirmOut(false)} title="Sign out?">
        <p className="mb-4 text-ink-2">
          {d.pending
            ? `${d.pending} changes haven't synced yet and will be lost. Connect to the internet and sync first.`
            : "Your data is safe on the server. This phone's copy will be cleared."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setConfirmOut(false)}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={() => doSignOut()}>
            Sign out
          </Button>
        </div>
        <Button variant="ghost" className="mt-2 w-full" onClick={() => doSignOut(true)}>
          Sign out on all my devices
        </Button>
      </Sheet>
    </section>
  );
}
