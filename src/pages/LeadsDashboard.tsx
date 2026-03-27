import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLeadStats } from '@/hooks/useAllLeads';
import { useFilterStore } from '@/stores/filterStore';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import { Users, UserPlus, TrendingUp, Target, RefreshCw } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const LeadsDashboard: React.FC = () => {
  const { dateRange } = useFilterStore();
  const { data: stats, isLoading } = useLeadStats(dateRange.start, dateRange.end);
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-leads-from-sales');
      if (error) throw error;
      
      const jobId = data?.job_id;
      if (!jobId) throw new Error('No job_id returned');

      toast.info('Sincronização iniciada em background...', {
        description: 'Processando seus leads. Isso pode levar alguns minutos.',
      });

      // Poll meta_sync_log for completion
      const pollInterval = setInterval(async () => {
        const { data: log } = await supabase
          .from('meta_sync_log')
          .select('status, records_synced, error, finished_at')
          .eq('id', jobId)
          .single();

        if (!log) return;

        if (log.status === 'completed') {
          clearInterval(pollInterval);
          setSyncing(false);
          toast.success('Sincronização concluída!', {
            description: `${log.records_synced ?? 0} leads sincronizados.`,
          });
          queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
          queryClient.invalidateQueries({ queryKey: ['all-leads'] });
          queryClient.invalidateQueries({ queryKey: ['leads-by-funnel'] });
          queryClient.invalidateQueries({ queryKey: ['funnel-lead-counts'] });
        } else if (log.status === 'failed') {
          clearInterval(pollInterval);
          setSyncing(false);
          toast.error('Erro na sincronização', { description: log.error || 'Erro desconhecido' });
        }
      }, 5000); // Poll every 5 seconds

      // Safety timeout after 10 minutes
      setTimeout(() => {
        setSyncing(false);
      }, 600000);

    } catch (err: any) {
      toast.error('Erro ao iniciar sincronização', { description: err.message });
      setSyncing(false);
    }
  };

  const kpiPlaceholders = [
    { label: 'Total de Leads', icon: Users, color: 'text-primary' },
    { label: 'Novos Hoje', icon: UserPlus, color: 'text-emerald-500' },
    { label: 'Novos (7 dias)', icon: TrendingUp, color: 'text-amber-500' },
    { label: 'Funis Ativos', icon: Target, color: 'text-primary' },
  ];

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard de Leads</h1>
            <p className="text-sm text-muted-foreground mt-1 animate-pulse">Carregando dados...</p>
          </div>
          <Button variant="outline" size="sm" disabled className="gap-1.5 opacity-50">
            <RefreshCw className="h-4 w-4" /> Sincronizar Leads
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiPlaceholders.map((kpi, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 p-4">
                <kpi.icon className={`h-8 w-8 ${kpi.color} opacity-40`} />
                <div>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <div className="h-6 w-16 rounded animate-pulse bg-muted mt-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card><CardHeader><CardTitle className="text-sm">Leads por Funil</CardTitle></CardHeader><CardContent><div className="h-[250px] rounded animate-pulse bg-muted" /></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Leads por Dia (30d)</CardTitle></CardHeader><CardContent><div className="h-[250px] rounded animate-pulse bg-muted" /></CardContent></Card>
        </div>
      </div>
    );
  }


  const kpis = [
    { label: 'Total de Leads', value: stats.total, icon: Users, color: 'text-primary' },
    { label: 'Novos Hoje', value: stats.newToday, icon: UserPlus, color: 'text-emerald-500' },
    { label: 'Novos (7 dias)', value: stats.newWeek, icon: TrendingUp, color: 'text-amber-500' },
    { label: 'Funis Ativos', value: stats.byFunnel.filter(f => f.count > 0).length, icon: Target, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard de Leads</h1>
        <div className="flex items-center gap-2">
          <DateRangePicker />
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Base'}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`p-3 rounded-lg bg-muted ${k.color}`}>
                <k.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-bold">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads por dia */}
        <Card>
          <CardHeader><CardTitle className="text-base">Leads por Dia (30 dias)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={stats.dailyLeads}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Leads" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Por fonte UTM */}
        <Card>
          <CardHeader><CardTitle className="text-base">Leads por Fonte</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={stats.bySource.slice(0, 8)} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={90} label={({ source, percent }) => `${source} ${(percent * 100).toFixed(0)}%`}>
                  {stats.bySource.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top funis */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Leads por Funil</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.byFunnel.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]}>
                  {stats.byFunnel.slice(0, 10).map((f, i) => (
                    <Cell key={i} fill={f.color || COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LeadsDashboard;
