import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "./Button";
import { IconButton } from "./Button";

/**
 * Folha (bottom sheet no celular, diálogo centralizado no desktop) baseada no
 * elemento nativo <dialog>: foco preso, Esc para fechar, fundo inerte e
 * devolução do foco ao fechar — sem bibliotecas.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Se informado, o conteúdo vira um <form> (Enter envia). */
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Sincroniza a cada render: se o diálogo foi fechado por fora (ex.: navegador), reabre quando preciso.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // O <dialog> foca o primeiro botão (o "Fechar"); em formulários, o primeiro campo é mais útil.
      dialog.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  });

  const body = (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 pt-4 pb-3">
        <div className="min-w-0 pt-1.5">
          <h2 id={titleId} className="text-lg font-semibold text-fg">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        <IconButton label="Fechar" icon={X} onClick={onClose} />
      </div>
      <div className="max-h-[65dvh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="pb-safe flex gap-2 border-t border-line px-5 py-3">{footer}</div>}
    </>
  );

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open &&
        (onSubmit ? (
          <form
            noValidate
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            {body}
          </form>
        ) : (
          body
        ))}
    </dialog>
  );
}

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
}

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    [],
  );

  const close = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet
        open={request !== null}
        onClose={() => close(false)}
        title={request?.title ?? ""}
        footer={
          <>
            <Button variant="secondary" block onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button variant={request?.tone === "danger" ? "danger" : "primary"} block onClick={() => close(true)}>
              {request?.confirmLabel ?? "Confirmar"}
            </Button>
          </>
        }
      >
        <div className="text-[0.9375rem] text-muted">{request?.message}</div>
      </Sheet>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
