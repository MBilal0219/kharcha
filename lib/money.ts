// Money is stored as an integer number of hundredths in every currency, so changing currency
// relabels amounts without rescaling them. The currency only decides the symbol and how many decimals show.

export const CURRENCIES: { code: string; name: string }[] = [
  { code: "PKR", name: "Pakistani rupee" },
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British pound" },
  { code: "INR", name: "Indian rupee" },
  { code: "AED", name: "UAE dirham" },
  { code: "SAR", name: "Saudi riyal" },
  { code: "QAR", name: "Qatari riyal" },
  { code: "KWD", name: "Kuwaiti dinar" },
  { code: "OMR", name: "Omani rial" },
  { code: "BHD", name: "Bahraini dinar" },
  { code: "BDT", name: "Bangladeshi taka" },
  { code: "LKR", name: "Sri Lankan rupee" },
  { code: "NPR", name: "Nepalese rupee" },
  { code: "AFN", name: "Afghan afghani" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "AUD", name: "Australian dollar" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "SGD", name: "Singapore dollar" },
  { code: "MYR", name: "Malaysian ringgit" },
  { code: "IDR", name: "Indonesian rupiah" },
  { code: "PHP", name: "Philippine peso" },
  { code: "THB", name: "Thai baht" },
  { code: "CNY", name: "Chinese yuan" },
  { code: "JPY", name: "Japanese yen" },
  { code: "KRW", name: "South Korean won" },
  { code: "TRY", name: "Turkish lira" },
  { code: "EGP", name: "Egyptian pound" },
  { code: "NGN", name: "Nigerian naira" },
  { code: "KES", name: "Kenyan shilling" },
  { code: "ZAR", name: "South African rand" },
  { code: "CHF", name: "Swiss franc" },
  { code: "SEK", name: "Swedish krona" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "BRL", name: "Brazilian real" },
  { code: "MXN", name: "Mexican peso" },
];

interface Info {
  symbol: string;
  decimals: number;
}
const cache = new Map<string, Info>();

function info(code: string): Info {
  let i = cache.get(code);
  if (!i) {
    try {
      const f = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" });
      i = {
        symbol: f.formatToParts(1).find((p) => p.type === "currency")?.value ?? code,
        decimals: Math.min(f.resolvedOptions().maximumFractionDigits ?? 2, 2),
      };
    } catch {
      i = { symbol: code, decimals: 2 };
    }
    cache.set(code, i);
  }
  return i;
}

// The signed-in user's currency. Set by the app data provider; server code passes a code explicitly.
let current = "USD";
export function setCurrency(code: string) {
  current = code;
}

export function currencySymbol(code = current): string {
  return info(code).symbol;
}

/** How many decimals the currency is typed and shown with (0 for rupees or yen, 2 for dollars). */
export function currencyDecimals(code = current): number {
  return info(code).decimals;
}

/** "2,500" or "12.50": no symbol. Decimals show only when the amount has them. */
export function num(amount: number, code = current): string {
  const { decimals } = info(code);
  const major = Math.abs(amount) / 100;
  const whole = decimals === 0 || Math.round(major * 100) % 100 === 0;
  const text = major.toLocaleString("en", { minimumFractionDigits: whole ? 0 : decimals, maximumFractionDigits: decimals });
  return `${amount < 0 ? "−" : ""}${text}`;
}

/** "Rs 2,500", "$12.50". */
export function money(amount: number, code = current): string {
  const { symbol } = info(code);
  const gap = /[A-Za-z]$/.test(symbol) ? " " : "";
  return `${amount < 0 ? "−" : ""}${symbol}${gap}${num(Math.abs(amount), code)}`;
}

/** Parse what the user typed ("2,500", "12.5") into stored hundredths; 0 for junk. */
export function parseAmount(v: string, code = current): number {
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const scale = 10 ** info(code).decimals;
  return Math.round((Math.round(n * scale) / scale) * 100);
}

/** A stored amount as plain text for an input field: "2500", "12.5". */
export function toInput(amount: number): string {
  return String(amount / 100);
}

/** Keeps only what a money input may contain for the currency. */
export function cleanAmountInput(v: string, code = current): string {
  if (info(code).decimals === 0) return v.replace(/\D/g, "");
  const [int, ...rest] = v.replace(/[^\d.]/g, "").split(".");
  return rest.length ? `${int}.${rest.join("").slice(0, info(code).decimals)}` : int;
}

const REGION_CURRENCY: Record<string, string> = {
  PK: "PKR", US: "USD", GB: "GBP", IN: "INR", AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", OM: "OMR", BH: "BHD", BD: "BDT", LK: "LKR",
  NP: "NPR", AF: "AFN", CA: "CAD", AU: "AUD", NZ: "NZD", SG: "SGD", MY: "MYR", ID: "IDR", PH: "PHP", TH: "THB", CN: "CNY", JP: "JPY",
  KR: "KRW", TR: "TRY", EG: "EGP", NG: "NGN", KE: "KES", ZA: "ZAR", CH: "CHF", SE: "SEK", NO: "NOK", BR: "BRL", MX: "MXN",
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", BE: "EUR", IE: "EUR", PT: "EUR", AT: "EUR", FI: "EUR", GR: "EUR",
};
const ZONE_CURRENCY: Record<string, string> = {
  "Asia/Karachi": "PKR", "Asia/Kolkata": "INR", "Asia/Calcutta": "INR", "Asia/Dubai": "AED", "Asia/Riyadh": "SAR", "Asia/Dhaka": "BDT",
  "Europe/London": "GBP", "Asia/Qatar": "QAR", "Asia/Kuwait": "KWD",
};

/** Best guess for a new user's currency from their device. The time zone wins: phones are often set to US English. */
export function guessCurrency(timezone: string, locales: readonly string[]): string {
  if (ZONE_CURRENCY[timezone]) return ZONE_CURRENCY[timezone];
  for (const l of locales) {
    const region = l.split("-").find((p) => /^[A-Z]{2}$/.test(p));
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  }
  return "USD";
}
