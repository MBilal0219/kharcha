"use client";

import { cleanAmountInput, currencyDecimals, currencySymbol } from "@/lib/money";
import { cx, inputClass } from "./ui";

/** Money field typed with the device's own keyboard. `value` is the text as typed; parse it with parseAmount(). */
export function AmountInput({
  id,
  value,
  onChange,
  onBlur,
  currency,
  size = "md",
  autoFocus,
  placeholder = "0",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  currency?: string;
  size?: "md" | "lg" | "xl";
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const symbol = currencySymbol(currency);
  return (
    <div className="relative">
      <span
        className={cx(
          "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-muted",
          size === "xl" ? "text-xl" : "text-sm",
        )}
      >
        {symbol}
      </span>
      <input
        id={id}
        inputMode={currencyDecimals(currency) ? "decimal" : "numeric"}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(cleanAmountInput(e.target.value, currency))}
        onBlur={onBlur}
        style={{ paddingLeft: `${1.6 + symbol.length * (size === "xl" ? 0.85 : 0.6)}rem` }}
        className={cx(
          inputClass,
          "tnum",
          size === "lg" && "text-2xl font-semibold",
          size === "xl" && "h-20 font-display text-[2.6rem] font-bold tracking-tight",
        )}
      />
    </div>
  );
}
