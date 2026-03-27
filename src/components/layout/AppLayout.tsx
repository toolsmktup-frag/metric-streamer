import React, { useState } from 'react';
import AppSidebar from './AppSidebar';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import { RefreshCw, Clock } from 'lucide-react';
import { useFilterStore } from '@/stores/filterStore';
import { SkeletonCard } from '@/components/dashboard/SkeletonCard';
import { useMetaSyncStatus } from '@/hooks/useMetaData';
import { Suspense } from 'react';
import UserMenu from './UserMenu';
import { useTheme } from '@/hooks/useTheme';

interface AppLayoutProps {
  children: React.ReactNode;
}

function SyncInfo() {
  const { data: syncStatus } = useMetaSyncStatus();

  if (!syncStatus?.finished_at) return null;

  const finished = new Date(syncStatus.finished_at);
  const now = new Date();
  const diffMs = now.getTime() - finished.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);

  // Format last sync time in local timezone
  const timeStr = finished.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = finished.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const isToday = finished.toDateString() === now.toDateString();

  let label = '';
  if (diffMin < 2) label = 'agora mesmo';
  else if (diffMin < 60) label = `${diffMin} min atrás`;
  else if (diffH < 24) label = `${diffH}h atrás`;
  else label = `${dateStr} ${timeStr}`;

  const isRunning = syncStatus.status === 'running';

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={`Dados sincronizados às ${timeStr}${isToday ? ' de hoje' : ` de ${dateStr}`}. Gastos após este horário ainda não aparecem.`}>
      <Clock className="h-3 w-3 shrink-0" />
      {isRunning ? (
        <span className="text-destructive">Sincronizando...</span>
      ) : (
        <span>Sync: {isToday ? timeStr : `${dateStr} ${timeStr}`} ({label})</span>
      )}
    </span>
  );
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { refresh } = useFilterStore();
  const [refreshing, setRefreshing] = useState(false);
  useTheme(); // Initialize theme on app load

  const handleRefresh = () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <DateRangePicker />
          </div>
          <div className="flex items-center gap-3">
            <SyncInfo />
            <button
              onClick={handleRefresh}
              title="Atualizar dados em cache"
              className="h-8 w-8 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
            >
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 p-6">
          <Suspense fallback={<div className="grid grid-cols-4 gap-4">{Array.from({length:8}).map((_,i)=><SkeletonCard key={i}/>)}</div>}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

