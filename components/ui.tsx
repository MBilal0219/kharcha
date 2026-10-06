"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import { money } from "@/lib/money";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "soft" | "ghost" | "danger" | "outline";
export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-11 px-4 text-[0.95rem]",
        size === "lg" && "h-14 px-5 text-base",
        variant === "primary" && "bg-accent text-accent-ink",
        variant === "soft" && "bg-accent-soft text-accent",
        variant === "ghost" && "text-ink-2 hover:bg-surface-2",
        variant === "outline" && "border border-line bg-surface text-ink",
        variant === "danger" && "bg-danger-soft text-danger",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-3xl bg-surface p-4 shadow-card", className)}>{children}</section>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-1 flex items-center justify-between gap-3 px-1">
      <h2 className="font-display text-[1.05rem] font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function Money({ value, className, signed }: { value: number; className?: string; signed?: boolean }) {
  return (
    <span className={cx("tnum", className)}>
      {signed && value > 0 ? "+" : ""}
      {money(value)}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cx("flex gap-1 rounded-2xl bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-9 flex-1 whitespace-nowrap rounded-xl px-2 text-sm font-semibold transition",
            value === o.value ? "bg-surface text-ink shadow-card" : "text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl border px-3 text-sm font-semibold transition active:scale-[0.97]",
        active ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-muted focus:border-accent";

export function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-2 text-left"
    >
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        {sub && <span className="block text-sm text-muted">{sub}</span>}
      </span>
      <span className={cx("relative h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-surface-3")}>
        <span
          className={cx(
            "absolute top-1 h-5 w-5 rounded-full bg-surface shadow transition-all",
            checked ? "left-6" : "left-1",
          )}
        />
      </span>
    </button>
  );
}

export function Progress({ value, max, tone = "accent", className }: { value: number; max: number; tone?: "accent" | "gold" | "danger"; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cx("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <div
        className={cx("h-full rounded-full transition-all", tone === "accent" && "bg-accent", tone === "gold" && "bg-gold", tone === "danger" && "bg-danger")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const SHEET_MS = 240;
const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Bottom sheet. Close it with the X, the backdrop, Escape, or by dragging it down:
 * it follows the finger, and lets go past a third of its height (or with a quick flick) to dismiss.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(open);
  // What to show while sliding out: callers usually stop rendering their content the moment they close.
  const last = useRef({ title, children });
  if (open) last.current = { title, children };
  const close = useRef(onClose);
  close.current = onClose;

  const place = (y: number, animate: boolean) => {
    const el = panel.current;
    if (!el) return;
    const t = animate ? `${SHEET_MS}ms ${SHEET_EASE}` : "none";
    el.style.transition = `transform ${t}`;
    el.style.transform = `translateY(${y}px)`;
    if (backdrop.current) {
      backdrop.current.style.transition = `opacity ${t}`;
      backdrop.current.style.opacity = String(Math.max(0, 1 - y / (el.offsetHeight || 1)));
    }
  };

  // Mount, slide in; slide out, unmount.
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    place(panel.current?.offsetHeight ?? 600, true);
    const t = setTimeout(() => setMounted(false), SHEET_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return;
    const el = panel.current!;
    place(el.offsetHeight, false);
    const raf = requestAnimationFrame(() => place(0, true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true }); // keep an autofocused field focused

    // ---- drag down to dismiss ----
    let startY = 0;
    let startT = 0;
    let dy = 0;
    let dragging = false;
    const begin = (y: number) => {
      startY = y;
      startT = performance.now();
      dy = 0;
      dragging = true;
    };
    const move = (y: number) => {
      dy = Math.max(0, y - startY);
      place(dy, false);
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      const fast = dy > 24 && dy / Math.max(performance.now() - startT, 1) > 0.5;
      if (dy > el.offsetHeight / 3 || fast) close.current();
      else place(0, true);
    };

    // Touch: the handle and title always drag; the content drags only when scrolled to its top (otherwise the finger scrolls it).
    const body = el.querySelector<HTMLElement>("[data-sheet-body]");
    let touchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const onGrip = Boolean((e.target as HTMLElement).closest("[data-sheet-grip]"));
      touchY = onGrip || (body?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null;
      dragging = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchY === null) return;
      const y = e.touches[0].clientY;
      if (!dragging) {
        if (y - touchY < 6) {
          if (y < touchY) touchY = null; // moving up: this is a scroll
          return;
        }
        begin(touchY);
      }
      e.preventDefault();
      move(y);
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);

    // Mouse: drag the handle or the title bar.
    const grip = el.querySelector<HTMLElement>("[data-sheet-grip]");
    const onMouseMove = (e: MouseEvent) => dragging && move(e.clientY);
    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      begin(e.clientY);
      e.preventDefault();
    };
    grip?.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", end);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      grip?.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", end);
    };
  }, [open, mounted]);

  if (!mounted) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={last.current.title}>
      <button ref={backdrop} aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" style={{ opacity: 0 }} onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className="relative flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-surface pt-3 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.35)] outline-none"
        style={{ transform: "translateY(100%)" }}
      >
        <div data-sheet-grip className="shrink-0 cursor-grab touch-none select-none px-4 active:cursor-grabbing">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-surface-3" />
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-xl font-semibold tracking-tight">{last.current.title}</h3>
            <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-ink-2">
              <X size={18} />
            </button>
          </div>
        </div>
        <div data-sheet-body className="sheet-pad min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1">
          {last.current.children}
        </div>
      </div>
    </div>
  );
}

// ---------- toasts ----------

interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}
let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, action?: ToastItem["action"]) {
  const id = Date.now() + Math.random();
  toasts = [...toasts.slice(-2), { id, text, action }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, action ? 5000 : 2600);
}

export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+92px)] z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="anim-rise pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-bg shadow-card">
          <span>{t.text}</span>
          {t.action && (
            <button
              className="font-bold text-accent-soft underline-offset-2 hover:underline"
              onClick={() => {
                t.action!.run();
                toasts = toasts.filter((x) => x.id !== t.id);
                emit();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-line px-6 py-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</div>
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="max-w-xs text-sm text-muted">{text}</p>
      {action}
    </div>
  );
}
