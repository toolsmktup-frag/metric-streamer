import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
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
import Ecommerce from "./pages/Ecommerce";
import LeadCampaigns from "./pages/LeadCampaigns";
import LeadFunnelDetail from "./pages/LeadFunnelDetail";
import LeadsDashboard from "./pages/LeadsDashboard";
import LeadsList from "./pages/LeadsList";
import LeadsSources from "./pages/LeadsSources";
import WhatsAppChat from "./pages/WhatsAppChat";
import Equipe from "./pages/Equipe";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const Protected = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

// WhatsApp uses its own layout with sidebar but no DateRangePicker header
const ProtectedFullscreen = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    {children}
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Index /></Protected>} />
          <Route path="/resumo" element={<Protected><PermissionRoute requiredPermission="mod_resumo"><Resumo /></PermissionRoute></Protected>} />
          <Route path="/campanhas" element={<Protected><Campanhas /></Protected>} />
          <Route path="/kpi-geral" element={<Protected><KpiGeral /></Protected>} />
          <Route path="/vendas" element={<Protected><Vendas /></Protected>} />
          <Route path="/demograficos" element={<Protected><Demograficos /></Protected>} />
          <Route path="/geografico" element={<Protected><Geografico /></Protected>} />
          <Route path="/dispositivos" element={<Protected><Dispositivos /></Protected>} />
          <Route path="/criativos" element={<Protected><Criativos /></Protected>} />
          <Route path="/integracoes" element={<Protected><Integracoes /></Protected>} />
          <Route path="/agente-ia" element={<Protected><AgenteIA /></Protected>} />
          <Route path="/import-csv" element={<Protected><ImportCSV /></Protected>} />
          <Route path="/importar" element={<Protected><Importar /></Protected>} />
          <Route path="/escada-valor" element={<Protected><EscadaValor /></Protected>} />
          <Route path="/ecommerce" element={<Protected><Ecommerce /></Protected>} />
          <Route path="/crm-analytics" element={<Protected><CrmAnalytics /></Protected>} />
          {/* Rotas de funis */}
          <Route path="/funis/configurar" element={<Protected><FunisConfigurar /></Protected>} />
          <Route path="/funis/:id/resumo" element={<Protected><FunilResumo /></Protected>} />
          <Route path="/funis/:id/kpi" element={<Protected><FunilKpi /></Protected>} />
          <Route path="/funis/:id/campanhas" element={<Protected><FunilCampanhas /></Protected>} />
          {/* Leads */}
          <Route path="/leads/dashboard" element={<Protected><LeadsDashboard /></Protected>} />
          <Route path="/leads" element={<Protected><LeadsList /></Protected>} />
          <Route path="/leads/fontes" element={<Protected><LeadsSources /></Protected>} />
          <Route path="/lead-campaigns" element={<Protected><LeadCampaigns /></Protected>} />
          <Route path="/lead-funnels/:id" element={<Protected><LeadFunnelDetail /></Protected>} />
          {/* Equipe */}
          <Route path="/equipe" element={<Protected><Equipe /></Protected>} />
          {/* WhatsApp Chat - fullscreen layout */}
          <Route path="/whatsapp" element={<ProtectedFullscreen><WhatsAppChat /></ProtectedFullscreen>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
