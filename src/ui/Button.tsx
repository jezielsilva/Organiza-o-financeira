import { forwardRef, type ButtonHTMLAttributes, type ElementType, type ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110 active:brightness-95",
  secondary: "bg-surface text-fg hover:bg-surface-2 border border-line",
  ghost: "text-fg hover:bg-surface-2",
  danger: "bg-negative text-white hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-[15px] gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ElementType;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon: Icon, block, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold transition disabled:opacity-50 select-none",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className="size-[1.1em] shrink-0" aria-hidden />}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obrigatório: nome acessível (leitor de tela) e dica ao passar o mouse. */
  label: string;
  icon: ElementType;
  tone?: "default" | "danger";
  size?: "sm" | "md";
  children?: ReactNode;
}

export function IconButton({ label, icon: Icon, tone = "default", size = "md", className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-full text-muted transition hover:bg-surface-2 disabled:opacity-40",
        size === "md" ? "size-11" : "size-9",
        tone === "danger" ? "hover:text-negative" : "hover:text-fg",
        className,
      )}
      {...rest}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
