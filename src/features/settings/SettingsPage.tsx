import {
  Check,
  CloudAlert,
  Copy,
  Download,
  LogOut,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Upload,
  Users,
} from "lucide-react";
import { useRef, useState } from "react";
import { undo } from "../../app/actions";
import { isIOS, isStandalone, useInstallPrompt } from "../../app/install";
import { store, useAppState } from "../../app/store";
import { backupFileName, BackupError, createBackup, downloadJson, parseBackup } from "../../data/backup";
import { isFirebaseConfigured } from "../../data/sync/firebaseConfig";
import { generateSyncCode, normalizeSyncCode } from "../../data/sync/firebaseSync";
import { Button } from "../../ui/Button";
import { Alert, Badge, Card, SectionTitle } from "../../ui/display";
import { Field, Segmented, TextInput } from "../../ui/form";
import { useConfirm } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";

function timeAgo(timestamp?: number | string): string {
  if (!timestamp) return "nunca";
  const ms = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "agora há pouco";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} dia${days > 1 ? "s" : ""}`;
}

function Sharing() {
  const device = useAppState((s) => s.device);
  const sync = useAppState((s) => s.sync);
  const confirm = useConfirm();
  const toast = useToast();
  const [codeInput, setCodeInput] = useState("");
  const [name, setName] = useState(device.deviceName ?? "");
  const [copied, setCopied] = useState(false);
  const configured = isFirebaseConfigured();

  const saveName = () => {
    if ((device.deviceName ?? "") !== name.trim()) store.updateDevice({ deviceName: name.trim() || undefined });
  };

  const join = (code: string) => {
    const normalized = normalizeSyncCode(code);
    if (normalized.length < 4) {
      toast({ tone: "error", message: "O código precisa ter pelo menos 4 letras ou números." });
      return;
    }
    saveName();
    store.joinRoom(normalized);
    setCodeInput("");
  };

  const leave = async () => {
    const ok = await confirm({
      title: "Parar de compartilhar?",
      message:
        "Este aparelho deixa de receber e enviar alterações. Os dados que estão aqui continuam salvos. Alterações ainda não enviadas serão descartadas.",
      confirmLabel: "Parar de compartilhar",
      tone: "danger",
    });
    if (ok) store.leaveRoom();
  };

  const copy = async () => {
    if (!device.syncCode) return;
    await navigator.clipboard?.writeText(device.syncCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    if (!device.syncCode) return;
    if (navigator.share) {
      await navigator.share({ title: "Controle Financeiro", text: `Código para compartilharmos as finanças: ${device.syncCode}` }).catch(() => {});
    } else {
      await copy();
    }
  };

  const statusText = {
    off: "Desligado",
    unconfigured: "Firebase não configurado",
    connecting: "Conectando…",
    online: sync.pending > 0 ? `Enviando ${sync.pending} alteração(ões)…` : "Sincronizado",
    offline: sync.pending > 0 ? `Sem internet · ${sync.pending} alteração(ões) aguardando` : "Sem internet",
    error: "Erro",
  }[sync.phase];

  return (
    <Card>
      <SectionTitle
        title="Compartilhamento"
        description="Use o mesmo código em dois aparelhos para verem e editarem os mesmos dados em tempo real."
      />
      {!configured && (
        <Alert tone="warning" icon={CloudAlert} title="Firebase não configurado">
          Defina as variáveis <code>VITE_FIREBASE_*</code> no arquivo <code>.env</code> e gere o app de novo.
        </Alert>
      )}

      <div className="space-y-4">
        <Field label="Seu nome" hint="Aparece para a outra pessoa quando você altera algo.">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} placeholder="Ex.: Jeziel" maxLength={30} />
        </Field>

        {device.syncCode ? (
          <>
            <div className="rounded-2xl bg-surface-2 p-4">
              <p className="text-sm text-muted">Código ativo</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-wider text-fg">{device.syncCode}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copy}>
                  {copied ? "Copiado" : "Copiar"}
                </Button>
                <Button size="sm" variant="secondary" icon={Share2} onClick={share}>
                  Enviar
                </Button>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-[15px]">
              <div>
                <dt className="text-sm text-muted">Situação</dt>
                <dd className="font-medium text-fg">{statusText}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Última sincronização</dt>
                <dd className="font-medium text-fg">{timeAgo(sync.lastSyncedAt)}</dd>
              </div>
            </dl>
            {sync.phase === "error" && (
              <Alert
                tone="negative"
                icon={CloudAlert}
                title="Não foi possível sincronizar"
                action={
                  <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => store.retrySync()}>
                    Tentar de novo
                  </Button>
                }
              >
                {sync.error}
              </Alert>
            )}
            <Button variant="ghost" icon={LogOut} className="text-negative" onClick={leave}>
              Parar de compartilhar neste aparelho
            </Button>
          </>
        ) : (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                join(codeInput);
              }}
            >
              <label className="sr-only" htmlFor="sync-code">
                Código de compartilhamento
              </label>
              <TextInput
                id="sync-code"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="Código recebido"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="font-mono"
                disabled={!configured}
              />
              <Button type="submit" disabled={!configured || !codeInput.trim()}>
                Entrar
              </Button>
            </form>
            <Button variant="secondary" block icon={Users} disabled={!configured} onClick={() => join(generateSyncCode())}>
              Criar um código novo
            </Button>
            <p className="text-sm text-muted">
              Ao entrar, os dados deste aparelho são somados aos que já estão no código — nada é apagado.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function Backup() {
  const data = useAppState((s) => s.data);
  const lastBackupAt = useAppState((s) => s.lastBackupAt);
  const confirm = useConfirm();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const daysSince = lastBackupAt ? (Date.now() - new Date(lastBackupAt).getTime()) / 86_400_000 : Infinity;

  const exportBackup = () => {
    downloadJson(backupFileName(), createBackup(data));
    store.markBackupDone();
    toast({ tone: "success", message: "Backup baixado" });
  };

  const importBackup = async (file: File) => {
    try {
      const imported = parseBackup(await file.text());
      const counts = `${Object.keys(imported.invoices).length} faturas, ${Object.keys(imported.bills).length} contas, ${Object.keys(imported.incomes).length} rendas e ${Object.keys(imported.plans).length} compras planejadas`;
      const ok = await confirm({
        title: "Restaurar este backup?",
        message: `O arquivo tem ${counts}. Ele vai substituir os dados atuais${store.getState().device.syncCode ? " — inclusive para quem compartilha o código com você" : ""}.`,
        confirmLabel: "Restaurar",
        tone: "danger",
      });
      if (!ok) return;
      const undoPatch = store.replaceAll(imported);
      toast({ tone: "success", message: "Backup restaurado", action: { label: "Desfazer", onClick: () => undo(undoPatch) } });
    } catch (error) {
      toast({ tone: "error", message: error instanceof BackupError ? error.message : "Não foi possível ler o arquivo." });
    }
  };

  return (
    <Card>
      <SectionTitle
        title="Backup"
        description="Arquivo com tudo: rendas, contas, faturas com todos os lançamentos e marcações, e compras planejadas."
      />
      {daysSince > 30 && (
        <div className="mb-4">
          <Alert tone="warning" icon={ShieldCheck} title={lastBackupAt ? "Faz tempo desde o último backup" : "Você ainda não fez backup"}>
            O iPhone pode apagar dados de apps web que ficam sem uso. Guarde uma cópia de vez em quando.
          </Alert>
        </div>
      )}
      <p className="mb-3 text-sm text-muted">Último backup: {timeAgo(lastBackupAt)}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button icon={Download} onClick={exportBackup}>
          Baixar backup
        </Button>
        <Button variant="secondary" icon={Upload} onClick={() => input.current?.click()}>
          Restaurar de um arquivo
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importBackup(file);
        }}
      />
    </Card>
  );
}

function Appearance() {
  const theme = useAppState((s) => s.device.theme);
  return (
    <Card>
      <SectionTitle title="Aparência" />
      <Segmented
        label="Tema"
        value={theme}
        onChange={(value) => store.updateDevice({ theme: value })}
        options={[
          { value: "dark", label: "Escuro" },
          { value: "light", label: "Claro" },
          { value: "system", label: "Automático" },
        ]}
      />
    </Card>
  );
}

function Install() {
  const { canPrompt, prompt } = useInstallPrompt();
  if (isStandalone()) return null;
  if (!canPrompt && !isIOS()) return null;
  return (
    <Card>
      <SectionTitle title="Instalar o app" description="Abre em tela cheia, como um aplicativo, direto da tela inicial." />
      {canPrompt ? (
        <Button icon={Smartphone} onClick={prompt}>
          Instalar
        </Button>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-[15px] text-fg">
          <li>No Safari, toque em Compartilhar (quadrado com seta para cima).</li>
          <li>Escolha “Adicionar à Tela de Início”.</li>
          <li>Toque em “Adicionar”.</li>
        </ol>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Sharing />
      <Backup />
      <Appearance />
      <Install />
      <p className="flex items-center justify-center gap-2 text-sm text-muted">
        Controle Financeiro <Badge>v{__APP_VERSION__}</Badge>
      </p>
    </div>
  );
}
