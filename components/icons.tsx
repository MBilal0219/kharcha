import {
  ArrowLeftRight, Bus, Car, CircleHelp, Coffee, Coins, Egg, Ellipsis, Fuel, HandCoins, PiggyBank, Plus, ShoppingBag,
  Smartphone, Soup, Sparkles, TramFront, Wallet, Gift, Heart, Shirt, BookOpen, Pill, Scissors, Utensils, ShoppingCart, ReceiptText,
  BriefcaseBusiness, Laptop, House, type LucideIcon,
} from "lucide-react";
import type { Category, Tx } from "@/lib/types";
import { cx } from "./ui";

export const ICONS: Record<string, LucideIcon> = {
  egg: Egg,
  soup: Soup,
  coffee: Coffee,
  bus: Bus,
  tram: TramFront,
  phone: Smartphone,
  bag: ShoppingBag,
  fuel: Fuel,
  help: CircleHelp,
  dots: Ellipsis,
  coins: Coins,
  car: Car,
  sparkles: Sparkles,
  plus: Plus,
  gift: Gift,
  heart: Heart,
  shirt: Shirt,
  book: BookOpen,
  pill: Pill,
  scissors: Scissors,
  food: Utensils,
  cart: ShoppingCart,
  receipt: ReceiptText,
  briefcase: BriefcaseBusiness,
  laptop: Laptop,
  home: House,
};
export const ICON_CHOICES = Object.keys(ICONS);

export function CatIcon({ name, size = 18 }: { name?: string; size?: number }) {
  const I = (name && ICONS[name]) || Ellipsis;
  return <I size={size} strokeWidth={2} />;
}

/** Round badge used in lists: colour carries type, the icon carries category. */
export function TxBadge({ tx, category, size = 40 }: { tx: Tx; category?: Category; size?: number }) {
  let icon: React.ReactNode;
  let tone = "bg-surface-2 text-ink-2";
  if (tx.type === "expense") icon = <CatIcon name={category?.icon} />;
  else if (tx.type === "income") {
    icon = <CatIcon name={category?.icon} />;
    tone = "bg-accent-soft text-accent";
  } else if (tx.type === "saving" || tx.type === "saving_withdraw") {
    icon = <PiggyBank size={18} />;
    tone = "bg-gold-soft text-gold";
  } else if (tx.type === "transfer") icon = <ArrowLeftRight size={18} />;
  else {
    icon = <HandCoins size={18} />;
    tone = "bg-danger-soft text-danger";
  }
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-2xl", tone)} style={{ width: size, height: size }}>
      {icon}
    </span>
  );
}

export { Wallet as WalletIcon };
