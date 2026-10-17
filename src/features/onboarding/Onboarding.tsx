import { ArrowLeft, ArrowRight, Coins, FileUp, Plus, Trash2, Users } from "lucide-react";
import { useRef, useState } from "react";
import { navigate } from "../../app/router";
import { store } from "../../app/store";
import { currentMonth } from "../../domain/month";
import { newId } from "../../domain/types";
import { BackupError, parseBackup } from "../../data/backup";
import type { Patch } from "../../data/patch";
import { isFirebaseConfigured } from "../../data/sync/firebaseConfig";
import { normalizeSyncCode } from "../../data/sync/firebaseSync";
import { Button, IconButton } from "../../ui/Button";
import { Alert, Card } from "../../ui/display";
import { Field, MoneyInput, TextInput } from "../../ui/form";

type Step = "welcome" | "join" | "incomes" | "bills";

interface Row {
  key: string;
  name: string;
  amount: number | null;
  dueDay: string;
}

const emptyRow = (): Row => ({ key: newId("r"), name: "", amount: null, dueDay: "10" });

function RowsEditor({
  rows,
  setRows,
  withDueDay,
  namePlaceholder,
  addLabel,
}: {
  rows: Row[];
  setRows: (rows: Row[]) => void;
  withDueDay?: boolean;
  namePlaceholder: string;
  addLabel: string;
}) {
  const update = (key: string, patch: Partial<Row>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <fieldset key={row.key} className="rounded-2xl border border-line p-3">
          <legend className="sr-only">Item {index + 1}</legend>
          <div className="flex items-end gap-2">
            <Field label="Nome" className="flex-1">
              <TextInput value={row.name} onChange={(e) => update(row.key, { name: e.target.value })} placeholder={namePlaceholder} />
            </Field>
            {rows.length > 1 && (
              <IconButton label={`Remover item ${index + 1}`} icon={Trash2} tone="danger" onClick={() => setRows(rows.filter((r) => r.key !== row.key))} />
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Valor por mês" className={withDueDay ? "" : "col-span-2"}>
              <MoneyInput value={row.amount} onChange={(v) => update(row.key, { amount: v })} />
            </Field>
            {withDueDay && (
              <Field label="Dia do vencimento">
                <TextInput
                  inputMode="numeric"
                  value={row.dueDay}
                  onChange={(e) => update(row.key, { dueDay: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                />
              </Field>
            )}
          </div>
        </fieldset>
      ))}
      <Button variant="ghost" icon={Plus} onClick={() => setRows([...rows, emptyRow()])}>
        {addLabel}
      </Button>
    </div>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState<Step>("welcome");
  const [incomes, setIncomes] = useState<Row[]>([emptyRow()]);
  const [bills, setBills] = useState<Row[]>([emptyRow()]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  const finish = () => {
    const month = currentMonth();
    const patch: Patch = {};
    for (const row of incomes) {
      if (!row.name.trim() || !row.amount) continue;
      const id = newId("inc");
      patch[`incomes/${id}`] = { id, label: row.name.trim(), amountCents: row.amount, recurrence: "monthly", startMonth: month };
    }
    for (const row of bills) {
      if (!row.name.trim() || !row.amount) continue;
      const id = newId("bill");
      const dueDay = Math.min(31, Math.max(1, Number(row.dueDay) || 1));
      patch[`bills/${id}`] = { id, name: row.name.trim(), amountCents: row.amount, dueDay, category: "Outros", active: true };
    }
    store.commit(patch);
    store.completeOnboarding();
    navigate("inicio");
  };

  const join = () => {
    const normalized = normalizeSyncCode(code);
    if (normalized.length < 4) {
      setError("Digite o código que a outra pessoa enviou (pelo menos 4 letras ou números).");
      return;
    }
    if (name.trim()) store.updateDevice({ deviceName: name.trim() });
    store.joinRoom(normalized);
    store.completeOnboarding();
    navigate("inicio");
  };

  const restore = async (file: File) => {
    try {
      store.replaceAll(parseBackup(await file.text()));
      store.completeOnboarding();
      navigate("inicio");
    } catch (e) {
      setError(e instanceof BackupError ? e.message : "Não foi possível ler o arquivo de backup.");
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg sm:p-8">
        {step === "welcome" && (
          <div className="space-y-6">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-fg">
              <Coins className="size-7" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-fg">Controle Financeiro</h1>
              <p className="mt-2 text-[15px] text-muted">
                Importe a fatura do cartão, cadastre renda e contas fixas, e veja quanto sobra neste mês e nos próximos.
              </p>
            </div>
            {error && <Alert tone="negative" icon={FileUp} title={error} />}
            <div className="space-y-2">
              <Button block size="lg" icon={ArrowRight} onClick={() => setStep("incomes")}>
                Começar
              </Button>
              {isFirebaseConfigured() && (
                <Button block size="lg" variant="secondary" icon={Users} onClick={() => setStep("join")}>
                  Já uso em outro aparelho
                </Button>
              )}
              <Button block size="lg" variant="ghost" icon={FileUp} onClick={() => backupInput.current?.click()}>
                Restaurar um backup
              </Button>
              <input
                ref={backupInput}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void restore(file);
                }}
              />
            </div>
          </div>
        )}

        {step === "join" && (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
          >
            <div>
              <h1 className="text-xl font-bold text-fg">Entrar com um código</h1>
              <p className="mt-1 text-[15px] text-muted">
                Em Ajustes, no outro aparelho, está o código de compartilhamento. Digite-o aqui.
              </p>
            </div>
            <Field label="Código" error={error ?? undefined}>
              <TextInput value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} className="font-mono" autoFocus />
            </Field>
            <Field label="Seu nome (opcional)" hint="Aparece para a outra pessoa quando você altera algo.">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
            </Field>
            <div className="flex gap-2">
              <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep("welcome")}>
                Voltar
              </Button>
              <Button type="submit" className="ml-auto">
                Entrar
              </Button>
            </div>
          </form>
        )}

        {step === "incomes" && (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-accent">Passo 1 de 2</p>
              <h1 className="mt-1 text-xl font-bold text-fg">Quanto entra por mês?</h1>
              <p className="mt-1 text-[15px] text-muted">Salário e outras rendas fixas. Dá para mudar depois.</p>
            </div>
            <RowsEditor rows={incomes} setRows={setIncomes} namePlaceholder="Ex.: Salário" addLabel="Outra renda" />
            <div className="flex gap-2">
              <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep("welcome")}>
                Voltar
              </Button>
              <Button className="ml-auto" icon={ArrowRight} onClick={() => setStep("bills")}>
                Próximo
              </Button>
            </div>
          </div>
        )}

        {step === "bills" && (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-accent">Passo 2 de 2</p>
              <h1 className="mt-1 text-xl font-bold text-fg">Contas fixas</h1>
              <p className="mt-1 text-[15px] text-muted">Aluguel, luz, internet, escola… o que se repete todo mês.</p>
            </div>
            <RowsEditor rows={bills} setRows={setBills} withDueDay namePlaceholder="Ex.: Aluguel" addLabel="Outra conta" />
            <div className="flex gap-2">
              <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep("incomes")}>
                Voltar
              </Button>
              <Button className="ml-auto" onClick={finish}>
                Concluir
              </Button>
            </div>
          </div>
        )}
      </Card>
    </main>
  );
}
