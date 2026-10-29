import {
  CalendarClock,
  ChartColumn,
  ChartPie,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudAlert,
  CloudOff,
  Coins,
  CreditCard,
  House,
  LoaderCircle,
  Settings,
  Target,
  Wallet,
  Sprout,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { MonthContext } from "./app/month";
import { navigate, useRoute, type Route } from "./app/router";
import { store, useAppState } from "./app/store";
import { addMonths, currentMonth, formatMonthLong } from "./domain/month";
import type { SyncStatus } from "./data/sync/firebaseSync";
import Dashboard from "./features/dashboard/Dashboard";
import InvoicePage from "./features/invoices/InvoicePage";
import BillsPage from "./features/bills/BillsPage";
import CategoriesPage from "./features/categories/CategoriesPage";
import PlansPage from "./features/plans/PlansPage";
import GoalsPage from "./features/goals/GoalsPage";
import ReliefPage from "./features/relief/ReliefPage";
import RecapPage from "./features/recap/RecapPage";
import SettingsPage from "./features/settings/SettingsPage";
import InvestmentsPage from "./features/investments/InvestmentsPage";
import Onboarding from "./features/onboarding/Onboarding";
import { Alert } from "./ui/display";
import { ConfirmProvider } from "./ui/Sheet";
import { ToastProvider, useToast } from "./ui/Toast";
import { cn } from "./ui/cn";

// Relatórios carregam o Recharts (pesado): só baixa quando a tela é aberta.
const ReportsPage = lazy(() => import("./features/reports/ReportsPage"));

/** Barra inferior (mock "Noite & Lima"): 5 destinos principais. */
const NAV: Array<{ route: Route; label: string; icon: LucideIcon; also?: Route[] }> = [
  { route: "inicio", label: "Início", icon: House, also: ["resumo"] },
  { route: "fatura", label: "Fatura", icon: CreditCard },
  { route: "planejar", label: "Planejar", icon: CalendarClock, also: ["metas"] },
  { route: "investir", label: "Investir", icon: TrendingUp },
  { route: "relatorios", label: "Relatórios", icon: ChartColumn, also: ["alivio"] },
];

/** Menu lateral no desktop: tudo, inclusive o que no celular fica dentro das telas. */
const SIDE: Array<{ route: Route; label: string; icon: LucideIcon }> = [
  { route: "inicio", label: "Início", icon: House },
  { route: "fatura", label: "Fatura", icon: CreditCard },
  { route: "categorias", label: "Categorias", icon: ChartPie },
  { route: "contas", label: "Renda e contas", icon: Wallet },
  { route: "planejar", label: "Posso comprar?", icon: CalendarClock },
  { route: "metas", label: "Metas e reserva", icon: Target },
  { route: "investir", label: "Investimentos", icon: TrendingUp },
  { route: "alivio", label: "Calendário de alívio", icon: Sprout },
  { route: "relatorios", label: "Projeção", icon: ChartColumn },
  { route: "ajustes", label: "Ajustes", icon: Settings },
];

const PAGE_TITLES: Record<Route, string> = {
  inicio: "Início",
  fatura: "Fatura do cartão",
  categorias: "Categorias e orçamento",
  contas: "Renda e contas fixas",
  planejar: "Posso comprar?",
  metas: "Metas e reserva",
  investir: "Investimentos",
  relatorios: "Projeção",
  alivio: "Calendário de alívio",
  resumo: "Resumo do mês",
  ajustes: "Ajustes",
};

const MONTHLESS: Route[] = ["ajustes", "metas", "resumo", "investir"];

function useTheme() {
  const theme = useAppState((s) => s.device.theme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const fontScale = useAppState((s) => s.device.fontScale);
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale * 100}%`;
  }, [fontScale]);
}

function syncBadge(sync: SyncStatus): { icon: LucideIcon; label: string; dot: string; spin?: boolean } | null {
  switch (sync.phase) {
    case "off":
      return null;
    case "connecting":
      return { icon: LoaderCircle, label: "Conectando", dot: "bg-muted", spin: true };
    case "online":
      return sync.pending > 0
        ? { icon: LoaderCircle, label: "Enviando alterações", dot: "bg-sun", spin: true }
        : { icon: Cloud, label: "Sincronizado", dot: "bg-lime" };
    case "offline":
      return {
        icon: CloudOff,
        label: sync.pending > 0 ? `Sem internet, ${sync.pending} alteração(ões) aguardando` : "Sem internet",
        dot: "bg-sun",
      };
    case "error":
    case "unconfigured":
      return { icon: CloudAlert, label: "Erro no compartilhamento", dot: "bg-negative" };
  }
}

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

const roundButton =
  "relative flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-fg hover:bg-surface-2";

function Header({ route }: { route: Route }) {
  const sync = useAppState((s) => s.sync);
  const name = useAppState((s) => s.device.deviceName);
  const badge = syncBadge(sync);
  return (
    <header className="pt-safe relative z-30">
      <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center gap-3 px-4 md:px-8">
        <span
          aria-hidden
          className="font-display flex size-11 shrink-0 items-center justify-center rounded-full bg-lime text-lg font-bold text-ink"
        >
          {name?.trim() ? name.trim()[0].toUpperCase() : <Coins className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.8125rem] leading-tight text-muted">{name ? `${greeting()},` : greeting()}</p>
          <p className="truncate text-[1.0625rem] leading-tight font-bold text-fg">{name || PAGE_TITLES[route]}</p>
        </div>
        {badge && (
          <button type="button" onClick={() => navigate("ajustes")} className={roundButton} aria-label={`Compartilhamento: ${badge.label}`} title={badge.label}>
            <badge.icon className={cn("size-5", badge.spin && "animate-spin")} aria-hidden />
            <span className={cn("absolute top-2 right-2 size-2.5 rounded-full border-2 border-surface", badge.dot)} />
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate("ajustes")}
          aria-label="Ajustes"
          aria-current={route === "ajustes" ? "page" : undefined}
          className={cn(roundButton, route === "ajustes" && "border-lime text-lime")}
        >
          <Settings className="size-5" aria-hidden />
        </button>
      </div>
    </header>
  );
}

function MonthSwitcher({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  return (
    <nav aria-label="Mês" className="mb-5 flex items-center justify-between rounded-full border border-line bg-surface p-1">
      <button
        type="button"
        onClick={() => setMonth(addMonths(month, -1))}
        aria-label={`Mês anterior (${formatMonthLong(addMonths(month, -1))})`}
        className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setMonth(currentMonth())}
        title="Voltar para o mês atual"
        aria-live="polite"
        className="h-10 rounded-full px-4 text-[0.9375rem] font-semibold text-fg"
      >
        {formatMonthLong(month)}
      </button>
      <button
        type="button"
        onClick={() => setMonth(addMonths(month, 1))}
        aria-label={`Próximo mês (${formatMonthLong(addMonths(month, 1))})`}
        className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </nav>
  );
}

function SideNav({ route }: { route: Route }) {
  return (
    <nav aria-label="Principal" className="sticky top-6 hidden w-60 shrink-0 flex-col gap-1 self-start md:flex">
      {SIDE.map((item) => {
        const active = route === item.route;
        return (
          <a
            key={item.route}
            href={`#/${item.route}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-12 items-center gap-3 rounded-full px-4 text-[0.9375rem] font-semibold transition",
              active ? "bg-lime text-ink" : "text-muted hover:bg-surface hover:text-fg",
            )}
          >
            <item.icon className="size-5" aria-hidden />
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

function BottomNav({ route }: { route: Route }) {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-full border border-line bg-surface-2/90 shadow-2xl shadow-black/40 backdrop-blur-xl md:hidden"
    >
      <ul className="flex h-16 items-center justify-between px-2">
        {NAV.map((item) => {
          const active = route === item.route || !!item.also?.includes(route);
          return (
            <li key={item.route}>
              <a
                href={`#/${item.route}`}
                aria-current={active ? "page" : undefined}
                aria-label={active ? undefined : item.label}
                className={cn(
                  "flex h-12 items-center justify-center gap-2 rounded-full font-bold transition-all",
                  active ? "bg-lime px-4 text-[0.875rem] text-ink" : "w-12 text-muted hover:text-fg",
                )}
              >
                <item.icon className="size-5" aria-hidden />
                {active && item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function RemoteChangeToasts() {
  const toast = useToast();
  useEffect(
    () =>
      store.onRemoteChange((info) => {
        if (!info.initial && !info.fromSelf) {
          toast({ message: info.byName ? `${info.byName} atualizou os dados` : "Dados atualizados em outro aparelho" });
        }
      }),
    [toast],
  );
  return null;
}

function Shell() {
  const route = useRoute();
  const onboarded = useAppState((s) => s.onboarded);
  const storageFull = useAppState((s) => s.storageFull);
  const [month, setMonth] = useState(currentMonth);
  const monthValue = useMemo(() => ({ month, setMonth }), [month]);

  useEffect(() => {
    document.title = `${PAGE_TITLES[route]} · Controle Financeiro`;
    window.scrollTo({ top: 0 });
  }, [route]);

  if (!onboarded) return <Onboarding />;

  return (
    <MonthContext.Provider value={monthValue}>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
      >
        Pular para o conteúdo
      </a>
      <div className="min-h-dvh overflow-x-clip">
        <Header route={route} />
        <div className="mx-auto flex max-w-6xl gap-8 px-4 pt-2 pb-32 md:px-8 md:pb-12">
          <SideNav route={route} />
          <main id="conteudo" className="min-w-0 flex-1" tabIndex={-1}>
            <h1 className="sr-only">{PAGE_TITLES[route]}</h1>
            {!MONTHLESS.includes(route) && <MonthSwitcher month={month} setMonth={setMonth} />}
            {storageFull && (
              <div className="mb-4">
                <Alert tone="negative" icon={CloudAlert} title="O armazenamento do navegador está cheio">
                  Suas últimas alterações podem não ter sido salvas neste aparelho. Baixe um backup em Ajustes e
                  apague faturas antigas que não precisa mais.
                </Alert>
              </div>
            )}
            {route === "inicio" && <Dashboard />}
            {route === "fatura" && <InvoicePage />}
            {route === "categorias" && <CategoriesPage />}
            {route === "contas" && <BillsPage />}
            {route === "planejar" && <PlansPage />}
            {route === "metas" && <GoalsPage />}
            {route === "investir" && <InvestmentsPage />}
            {route === "alivio" && <ReliefPage />}
            {route === "resumo" && <RecapPage />}
            {route === "relatorios" && (
              <Suspense fallback={<p className="py-10 text-center text-muted">Carregando projeção…</p>}>
                <ReportsPage />
              </Suspense>
            )}
            {route === "ajustes" && <SettingsPage />}
          </main>
        </div>
        <BottomNav route={route} />
      </div>
    </MonthContext.Provider>
  );
}

export default function App() {
  useTheme();
  useEffect(() => store.start(), []);
  return (
    <ToastProvider>
      <ConfirmProvider>
        <RemoteChangeToasts />
        <Shell />
      </ConfirmProvider>
    </ToastProvider>
  );
}
