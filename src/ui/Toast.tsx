import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

interface ToastOptions {
  message: string;
  tone?: "default" | "success" | "error";
  /** Ex.: { label: "Desfazer", onClick } */
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { ...options, id }]);
      window.setTimeout(() => dismiss(id), options.duration ?? (options.action ? 6000 : 3500));
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((toast) => {
          const Icon = toast.tone === "error" ? TriangleAlert : toast.tone === "success" ? CheckCircle2 : Info;
          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-fg py-3 pr-2 pl-4 text-bg shadow-xl"
            >
              <Icon
                className={cn("size-5 shrink-0", toast.tone === "error" ? "text-negative" : "text-accent")}
                aria-hidden
              />
              <p className="flex-1 text-[15px]">{toast.message}</p>
              {toast.action && (
                <button
                  type="button"
                  className="h-10 shrink-0 rounded-xl px-3 text-[15px] font-semibold text-bg underline underline-offset-4 hover:bg-bg/10"
                  onClick={() => {
                    toast.action!.onClick();
                    dismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
