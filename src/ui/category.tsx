import {
  Briefcase,
  Car,
  Clapperboard,
  HeartPulse,
  House,
  PawPrint,
  Receipt,
  Repeat,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Tag,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { cn } from "./cn";

/** Cor e ícone de cada categoria — os mesmos no gráfico, na lista e no orçamento. */
const STYLES: Record<string, { color: string; icon: LucideIcon }> = {
  Compras: { color: "#9b8afb", icon: ShoppingBag },
  Mercado: { color: "#d4f36b", icon: ShoppingCart },
  Alimentação: { color: "#f6c26b", icon: UtensilsCrossed },
  Lazer: { color: "#ff7a45", icon: Clapperboard },
  Transporte: { color: "#3cc7b6", icon: Car },
  Assinaturas: { color: "#7cc4ff", icon: Repeat },
  Saúde: { color: "#ff8fb1", icon: HeartPulse },
  Vestuário: { color: "#e6a8ff", icon: Shirt },
  Casa: { color: "#c9a77b", icon: House },
  Pets: { color: "#ffd166", icon: PawPrint },
  Tarifas: { color: "#8c8c96", icon: Receipt },
  Outros: { color: "#6e6d76", icon: Tag },
};

export function categoryStyle(category: string) {
  return STYLES[category] ?? { color: "#6e6d76", icon: Briefcase };
}

export function CategoryIcon({ category, size = "md", muted }: { category: string; size?: "sm" | "md"; muted?: boolean }) {
  const { color, icon: Icon } = categoryStyle(category);
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl",
        size === "md" ? "size-11" : "size-9",
      )}
      style={{ background: muted ? "var(--app-surface-2)" : `${color}26`, color: muted ? "var(--app-muted)" : color }}
    >
      <Icon className={size === "md" ? "size-5" : "size-4"} />
    </span>
  );
}
