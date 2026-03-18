import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLeadStats } from '@/hooks/useAllLeads';
import { Users, UserPlus, TrendingUp, Target } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const LeadsDashboard: React.FC = () => {
  const { data: stats, isLoading } = useLeadStats();
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-leads-from-sales');
      if (error) throw error;
      toast.success(`Sincronização concluída: ${data.leads_created} leads criados, ${data.events_created} eventos registrados`);
      queryClient.invalidateQueries({ queryKey: ['all-leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    } catch (err: any) {
      toast.error('Erro na sincronização: ' + (err.message || String(err)));
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Carregando...</div>;
  if (!stats) return <div className="p-6 text-muted-foreground">Sem dados disponíveis.</div>;

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
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando...' : 'Sincronizar Base'}
        </Button>
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
