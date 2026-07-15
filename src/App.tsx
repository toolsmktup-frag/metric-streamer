import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useMyPermissions, isLogisticaOnly } from "@/hooks/useUserPermissions";
import ErrorBoundary from "./components/ErrorBoundary";
import AppLayout from "./components/layout/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Resumo from "./pages/Resumo";
import Index from "./pages/Index";
import Campanhas from "./pages/Campanhas";
import Vendas from "./pages/Vendas";
import Demograficos from "./pages/Demograficos";
import Geografico from "./pages/Geografico";
import Dispositivos from "./pages/Dispositivos";
import Integracoes from "./pages/Integracoes";
import NotFound from "./pages/NotFound";
import KpiGeral from "./pages/KpiGeral";
import Criativos from "./pages/Criativos";
import AgenteIA from "./pages/AgenteIA";
import ImportCSV from "./pages/ImportCSV";
import Importar from "./pages/Importar";
import EscadaValor from "./pages/EscadaValor";
import CrmAnalytics from "./pages/CrmAnalytics";
import PermissionRoute from "./components/PermissionRoute";
import FunilResumo from "./pages/FunilResumo";
import FunilKpi from "./pages/FunilKpi";
import FunilCampanhas from "./pages/FunilCampanhas";
import FunisConfigurar from "./pages/FunisConfigurar";
import FunilCriativos from "./pages/FunilCriativos";
import Produtos from "./pages/Produtos";
import ClassificacaoIA from "./pages/ClassificacaoIA";
import VinculoCampanhas from "./pages/VinculoCampanhas";
import Ecommerce from "./pages/Ecommerce";
import LeadCampaigns from "./pages/LeadCampaigns";
import LeadFunnelDetail from "./pages/LeadFunnelDetail";
import LeadsDashboard from "./pages/LeadsDashboard";
import LeadsList from "./pages/LeadsList";
import LeadsSources from "./pages/LeadsSources";
import WhatsAppChat from "./pages/WhatsAppChat";
import Equipe from "./pages/Equipe";
import UserSettings from "./pages/UserSettings";
import WzAutomacoes from "./pages/WzAutomacoes";
import WzFlowCanvas from "./pages/WzFlowCanvas";
import WzInstancias from "./pages/WzInstancias";
import WzExecucoes from "./pages/WzExecucoes";
import MinhasMetas from "./pages/MinhasMetas";
import ConfigMetas from "./pages/ConfigMetas";
import AutoRules from "./pages/AutoRules";
import SalesCopilotConfig from "./pages/SalesCopilotConfig";
import GirassolConfig from "./pages/GirassolConfig";
import Rastreios from "./pages/Rastreios";
import WhatsAppOficial from "./pages/WhatsAppOficial";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Trava de navegação para o perfil "logística": usuários que só têm
 * mod_rastreios são redirecionados para /rastreios em qualquer outra rota
 * (inclusive ao digitar a URL na mão).
 */
const RastreiosGuard = ({ children }: { children: React.ReactNode }) => {
  const { data: perms, isLoading } = useMyPermissions();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isLogisticaOnly(perms) && location.pathname !== '/rastreios') {
    return <Navigate to="/rastreios" replace />;
  }

  return <>{children}</>;
};

const Protected = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <RastreiosGuard>
      <AppLayout>{children}</AppLayout>
    </RastreiosGuard>
  </ProtectedRoute>
);


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<Protected><Index /></Protected>} />
          <Route path="/resumo" element={<Protected><PermissionRoute requiredPermission="mod_resumo"><Resumo /></PermissionRoute></Protected>} />
          <Route path="/campanhas" element={<Protected><Campanhas /></Protected>} />
          <Route path="/kpi-geral" element={<Protected><KpiGeral /></Protected>} />
          <Route path="/vendas" element={<Protected><Vendas /></Protected>} />
          <Route path="/demograficos" element={<Protected><Demograficos /></Protected>} />
          <Route path="/geografico" element={<Protected><Geografico /></Protected>} />
          <Route path="/dispositivos" element={<Protected><Dispositivos /></Protected>} />
          
          <Route path="/integracoes" element={<Protected><Integracoes /></Protected>} />
          <Route path="/agente-ia" element={<Protected><AgenteIA /></Protected>} />
          <Route path="/import-csv" element={<Protected><ImportCSV /></Protected>} />
          <Route path="/importar" element={<Protected><Importar /></Protected>} />
          <Route path="/escada-valor" element={<Protected><EscadaValor /></Protected>} />
          <Route path="/ecommerce" element={<Protected><Ecommerce /></Protected>} />
          <Route path="/crm-analytics" element={<Protected><CrmAnalytics /></Protected>} />
          {/* Rotas de funis */}
          <Route path="/funis/configurar" element={<Protected><FunisConfigurar /></Protected>} />
          <Route path="/produtos" element={<Protected><Produtos /></Protected>} />
          <Route path="/classificacao-ia" element={<Protected><ClassificacaoIA /></Protected>} />
          <Route path="/vinculo-campanhas" element={<Protected><VinculoCampanhas /></Protected>} />
          <Route path="/funis/:id/resumo" element={<Protected><FunilResumo /></Protected>} />
          <Route path="/funis/:id/kpi" element={<Protected><FunilKpi /></Protected>} />
          <Route path="/funis/:id/campanhas" element={<Protected><FunilCampanhas /></Protected>} />
          <Route path="/funis/:id/criativos" element={<Protected><FunilCriativos /></Protected>} />
          {/* Leads */}
          <Route path="/leads/metas" element={<Protected><MinhasMetas /></Protected>} />
          <Route path="/leads/configurar-metas" element={<Protected><ConfigMetas /></Protected>} />
          <Route path="/leads/dashboard" element={<Protected><LeadsDashboard /></Protected>} />
          <Route path="/leads" element={<Protected><LeadsList /></Protected>} />
          <Route path="/leads/fontes" element={<Protected><LeadsSources /></Protected>} />
          <Route path="/lead-campaigns" element={<Protected><PermissionRoute requiredPermission="mod_leads"><LeadCampaigns /></PermissionRoute></Protected>} />
          <Route path="/lead-funnels/:id" element={<Protected><LeadFunnelDetail /></Protected>} />
          {/* Logística / Rastreios */}
          <Route path="/rastreios" element={<Protected><PermissionRoute requiredPermission="mod_rastreios"><Rastreios /></PermissionRoute></Protected>} />
          {/* Equipe */}
          <Route path="/equipe" element={<Protected><Equipe /></Protected>} />
          {/* Configurações do usuário */}
          <Route path="/configuracoes" element={<Protected><UserSettings /></Protected>} />
          {/* WhatsApp Chat - fullscreen layout */}
          <Route path="/whatsapp" element={<Protected><PermissionRoute requiredPermission="mod_whatsapp"><WhatsAppChat /></PermissionRoute></Protected>} />
          {/* WhatsApp API Oficial (Meta Cloud API) */}
          <Route path="/whatsapp-oficial" element={<Protected><WhatsAppOficial /></Protected>} />
          {/* Automações WhatsApp */}
          <Route path="/ferramentas/automacoes" element={<Protected><WzAutomacoes /></Protected>} />
          <Route path="/ferramentas/automacoes/novo" element={<Protected><WzFlowCanvas /></Protected>} />
          <Route path="/ferramentas/automacoes/:id" element={<Protected><WzFlowCanvas /></Protected>} />
          <Route path="/ferramentas/automacoes/instancias" element={<Protected><WzInstancias /></Protected>} />
          <Route path="/ferramentas/automacoes/execucoes" element={<Protected><WzExecucoes /></Protected>} />
          {/* Auto-Rules */}
          <Route path="/auto-rules" element={<Protected><AutoRules /></Protected>} />
          <Route path="/configuracoes/copiloto-vendas" element={<Protected><SalesCopilotConfig /></Protected>} />
          <Route path="/configuracoes/girassol" element={<Protected><GirassolConfig /></Protected>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
