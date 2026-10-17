import {
  cloneElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { formatBRL, type Cents } from "../domain/money";
import { cn } from "./cn";

const inputBase =
  "h-12 w-full rounded-2xl border bg-surface-2 px-3.5 text-base text-fg placeholder:text-muted/70 transition focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent";

/** Rótulo + dica + erro ligados ao campo por id (acessível a leitores de tela). */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactElement<Record<string, unknown>>;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-sm font-medium text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, "border-line aria-invalid:border-negative", className)} {...rest} />;
}

/**
 * Campo de dinheiro no padrão de app de banco: o usuário digita só números e
 * eles preenchem da direita para a esquerda (1 → R$ 0,01; 1234 → R$ 12,34).
 * Abre o teclado numérico no celular e nunca confunde vírgula com ponto.
 */
export function MoneyInput({
  value,
  onChange,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: Cents | null;
  onChange: (cents: Cents | null) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="R$ 0,00"
      value={value === null ? "" : formatBRL(Math.abs(value))}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 11);
        onChange(digits ? Number(digits) : null);
      }}
      className={cn(inputBase, "tabular border-line aria-invalid:border-negative", className)}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputBase, "appearance-none border-line bg-surface pr-9", className)} {...rest}>
      {children}
    </select>
  );
}

/** Grupo de opções exclusivas (ex.: Mensal / Avulsa). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: NoInfer<T>; label: string }>;
  onChange: (value: NoInfer<T>) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full border border-line bg-surface p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-10 flex-1 rounded-full px-3 text-sm font-semibold transition",
              selected ? "bg-fg text-bg" : "text-muted hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <span id={`${id}-label`} className="block text-[15px] font-medium text-fg">
          {label}
        </span>
        {description && (
          <span id={`${id}-desc`} className="block text-sm text-muted">
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-line",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}
