/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { FixedBill, IncomeSource, CardInvoice, PlannedInstallment, MesCalculadoSalvo, AppStorageSchema } from "./types";
import { formatMonth, addMonths, getCurrentMonth } from "./utils";
import {
  fixedBillsStorage,
  incomesStorage,
  invoicesStorage,
  plannedInstallmentsStorage,
  configuracoesStorage,
  transacoesFixasStorage,
  mesesCalculadosStorage,
  saveAppState,
  loadAppState,
} from "./services/storageService";
import { calcularProjecao, rotacionarJanelaTemporal } from "./services/calculationEngine";
import { exportarBackupDoApp } from "./services/backupService";
import { pushToServer, pushDomainsToServer, MergedDomains, getSyncCode, isFirebaseConfigured, SyncStatus } from "./services/syncService";
import Dashboard from "./components/Dashboard";
import FixedBills from "./components/FixedBills";
import CardInvoices from "./components/CardInvoices";
import PlannedInstallments from "./components/PlannedInstallments";
import Reports from "./components/Reports";
import Onboarding from "./components/Onboarding";
import SyncManager from "./components/SyncManager";
import SyncPage from "./components/SyncPage";
import { LayoutDashboard, Wallet, CreditCard, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, Coins, Plus, Download, Share, Smartphone, Cloud, CloudOff, CloudUpload, WifiOff, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// --- Dados Iniciais de Demonstração (Caso o localStorage esteja vazio) ---
const INITIAL_BILLS: FixedBill[] = [
  { id: "bill-1", name: "Aluguel & Condomínio", value: 1650, dueDay: 5, category: "Moradia", active: true },
  { id: "bill-2", name: "Internet Fibra", value: 120, dueDay: 10, category: "Serviços", active: true },
  { id: "bill-3", name: "Netflix Premium", value: 55.9, dueDay: 15, category: "Assinaturas", active: true },
  { id: "bill-4", name: "Academia Convênio", value: 110, dueDay: 20, category: "Saúde", active: true },
];

const INITIAL_INCOMES: IncomeSource[] = [
  { id: "inc-1", label: "Salário Principal", value: 5800, month: getCurrentMonth() },
  { id: "inc-2", label: "Projeto Freelance Website", value: 1500, month: getCurrentMonth() },
  // Pré-cadastrado para os próximos meses para dar vida à projeção
  { id: "inc-3", label: "Salário Principal", value: 5800, month: addMonths(getCurrentMonth(), 1) },
  { id: "inc-4", label: "Salário Principal", value: 5800, month: addMonths(getCurrentMonth(), 2) },
];

const INITIAL_INVOICES: CardInvoice[] = [
  {
    id: "inv-demo-july",
    referenceMonth: getCurrentMonth(),
    uploadedAt: new Date().toISOString(),
    fileName: `fatura_nubank_${getCurrentMonth()}.pdf`,
    totalValue: 980,
    parsedAt: new Date().toISOString(),
    needsReview: false,
    purchases: [
      {
        id: "pur-1",
        description: "Supermercado Pão de Açúcar",
        category: "Alimentação",
        purchaseDate: `${getCurrentMonth()}-02`,
        totalValue: 350,
        isInstallment: false,
      },
      {
        id: "pur-2",
        description: "Posto Shell Combustível",
        category: "Transporte",
        purchaseDate: `${getCurrentMonth()}-05`,
        totalValue: 180,
        isInstallment: false,
      },
      {
        id: "pur-3",
        description: "Smartphone Xiaomi 10x",
        category: "Tecnologia",
        purchaseDate: `${addMonths(getCurrentMonth(), -3)}-10`,
        totalValue: 1200,
        isInstallment: true,
        installmentCurrent: 4,
        installmentTotal: 10,
        installmentValue: 120,
        installmentsRemaining: 6,
      },
      {
        id: "pur-4",
        description: "Curso de UI/UX Designer 12x",
        category: "Educação",
        purchaseDate: `${addMonths(getCurrentMonth(), -2)}-15`,
        totalValue: 1800,
        isInstallment: true,
        installmentCurrent: 3,
        installmentTotal: 12,
        installmentValue: 150,
        installmentsRemaining: 9,
      },
      {
        id: "pur-5",
        description: "Restaurante Outback",
        category: "Alimentação",
        purchaseDate: `${getCurrentMonth()}-08`,
        totalValue: 180,
        isInstallment: false,
      },
    ],
  },
];

const INITIAL_PLANNED: PlannedInstallment[] = [];

export default function App() {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth);
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [fabOpen, setFabOpen] = useState<boolean>(false);
  const [storageError, setStorageError] = useState<boolean>(false);
  // Versão dos dados — incrementada em cada mudança para disparar push de sincronização
  const [dataVersion, setDataVersion] = useState<number>(0);

  // ─── Estado de Sincronização (elevado para App para ser compartilhado entre SyncManager e SyncPage) ──
  const [syncCode, setSyncCodeState] = useState<string | null>(getSyncCode);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => {
    if (!isFirebaseConfigured()) return "not_configured";
    return getSyncCode() ? "synced" : "no_code";
  });

  // --- Estados do PWA Install Prompt ---
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState<boolean>(false);

  // ─── Verificação de Primeiro Acesso (schema v2) ────────────────────────────
  // Usa configuracoesStorage.isOnboardingCompleto() como fonte de verdade.
  // Fallback: checa também as chaves legadas (fin_*) para usuários antigos.
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    const completoV2 = configuracoesStorage.isOnboardingCompleto();
    if (completoV2) return false;
    // Fallback para dados legados (usuários que tinham dados antes desta versão)
    const legacyBills = localStorage.getItem("fin_fixed_bills");
    const legacyIncomes = localStorage.getItem("fin_incomes");
    return !legacyBills && !legacyIncomes;
  });

  // ─── Projeção de 12 Meses com Rotação Temporal (Rolling Window) ────────────
  const [mesesCalculados, setMesesCalculados] = useState<MesCalculadoSalvo[]>(() => {
    const meses = mesesCalculadosStorage.load();
    if (meses.length === 0) return [];
    
    // Obtém o mês atual do sistema do usuário
    const mesAtual = getCurrentMonth();
    
    // Carrega dados base de receitas e despesas
    const v2 = transacoesFixasStorage.load();
    const rendaMensal = v2.rendas.reduce((acc, r) => acc + r.value, 0);
    const custoFixo = v2.contasFixas.filter(c => c.active).reduce((acc, c) => acc + c.value, 0);
    
    // Rotaciona a projeção caso tenhamos mudado de mês/ano
    const rotacionados = rotacionarJanelaTemporal(meses, mesAtual, rendaMensal, custoFixo);
    
    // Se houve rotação (elementos mudaram), atualiza o localStorage de forma atômica
    if (JSON.stringify(meses) !== JSON.stringify(rotacionados)) {
      try {
        mesesCalculadosStorage.save(rotacionados);
      } catch (e) {
        console.error("Erro ao salvar rotação temporal:", e);
      }
    }
    
    return rotacionados;
  });

  // ─── Inicialização dos Estados — schema v2 tem prioridade sobre dados legados ─
  const [fixedBills, setFixedBills] = useState<FixedBill[]>(() => {
    const v2 = transacoesFixasStorage.load();
    if (v2.contasFixas.length > 0) return v2.contasFixas;
    return fixedBillsStorage.getAll([]); // fallback legado
  });

  const [incomes, setIncomes] = useState<IncomeSource[]>(() => {
    const v2 = transacoesFixasStorage.load();
    if (v2.rendas.length > 0) return v2.rendas;
    return incomesStorage.getAll([]); // fallback legado
  });

  const [invoices, setInvoices] = useState<CardInvoice[]>(() => {
    return invoicesStorage.getAll(INITIAL_INVOICES);
  });

  const [plannedInstallments, setPlannedInstallments] = useState<PlannedInstallment[]>(() => {
    return plannedInstallmentsStorage.getAll(INITIAL_PLANNED);
  });

  // ─── Conclusão do Onboarding ────────────────────────────────────────────────
  // 1. Chama o Motor de Cálculo para gerar a projeção de 12 meses.
  // 2. Persiste os 3 domínios do schema definitivo atomicamente.
  // 3. Atualiza o estado global e fecha a tela de onboarding.
  const handleOnboardingComplete = (newIncomes: IncomeSource[], newBills: FixedBill[]) => {
    const mesAtual = getCurrentMonth();

    // Motor de Cálculo — função pura, sem valores fictícios
    const projecao = calcularProjecao({
      mesInicial: mesAtual,
      rendas: newIncomes,
      contasFixas: newBills,
    });

    // Persiste os 3 domínios no localStorage
    saveAppState(mesAtual, newIncomes, newBills, projecao.meses);

    // Atualiza o estado global do app
    setIncomes(newIncomes);
    setFixedBills(newBills);
    setMesesCalculados(projecao.meses);
    setShowOnboarding(false);
  };

  // ─── PWA: Escuta o evento beforeinstallprompt e detecta iOS ───────────────────
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Previne que o Chrome exiba o banner padrão imediatamente
      e.preventDefault();
      // Salva o evento para disparar quando o usuário clicar no botão
      setDeferredPrompt(e);
      // Mostra o botão/banner de instalação
      setShowInstallBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Detecta se o dispositivo é iOS/Safari
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    // Verifica se NÃO está rodando no modo instalado (standalone)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;

    if (isIOSDevice && !isStandalone) {
      setIsIOS(true);
      setShowInstallBanner(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      // Exibe modal explicativo para iOS/Safari
      setShowIOSInstructions(true);
    } else if (deferredPrompt) {
      // Dispara o prompt nativo do Android/Chrome
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        console.log("Usuário aceitou a instalação do PWA.");
      }
      setDeferredPrompt(null);
      setShowInstallBanner(false);
    }
  };

  // ─── Sync Check (Resiliência contra limpeza do cache do SO) ──────────────────
  // Toda vez que a janela ganha foco (ex: usuário minimizou e voltou),
  // valida e recarrega os dados do storage para garantir que não sumiram.
  useEffect(() => {
    const checkSyncIntegrity = () => {
      const state = loadAppState();
      if (state) {
        // Se a config do storage existe e onboarding está completo, garante sincronia
        setIncomes((prev) => 
          JSON.stringify(prev) !== JSON.stringify(state.transacoes_fixas.rendas)
            ? state.transacoes_fixas.rendas 
            : prev
        );
        setFixedBills((prev) => 
          JSON.stringify(prev) !== JSON.stringify(state.transacoes_fixas.contasFixas)
            ? state.transacoes_fixas.contasFixas 
            : prev
        );
        setMesesCalculados((prev) => 
          JSON.stringify(prev) !== JSON.stringify(state.meses_calculados)
            ? state.meses_calculados 
            : prev
        );
        setShowOnboarding(false);
      } else {
        // Se o storage foi limpo de forma agressiva pelo SO, restabelece o onboarding
        const completoV2 = configuracoesStorage.isOnboardingCompleto();
        if (!completoV2) {
          setShowOnboarding(true);
        }
      }
    };

    window.addEventListener("focus", checkSyncIntegrity);
    // Executa uma verificação ativa na montagem
    checkSyncIntegrity();

    return () => {
      window.removeEventListener("focus", checkSyncIntegrity);
    };
  }, []);

  // Flag para rastrear se a mudança de estado atual veio do servidor (evita loops de sincronização)
  // Stores the set of domain keys currently being applied from a remote source.
  // This prevents the local persistence useEffects from triggering a redundant push-back.
  const incomingDomains = useRef<Set<string>>(new Set());

  // ─── Recalcula projeção e salva no schema v2 estruturado ao mudar rendas ou contas fixas ───
  useEffect(() => {
    if (showOnboarding) return;

    // Salva rendas e contas fixas no schema v2 estruturado
    transacoesFixasStorage.save(incomes, fixedBills);

    // Recalcula projeção de 12 meses usando o Motor de Cálculo
    const config = configuracoesStorage.load();
    const mesInicial = config?.mesOnboarding || selectedMonth || new Date().toISOString().substring(0, 7);

    const projecao = calcularProjecao({
      mesInicial,
      rendas: incomes,
      contasFixas: fixedBills,
    });

    setMesesCalculados((prev) => {
      const isDiff = JSON.stringify(prev) !== JSON.stringify(projecao.meses);
      if (isDiff) {
        mesesCalculadosStorage.save(projecao.meses);
        return projecao.meses;
      }
      return prev;
    });
  }, [incomes, fixedBills, showOnboarding, selectedMonth]);

  // --- Sincronização automática com LocalStorage ---
  // Anti-loop: cada useEffect verifica se o domain veio de uma atualização remota.
  // Se sim, persiste localmente (correto) mas NÃO dispara dataVersion (que causaria re-push).
  useEffect(() => {
    try {
      fixedBillsStorage.saveAll(fixedBills);
      if (!showOnboarding) {
        transacoesFixasStorage.save(incomes, fixedBills);
      }
    } catch (e: any) {
      if (e.message === "STORAGE_FULL") setStorageError(true);
    }
    if (incomingDomains.current.has("fixedBills")) {
      incomingDomains.current.delete("fixedBills");
      return; // Não gera push de volta — veio do servidor
    }
    setDataVersion((v) => v + 1);
  }, [fixedBills]);

  useEffect(() => {
    try {
      incomesStorage.saveAll(incomes);
      if (!showOnboarding) {
        transacoesFixasStorage.save(incomes, fixedBills);
      }
    } catch (e: any) {
      if (e.message === "STORAGE_FULL") setStorageError(true);
    }
    if (incomingDomains.current.has("incomes")) {
      incomingDomains.current.delete("incomes");
      return;
    }
    setDataVersion((v) => v + 1);
  }, [incomes]);

  useEffect(() => {
    try {
      invoicesStorage.saveAll(invoices);
    } catch (e: any) {
      if (e.message === "STORAGE_FULL") setStorageError(true);
    }
    if (incomingDomains.current.has("invoices")) {
      incomingDomains.current.delete("invoices");
      return;
    }
    setDataVersion((v) => v + 1);
  }, [invoices]);

  useEffect(() => {
    try {
      plannedInstallmentsStorage.saveAll(plannedInstallments);
    } catch (e: any) {
      if (e.message === "STORAGE_FULL") setStorageError(true);
    }
    if (incomingDomains.current.has("plannedInstallments")) {
      incomingDomains.current.delete("plannedInstallments");
      return;
    }
    setDataVersion((v) => v + 1);
  }, [plannedInstallments]);

  // ─── Snapshot atual do app para sincronização ────────────────────────────────
  const currentAppData = useMemo(() => ({
    fixedBills,
    incomes,
    invoices,
    plannedInstallments,
  }), [fixedBills, incomes, invoices, plannedInstallments]);

  // ─── Callback: ao ativar o sync, faz push inicial de todos os domínios ───────
  const handleSyncActivated = useCallback(async (_code: string) => {
    await pushDomainsToServer(currentAppData);
  }, [currentAppData]);

  // ─── Callback: ao receber dados do servidor, aplica apenas os domínios alterados ──
  //
  // Recebe `MergedDomains` — um objeto ESPARSO contendo somente os domínios que o
  // servidor tem mais recentes que o local (após resolução de conflito por timestamp).
  // Portanto não é necessário comparar JSON: se veio aqui, é mais novo.
  //
  // Antes de atualizar cada estado, registramos o domínio em `incomingDomains` para
  // que o useEffect de persistência saiba que não deve fazer push de volta (anti-loop).
  const handleRemoteData = useCallback((merged: MergedDomains) => {
    if (merged.fixedBills) {
      incomingDomains.current.add("fixedBills");
      setFixedBills(merged.fixedBills);
    }
    if (merged.incomes) {
      incomingDomains.current.add("incomes");
      setIncomes(merged.incomes);
    }
    if (merged.invoices) {
      incomingDomains.current.add("invoices");
      setInvoices(merged.invoices);
    }
    if (merged.plannedInstallments) {
      incomingDomains.current.add("plannedInstallments");
      setPlannedInstallments(merged.plannedInstallments);
    }
  }, []);

  // Navegação rápida de meses
  const handlePrevMonth = () => {
    setSelectedMonth((prev) => addMonths(prev, -1));
  };

  const handleNextMonth = () => {
    setSelectedMonth((prev) => addMonths(prev, 1));
  };

  // Conciliação de Simulação Manual (Regra de Negócio 4.3)
  const handleConfirmReconciliation = (plannedId: string, status: "confirmed_in_invoice" | "archived") => {
    setPlannedInstallments((prev) =>
      prev.map((item) => (item.id === plannedId ? { ...item, status } : item))
    );
  };

  // Carregar Backup Completo (Schema v2 com validação)
  const handleImportBackup = (backup: any) => {
    if (backup.transacoes_fixas) {
      if (backup.transacoes_fixas.rendas) setIncomes(backup.transacoes_fixas.rendas);
      if (backup.transacoes_fixas.contasFixas) setFixedBills(backup.transacoes_fixas.contasFixas);
    }
    if (backup.meses_calculados) setMesesCalculados(backup.meses_calculados);
    
    // Suporte legado se o usuário importar um backup antigo
    if (backup.fixedBills) setFixedBills(backup.fixedBills);
    if (backup.incomes) setIncomes(backup.incomes);
    if (backup.invoices) setInvoices(backup.invoices);
    if (backup.plannedInstallments) setPlannedInstallments(backup.plannedInstallments);
  };

  // Exportar Backup Completo (Schema v2)
  const handleExportBackup = () => {
    const activeConfig = configuracoesStorage.load() || {
      schemaVersion: 1,
      mesOnboarding: new Date().toISOString().substring(0, 7),
      concluidoEm: new Date().toISOString(),
      onboardingCompleto: true
    };

    const schema: AppStorageSchema = {
      configuracoes_usuario: activeConfig,
      transacoes_fixas: {
        rendas: incomes,
        contasFixas: fixedBills
      },
      meses_calculados: mesesCalculados
    };

    exportarBackupDoApp(schema);
  };

  // Itens do Menu de Navegação
  // mobileBottomBar: false = não aparece na barra inferior do mobile (fica visível só na sidebar/menu hamburguer)
  const navigationItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, mobileBottomBar: true },
    { id: "fixas", label: "Renda & Contas Fixas", icon: Wallet, mobileBottomBar: true },
    { id: "cartao", label: "Fatura do Cartão", icon: CreditCard, mobileBottomBar: true },
    { id: "planejadas", label: "Parcelas Simuladas", icon: ArrowUpRight, mobileBottomBar: true },
    { id: "relatorios", label: "Relatórios & Backup", icon: BarChart3, mobileBottomBar: true },
    { id: "sincronizacao", label: "Sincronização", icon: Cloud, mobileBottomBar: false },
  ];

  // Helpers de UI para o badge de status da sincronização no header
  const syncStatusConfig: Record<SyncStatus, { icon: React.ElementType; label: string; color: string; bg: string; dot: string }> = {
    no_code:        { icon: CloudOff,    label: "Compartilhar",   color: "text-zinc-400",   bg: "bg-zinc-100",    dot: "bg-zinc-300" },
    idle:           { icon: Cloud,       label: "Conectado",      color: "text-sky-500",    bg: "bg-sky-50",      dot: "bg-sky-400" },
    syncing:        { icon: Loader2,     label: "Sincronizando",  color: "text-amber-500",  bg: "bg-amber-50",   dot: "bg-amber-400" },
    synced:         { icon: CloudUpload, label: "Sincronizado",   color: "text-emerald-600",bg: "bg-emerald-50", dot: "bg-emerald-400" },
    error:          { icon: WifiOff,     label: "Erro",           color: "text-rose-500",   bg: "bg-rose-50",    dot: "bg-rose-400" },
    not_configured: { icon: CloudOff,   label: "Compartilhar",   color: "text-zinc-400",   bg: "bg-zinc-100",    dot: "bg-amber-400" },
  };
  const currentSyncUi = syncStatusConfig[syncStatus];
  const SyncStatusIcon = currentSyncUi.icon;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col font-sans antialiased w-full max-w-full overflow-x-hidden" id="main-app-shell">

      {/* ONBOARDING - Exibido apenas no primeiro acesso */}
      {showOnboarding && (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}
      
      {/* HEADER DE NAVEGAÇÃO DE MESES */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-200/60 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 w-full max-w-full overflow-x-clip">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="p-2 bg-zinc-900 text-white rounded-lg shadow-xs shrink-0">
            <Coins className="w-4.5 h-4.5 shrink-0 text-emerald-400" />
          </div>
          <div className="min-w-0 truncate">
            <h1 className="font-bold text-zinc-800 leading-tight tracking-tight text-xs sm:text-sm truncate">
              Controle Financeiro
            </h1>
            <span className="text-[9px] text-zinc-400 font-extrabold uppercase tracking-wider block truncate">
              Pessoal & IA
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Month Selector Widget */}
          <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200/50 rounded-xl p-0.5">
            <button
              onClick={handlePrevMonth}
              className="w-9 h-9 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-white rounded-lg transition-all"
              title="Mês Anterior"
            >
              <ChevronLeft className="w-4.5 h-4.5 shrink-0" />
            </button>
            
            <span className="text-[11px] sm:text-xs font-bold text-zinc-700 px-2 min-w-[95px] sm:min-w-[110px] text-center select-none truncate">
              {formatMonth(selectedMonth)}
            </span>

            <button
              onClick={handleNextMonth}
              className="w-9 h-9 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-white rounded-lg transition-all"
              title="Próximo Mês"
            >
              <ChevronRight className="w-4.5 h-4.5 shrink-0" />
            </button>
          </div>

          {/* Botão de Instalar App (PWA) */}
          {showInstallBanner && (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/10 shrink-0 cursor-pointer"
              title="Instalar Aplicativo"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Instalar App</span>
            </button>
          )}

          {/* Controlador Headless de Sincronização (sem UI) */}
          <SyncManager
            syncCode={syncCode}
            onRemoteDataReceived={handleRemoteData}
            onStatusChange={setSyncStatus}
            currentAppData={currentAppData}
            dataVersion={dataVersion}
          />

          {/* Badge de Status de Sync — navega para a aba de Sincronização ao clicar */}
          <button
            id="sync-status-badge"
            onClick={() => setActiveTab("sincronizacao")}
            title={syncCode ? `Sincronizado: ${syncCode}` : "Ativar Compartilhamento"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all ${
              activeTab === "sincronizacao"
                ? "bg-zinc-900 text-white border-zinc-900"
                : `${currentSyncUi.bg} border-current/20 ${currentSyncUi.color} hover:opacity-80`
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeTab === "sincronizacao" ? "bg-emerald-400" : currentSyncUi.dot} ${syncStatus === "syncing" ? "animate-pulse" : ""}`} />
            <SyncStatusIcon className={`w-3.5 h-3.5 shrink-0 ${syncStatus === "syncing" ? "animate-spin" : ""}`} />
            <span className="hidden sm:block">{currentSyncUi.label}</span>
          </button>
        </div>
      </header>

      {/* MODAL DE INSTRUÇÕES DE INSTALAÇÃO NO IOS */}
      <AnimatePresence>
        {showIOSInstructions && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xs overflow-hidden rounded-2xl bg-white p-5 shadow-xl border border-zinc-200"
            >
              <h3 className="text-xs font-black text-zinc-900 flex items-center gap-2 mb-2 uppercase tracking-wide">
                <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
                Instalar no iOS (Safari)
              </h3>
              <p className="text-[11px] text-zinc-500 leading-relaxed mb-3">
                Para instalar este app no seu iPhone ou iPad, siga os passos no navegador <strong>Safari</strong>:
              </p>
              <ol className="space-y-2 text-[11px] text-zinc-700 list-decimal list-inside pl-0.5 mb-4 font-medium">
                <li>
                  Toque no botão de <strong>Compartilhar</strong> <Share className="w-3.5 h-3.5 inline text-zinc-500 mx-0.5" /> (na barra inferior do Safari).
                </li>
                <li>
                  Role e toque em <strong>Adicionar à Tela de Início</strong> <Plus className="w-3.5 h-3.5 inline text-zinc-500 mx-0.5" />.
                </li>
                <li>
                  Toque em <strong>Adicionar</strong> no canto superior direito.
                </li>
              </ol>
              <button
                onClick={() => setShowIOSInstructions(false)}
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all"
              >
                Entendi
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BANNER DE ERRO DE ARMAZENAMENTO */}
      <AnimatePresence>
        {storageError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-rose-50 border-b border-rose-200 text-rose-800 px-6 py-3 flex items-center justify-between text-xs font-semibold z-30"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span>O armazenamento local está cheio! Remova arquivos ou faturas antigas para continuar salvando suas finanças.</span>
            </div>
            <button
              onClick={() => setStorageError(false)}
              className="px-2.5 py-1 bg-rose-150 hover:bg-rose-200 text-rose-900 rounded-md transition-all font-bold"
            >
              Fechar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CORE FRAME LAYOUT */}
      <div className="flex-1 flex flex-col md:flex-row">
        
        {/* SIDEBAR NAVEGAÇÃO DESKTOP */}
        <aside className="w-64 bg-white border-r border-zinc-200/60 p-4 hidden md:flex flex-col gap-1.5 shrink-0">
          <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-3 mb-4 select-none">
            Navegação Principal
          </div>

          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                  isActive
                    ? "bg-zinc-900 text-white shadow-md shadow-zinc-200"
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-400" : "text-zinc-400"}`} />
                {item.label}
              </button>
            );
          })}
        </aside>

        {/* MENU MOBILE EXPANSÍVEL */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white border-b border-zinc-200 flex flex-col p-4 md:hidden shadow-xs gap-1.5"
            >
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                      isActive
                        ? "bg-zinc-900 text-white shadow-xs"
                        : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-400" : "text-zinc-400"}`} />
                    {item.label}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* CONTAINER DO CONTEÚDO PRINCIPAL */}
        <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full pb-24 md:pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + selectedMonth}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === "dashboard" && (
                <Dashboard
                  selectedMonth={selectedMonth}
                  incomes={incomes}
                  fixedBills={fixedBills}
                  invoices={invoices}
                  plannedInstallments={plannedInstallments}
                  setActiveTab={setActiveTab}
                  onConfirmReconciliation={handleConfirmReconciliation}
                />
              )}

              {activeTab === "fixas" && (
                <FixedBills
                  selectedMonth={selectedMonth}
                  incomes={incomes}
                  fixedBills={fixedBills}
                  setIncomes={setIncomes}
                  setFixedBills={setFixedBills}
                />
              )}

              {activeTab === "cartao" && (
                <CardInvoices
                  selectedMonth={selectedMonth}
                  invoices={invoices}
                  setInvoices={setInvoices}
                />
              )}

              {activeTab === "planejadas" && (
                <PlannedInstallments
                  selectedMonth={selectedMonth}
                  plannedInstallments={plannedInstallments}
                  setPlannedInstallments={setPlannedInstallments}
                />
              )}

              {activeTab === "relatorios" && (
                <Reports
                  selectedMonth={selectedMonth}
                  setSelectedMonth={setSelectedMonth}
                  incomes={incomes}
                  fixedBills={fixedBills}
                  invoices={invoices}
                  plannedInstallments={plannedInstallments}
                  onImportBackup={handleImportBackup}
                  onExportBackup={handleExportBackup}
                />
              )}

              {activeTab === "sincronizacao" && (
                <SyncPage
                  syncCode={syncCode}
                  syncStatus={syncStatus}
                  onSyncCodeChange={setSyncCodeState}
                  onStatusChange={setSyncStatus}
                  onSyncActivated={handleSyncActivated}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* BOTÃO FLUTUANTE (FAB) PARA AÇÕES RÁPIDAS NO MOBILE */}
      <div className="fixed bottom-20 right-4 z-40 md:hidden">
        <div className="relative">
          <AnimatePresence>
            {fabOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 10 }}
                className="absolute bottom-16 right-0 bg-white border border-zinc-200 rounded-2xl p-2 shadow-xl flex flex-col gap-2 min-w-[200px]"
              >
                <div className="text-[9px] font-black text-zinc-400 uppercase tracking-widest px-2.5 py-1">
                  Ações Rápidas
                </div>
                <button
                  onClick={() => {
                    setActiveTab("cartao");
                    setFabOpen(false);
                    setTimeout(() => {
                      document.getElementById("invoice-upload-dropzone")?.scrollIntoView({ behavior: "smooth" });
                    }, 150);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-zinc-50 rounded-xl text-left text-xs font-bold text-zinc-700 transition-all"
                >
                  <CreditCard className="w-4 h-4 text-emerald-500 shrink-0" />
                  Enviar Fatura PDF/Imagem
                </button>
                <button
                  onClick={() => {
                    setActiveTab("fixas");
                    setFabOpen(false);
                    setTimeout(() => {
                      document.getElementById("add-bill-form")?.scrollIntoView({ behavior: "smooth" });
                    }, 150);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-zinc-50 rounded-xl text-left text-xs font-bold text-zinc-700 transition-all"
                >
                  <Wallet className="w-4 h-4 text-emerald-500 shrink-0" />
                  Adicionar Conta Fixa
                </button>
                <button
                  onClick={() => {
                    setActiveTab("planejadas");
                    setFabOpen(false);
                    setTimeout(() => {
                      document.getElementById("planned-installments-container")?.scrollIntoView({ behavior: "smooth" });
                    }, 150);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-zinc-50 rounded-xl text-left text-xs font-bold text-zinc-700 transition-all"
                >
                  <ArrowUpRight className="w-4 h-4 text-emerald-500 shrink-0" />
                  Simular Nova Parcela
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => setFabOpen(!fabOpen)}
            className="w-12 h-12 bg-zinc-900 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-zinc-800 transition-all focus:outline-hidden"
            aria-label="Ações rápidas"
          >
            <motion.div
              animate={{ rotate: fabOpen ? 45 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <Plus className="w-6 h-6 text-emerald-400" />
            </motion.div>
          </button>
        </div>
      </div>

      {/* BARRA DE NAVEGAÇÃO INFERIOR MOBILE — apenas itens com mobileBottomBar: true */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-200 md:hidden flex items-center justify-around py-1.5 shadow-lg pb-safe-bottom">
        {navigationItems.filter((item) => item.mobileBottomBar).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 min-h-[48px] transition-all ${
                isActive ? "text-zinc-950" : "text-zinc-400 hover:text-zinc-600"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-emerald-500" : ""}`} />
              <span className={`text-[9px] mt-1 font-bold ${isActive ? "text-zinc-950" : "text-zinc-400"}`}>
                {item.label.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </nav>

      {/* FOOTER */}
      <footer className="bg-white border-t border-gray-100 py-4 text-center text-xs text-gray-400 select-none pb-20 md:pb-4">
        <p>© 2026 Controle Financeiro Pessoal • Processamento de Faturas em Python</p>
      </footer>
    </div>
  );
}
