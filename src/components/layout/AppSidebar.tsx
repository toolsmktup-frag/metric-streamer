import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Megaphone,
  Target,
  Layers,
  FileImage,
  ShoppingCart,
  ShoppingBag,
  Users,
  Globe,
  Smartphone,
  Link2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Bot,
  MessageCircle,
  Upload,
  TrendingUp,
  Settings,
  Plus,
  Pencil,
  BarChart3,
  Zap,
  Trophy,
  Sparkles,
  Package,
  Brain,
  Truck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFunnels } from '@/hooks/useFunnels';
import { useFilterStore } from '@/stores/filterStore';
import { useMyPermissions } from '@/hooks/useUserPermissions';

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

/* ── Itens absorvidos por Tráfego & ADS ── */
const ADS_ITEMS = [
  { path: '/kpi-geral',  label: 'Geral ADS',  icon: Layers },
  { path: '/vendas',     label: 'Vendas',     icon: ShoppingCart },
  { path: '/auto-rules', label: 'Auto-Rules', icon: Zap },
];

/* ── Leads & CRM (sem metas — metas viram sub-menu) ── */
const LEAD_ITEMS = [
  { path: '/leads/dashboard',      label: 'Dashboard Leads',      icon: LayoutDashboard },
  { path: '/leads',                label: 'Todos os Leads',       icon: Users },
  { path: '/lead-campaigns',      label: 'Funis de Leads',       icon: Target },
  { path: '/leads/fontes',        label: 'Fontes / UTMs',        icon: Globe },
];

const META_ITEMS = [
  { path: '/leads/metas',            label: 'Minhas Metas',        icon: Trophy },
  { path: '/leads/configurar-metas', label: 'Config. de Metas',   icon: Settings },
];

/* ── Inteligência ── */
const INTELLIGENCE_ITEMS = [
  { path: '/escada-valor',  label: 'Inteligência de Cliente', icon: TrendingUp },
  { path: '/crm-analytics', label: 'Análise de CRM',          icon: BarChart3 },
  { path: '/ecommerce',     label: 'Ecommerce',               icon: ShoppingBag },
];

/* ── Configurações (ex-Ferramentas) ── */
const CONFIG_ITEMS = [
  { path: '/equipe',        label: 'Equipe',       icon: Users },
  { path: '/integracoes',   label: 'Integrações',  icon: Link2 },
  { path: '/importar',      label: 'Importar',     icon: Upload },
  { path: '/agente-ia',     label: 'Agente IA',    icon: Bot },
  { path: '/configuracoes/copiloto-vendas', label: 'Copiloto de Vendas', icon: Sparkles },
  { path: '/funis/configurar', label: 'Gerenciar Funis', icon: Settings },
  { path: '/produtos',         label: 'Produtos',        icon: Package },
  { path: '/classificacao-ia', label: 'Classificação IA', icon: Brain },
];

const AppSidebar = React.memo(function AppSidebar({ collapsed, onToggle, onNavigate }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: funnels = [] } = useFunnels();
  const { setActiveFunnelId } = useFilterStore();
  const [expandedFunnel, setExpandedFunnel] = useState<string | null>(null);
  const [metasOpen, setMetasOpen] = useState(false);
  const { data: perms } = useMyPermissions();

  const can = (mod: string) => {
    if (!perms) return true;
    return (perms as any)[mod] === true;
  };

  const isActive = (path: string) => location.pathname === path;
  const isFunnelActive = (id: string) => location.pathname.startsWith(`/funis/${id}`);

  // Auto-expand metas sub-menu if on a metas route
  const isMetasRoute = META_ITEMS.some(i => isActive(i.path));
  const showMetas = metasOpen || isMetasRoute;

  function handleFunnelClick(id: string) {
    setActiveFunnelId(id);
    setExpandedFunnel(prev => prev === id ? null : id);
    if (!location.pathname.startsWith(`/funis/${id}`)) {
      navigate(`/funis/${id}/resumo`);
    }
  }

  function handleResumoGeral() {
    setActiveFunnelId(null);
    navigate('/resumo');
  }

  const navLink = (path: string, label: string, Icon: React.ElementType) => (
    <NavLink
      key={path}
      to={path}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive(path)
          ? 'bg-sidebar-active text-sidebar-theme'
          : 'text-sidebar-theme/80 hover:bg-sidebar-hover hover:text-sidebar-theme'
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            className="whitespace-nowrap overflow-hidden"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </NavLink>
  );

  const sectionLabel = (label: string) => !collapsed && (
    <p className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-sidebar-theme/40">
      {label}
    </p>
  );

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="h-screen bg-sidebar-theme flex flex-col sticky top-0 z-30 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-3 shrink-0">
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-sidebar-theme font-bold text-lg tracking-tight whitespace-nowrap"
            >
              📊 AdMetrics
            </motion.span>
          )}
        </AnimatePresence>
        <button
          onClick={onToggle}
          className="h-8 w-8 flex items-center justify-center rounded-md text-sidebar-theme hover:bg-sidebar-hover transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">

        {/* ── Resumo Geral ── */}
        {can('mod_resumo') && (
          <button
            onClick={handleResumoGeral}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive('/resumo') || isActive('/')
                ? 'bg-sidebar-active text-sidebar-theme'
                : 'text-sidebar-theme/80 hover:bg-sidebar-hover hover:text-sidebar-theme'
            }`}
          >
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="whitespace-nowrap overflow-hidden"
                >
                  Resumo Geral
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        )}

        {/* ── TRÁFEGO & ADS ── */}
        {can('mod_trafego') && (
          <>
            {sectionLabel('Tráfego & ADS')}

            {funnels.map(funnel => (
              <div key={funnel.id}>
                <button
                  onClick={() => handleFunnelClick(funnel.id)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isFunnelActive(funnel.id)
                      ? 'bg-sidebar-active text-sidebar-theme'
                      : 'text-sidebar-theme/80 hover:bg-sidebar-hover hover:text-sidebar-theme'
                  }`}
                >
                  <span
                    className="h-3 w-3 rounded-full shrink-0 border border-white/20"
                    style={{ backgroundColor: funnel.color }}
                  />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="flex-1 text-left whitespace-nowrap overflow-hidden"
                      >
                        {funnel.name}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {!collapsed && (
                    expandedFunnel === funnel.id
                      ? <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                      : <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>

                <AnimatePresence>
                  {!collapsed && expandedFunnel === funnel.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-4 space-y-0.5 overflow-hidden"
                    >
                      {[
                        { path: `/funis/${funnel.id}/resumo`,    label: 'Resumo',    icon: LayoutDashboard },
                        { path: `/funis/${funnel.id}/kpi`,       label: 'KPI',       icon: Layers },
                        { path: `/funis/${funnel.id}/campanhas`, label: 'Campanhas', icon: Megaphone },
                        { path: `/funis/${funnel.id}/criativos`, label: 'Criativos', icon: FileImage },
                        { path: `/funis/configurar?editar=${funnel.id}`, label: 'Editar', icon: Pencil },
                      ].map(({ path, label, icon: Icon }) => (
                        <NavLink
                          key={path}
                          to={path}
                          onClick={onNavigate}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                            isActive(path)
                              ? 'bg-sidebar-active text-sidebar-theme font-medium'
                              : 'text-sidebar-theme/70 hover:bg-sidebar-hover hover:text-sidebar-theme'
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="whitespace-nowrap">{label}</span>
                        </NavLink>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {!collapsed && (
              <NavLink
                to="/funis/configurar"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-theme/50 hover:text-sidebar-theme hover:bg-sidebar-hover transition-colors"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Novo funil</span>
              </NavLink>
            )}

            {/* Geral ADS + Vendas (absorvidos de Anúncios) */}
            {can('mod_anuncios') && ADS_ITEMS.map(item => navLink(item.path, item.label, item.icon))}
          </>
        )}

        {/* ── LEADS & CRM ── */}
        {can('mod_leads') && (
          <>
            {sectionLabel('Leads & CRM')}
            {LEAD_ITEMS.map(item => navLink(item.path, item.label, item.icon))}

            {/* Sub-menu colapsável: Metas */}
            {!collapsed && (
              <>
                <button
                  onClick={() => setMetasOpen(prev => !prev)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isMetasRoute
                      ? 'bg-sidebar-active text-sidebar-theme'
                      : 'text-sidebar-theme/80 hover:bg-sidebar-hover hover:text-sidebar-theme'
                  }`}
                >
                  <Trophy className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left whitespace-nowrap">Metas</span>
                  {showMetas
                    ? <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                    : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                </button>

                <AnimatePresence>
                  {showMetas && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-4 space-y-0.5 overflow-hidden"
                    >
                      {META_ITEMS.map(({ path, label, icon: Icon }) => (
                        <NavLink
                          key={path}
                          to={path}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                            isActive(path)
                              ? 'bg-sidebar-active text-sidebar-theme font-medium'
                              : 'text-sidebar-theme/70 hover:bg-sidebar-hover hover:text-sidebar-theme'
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="whitespace-nowrap">{label}</span>
                        </NavLink>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
            {collapsed && META_ITEMS.map(item => navLink(item.path, item.label, item.icon))}
          </>
        )}

        {/* ── WHATSAPP ── */}
        {(can('mod_whatsapp') || can('mod_ferramentas')) && (
          <>
            {sectionLabel('WhatsApp')}
            {can('mod_whatsapp') && navLink('/whatsapp', 'Chat', MessageCircle)}
            {can('mod_ferramentas') && navLink('/ferramentas/automacoes', 'Automações', Zap)}
            {can('mod_ferramentas') && navLink('/whatsapp-oficial', 'API Oficial', Sparkles)}
          </>
        )}

        {/* ── LOGÍSTICA ── */}
        {can('mod_rastreios') && (
          <>
            {sectionLabel('Logística')}
            {navLink('/rastreios', 'Rastreios', Truck)}
          </>
        )}

        {/* ── INTELIGÊNCIA ── */}
        {can('mod_inteligencia') && (
          <>
            {sectionLabel('Inteligência')}
            {INTELLIGENCE_ITEMS.map(item => navLink(item.path, item.label, item.icon))}
          </>
        )}

        {/* ── CONFIGURAÇÕES ── */}
        {can('mod_ferramentas') && (
          <>
            {sectionLabel('Configurações')}
            {CONFIG_ITEMS.map(item => navLink(item.path, item.label, item.icon))}
          </>
        )}
      </nav>
    </motion.aside>
  );
});

export default AppSidebar;
