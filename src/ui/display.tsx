import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { formatBRL, formatSignedBRL, type Cents } from "../domain/money";
import { cn } from "./cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-3xl border border-line bg-surface p-5 sm:p-6", className)} {...rest} />;
}

export function SectionTitle({
  title,
  description,
  action,
  as: Tag = "h2",
  id,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  as?: "h2" | "h3";
  id?: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Tag id={id} className={cn("font-bold tracking-tight text-fg", Tag === "h2" ? "text-lg" : "text-base")}>
          {title}
        </Tag>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

type Tone = "neutral" | "positive" | "negative" | "warning" | "accent";

const toneText: Record<Tone, string> = {
  neutral: "text-fg",
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
  accent: "text-accent",
};

const toneBadge: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  positive: "bg-positive-soft text-positive border-transparent",
  negative: "bg-negative-soft text-negative border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  accent: "bg-accent-soft text-accent border-transparent",
};

export function Money({
  cents,
  signed,
  tone,
  className,
}: {
  cents: Cents;
  signed?: boolean;
  tone?: Tone | "auto";
  className?: string;
}) {
  const resolved: Tone = tone === "auto" ? (cents < 0 ? "negative" : cents > 0 ? "positive" : "neutral") : tone ?? "neutral";
  return (
    <span className={cn("tabular whitespace-nowrap", tone && toneText[resolved], className)}>
      {signed ? formatSignedBRL(cents) : formatBRL(cents)}
    </span>
  );
}

/** Valor em destaque com os centavos esmaecidos: "R$ 2.913,15". */
export function BigMoney({
  cents,
  size = "lg",
  className,
  centsClassName = "text-muted/70",
}: {
  cents: Cents;
  size?: "md" | "lg" | "xl";
  className?: string;
  centsClassName?: string;
}) {
  const text = formatBRL(Math.abs(cents));
  const comma = text.lastIndexOf(",");
  const main = (cents < 0 ? "− " : "") + text.slice(0, comma);
  const fraction = text.slice(comma);
  const sizes = {
    md: ["text-3xl", "text-xl"],
    lg: ["text-[2.6rem]", "text-2xl"],
    xl: ["text-5xl sm:text-6xl", "text-3xl"],
  }[size];
  return (
    <span className={cn("tabular font-display leading-none font-semibold tracking-tight whitespace-nowrap", className)}>
      <span className={sizes[0]}>{main}</span>
      <span className={cn(sizes[1], centsClassName)}>{fraction}</span>
    </span>
  );
}

export function Badge({
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ElementType;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneBadge[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  max,
  label,
  tone = "accent",
  className,
}: {
  value: number;
  max: number;
  label: string;
  tone?: "accent" | "positive" | "negative" | "warning";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = { accent: "bg-accent", positive: "bg-positive", negative: "bg-negative", warning: "bg-warning" }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ElementType;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
        <Icon className="size-6" aria-hidden />
      </div>
      <div>
        <p className="font-semibold text-fg">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Alert({
  tone = "warning",
  icon: Icon,
  title,
  children,
  action,
}: {
  tone?: "warning" | "negative" | "positive" | "accent";
  icon: ElementType;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const styles = {
    warning: "bg-warning-soft text-warning",
    negative: "bg-negative-soft text-negative",
    positive: "bg-positive-soft text-positive",
    accent: "bg-accent-soft text-accent",
  }[tone];
  return (
    <div role={tone === "negative" ? "alert" : "status"} className={cn("flex gap-3 rounded-2xl p-4", styles)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 text-sm text-fg/80">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
