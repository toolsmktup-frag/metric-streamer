import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import confetti from 'canvas-confetti';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { useSellerGoal } from '@/hooks/useSellerGoals';
import { useSellerStats } from '@/hooks/useSellerStats';
import { useSellerAchievements, ACHIEVEMENTS, getSellerLevel } from '@/hooks/useSellerAchievements';
import {
  Trophy, Target, Flame, TrendingUp, DollarSign, ShoppingCart,
  Bell, Star, Lock, Zap, BarChart3
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

function getMotivationalMessage(percent: number, name: string, remaining: number) {
  if (percent >= 100) return `META BATIDA! Você é incrível, ${name}! 🏆🎉`;
  if (percent >= 90) return `UAUUU! Você está a um passo! Só mais ${formatCurrency(remaining)}! 👑`;
  if (percent >= 60) return `Incrível! Você está quase lá. Mais ${formatCurrency(remaining)} e você bate a meta! 🚀`;
  if (percent >= 30) return `Você está no caminho! Só faltam ${formatCurrency(remaining)} para chegar lá 🔥`;
  return `Bora começar forte, ${name}! A meta está esperando por você 💪`;
}

function getPercentColor(percent: number) {
  if (percent >= 80) return 'bg-emerald-500 text-white';
  if (percent >= 50) return 'bg-yellow-500 text-white';
  return 'bg-red-500 text-white';
}

export default function MinhasMetas() {
  const [confettiFired, setConfettiFired] = useState(false);

  // Get current user
  const { data: currentUser } = useQuery({
    queryKey: ['current-user-profile-metas'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await (supabase as any)
        .from('user_profiles')
        .select('id, full_name, avatar_url, role')
        .eq('id', user.id)
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const userId = currentUser?.id;
  const sellerName = currentUser?.full_name || '';
  const avatarUrl = currentUser?.avatar_url;

  const { data: goal, isLoading: goalLoading } = useSellerGoal(userId);
  const { data: stats, isLoading: statsLoading } = useSellerStats(sellerName);
  const { data: achievements = [] } = useSellerAchievements(userId);

  const isLoading = goalLoading || statsLoading;
  const goalAmount = goal?.goal_amount || 0;
  const monthRevenue = stats?.monthRevenue || 0;
  const percent = goalAmount > 0 ? Math.min((monthRevenue / goalAmount) * 100, 150) : 0;
  const displayPercent = goalAmount > 0 ? (monthRevenue / goalAmount) * 100 : 0;
  const remaining = Math.max(goalAmount - monthRevenue, 0);

  const level = getSellerLevel(stats?.monthSales || 0);
  const unlockedKeys = new Set(achievements.map(a => a.achievement_key));

  // Confetti on 100%
  useEffect(() => {
    if (displayPercent >= 100 && !confettiFired) {
      setConfettiFired(true);
      const duration = 3000;
      const end = Date.now() + duration;
      const frame = () => {
        confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 } });
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 } });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
  }, [displayPercent, confettiFired]);

  // Revenue variation today vs yesterday
  const todayVariation = stats && stats.yesterdayRevenue > 0
    ? ((stats.todayRevenue - stats.yesterdayRevenue) / stats.yesterdayRevenue) * 100
    : 0;

  // Monthly history for chart (from salesByDay aggregated to months)
  const monthlyHistory = React.useMemo(() => {
    if (!stats?.salesByDay) return [];
    const months = new Map<string, number>();
    for (const s of stats.salesByDay) {
      const m = s.date.slice(0, 7);
      months.set(m, (months.get(m) || 0) + s.revenue);
    }
    return Array.from(months.entries())
      .map(([month, revenue]) => ({
        month: month.slice(5),
        revenue,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);
  }, [stats?.salesByDay]);

  if (!currentUser) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header: Avatar + Name + Level + Notifications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-primary">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback className="text-xl font-bold bg-primary text-primary-foreground">
              {sellerName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{sellerName}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold bg-gradient-to-r ${level.color} text-white`}>
                {level.emoji} {level.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {stats?.monthSales || 0} vendas este mês
              </span>
            </div>
          </div>
        </div>

        <button className="relative p-2 rounded-full hover:bg-muted transition-colors">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-destructive rounded-full text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
            3
          </span>
        </button>
      </motion.div>

      {/* Main Goal Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-card to-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-primary" />
                Meta do Mês — {format(new Date(), 'MMMM yyyy')}
              </CardTitle>
              {goalAmount > 0 && (
                <Badge className={getPercentColor(displayPercent)}>
                  {displayPercent.toFixed(1)}%
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : goalAmount === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">Nenhuma meta definida para este mês</p>
                <p className="text-sm">Peça ao administrador para configurar sua meta.</p>
              </div>
            ) : (
              <>
                {/* Revenue display */}
                <div className="text-center">
                  <p className="text-4xl md:text-5xl font-bold text-foreground">
                    {formatCurrency(monthRevenue)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    de {formatCurrency(goalAmount)}
                  </p>
                </div>

                {/* Progress bar with markers */}
                <div className="relative pt-2 pb-6">
                  <div className="relative h-4 w-full bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(percent, 100)}%` }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                      className={`h-full rounded-full ${
                        displayPercent >= 100
                          ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                          : displayPercent >= 50
                          ? 'bg-gradient-to-r from-primary to-emerald-400'
                          : 'bg-gradient-to-r from-amber-400 to-primary'
                      }`}
                    />
                  </div>

                  {/* Markers */}
                  {[25, 50, 75, 100].map((mark) => (
                    <div
                      key={mark}
                      className="absolute top-2"
                      style={{ left: `${Math.min(mark * 100 / (goalAmount > 0 ? 100 : 1), 100)}%` }}
                    >
                      <div className="w-0.5 h-4 bg-foreground/20 mx-auto" />
                      <span className="text-[10px] text-muted-foreground -ml-2 block mt-1">
                        {mark}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Motivational message */}
                <motion.p
                  key={Math.floor(displayPercent / 30)}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`text-center text-sm font-medium ${
                    displayPercent >= 100 ? 'text-emerald-600 text-lg' : 'text-muted-foreground'
                  }`}
                >
                  {getMotivationalMessage(displayPercent, sellerName, remaining)}
                </motion.p>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* KPIs Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <KpiCard
          icon={<ShoppingCart className="h-4 w-4" />}
          label="Vendas Hoje"
          value={String(stats?.todayLeads || 0)}
          sub={`Média: ${(stats?.avgDailyLeads || 0).toFixed(1)}/dia`}
          loading={isLoading}
        />
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Receita Hoje"
          value={formatCurrency(stats?.todayRevenue || 0)}
          sub={todayVariation !== 0 ? `${todayVariation >= 0 ? '↑' : '↓'} ${Math.abs(todayVariation).toFixed(0)}% vs ontem` : 'vs ontem'}
          subColor={todayVariation >= 0 ? 'text-emerald-500' : 'text-destructive'}
          loading={isLoading}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Comissão no Mês"
          value={formatCurrency(stats?.monthCommission || 0)}
          sub={`${stats?.monthSales || 0} vendas`}
          loading={isLoading}
        />
        <KpiCard
          icon={<Flame className="h-4 w-4" />}
          label="Streak"
          value={`${stats?.streak || 0} dias`}
          sub={stats?.streak && stats.streak >= 7 ? '🔥 Em chamas!' : 'Dias seguidos com venda'}
          loading={isLoading}
        />
      </motion.div>

      {/* Achievements */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-primary" />
              Conquistas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {ACHIEVEMENTS.map((ach) => {
                const unlocked = unlockedKeys.has(ach.key);
                return (
                  <motion.div
                    key={ach.key}
                    whileHover={{ scale: 1.02 }}
                    className={`relative p-4 rounded-xl border text-center transition-all ${
                      unlocked
                        ? 'bg-primary/5 border-primary/30'
                        : 'bg-muted/30 border-border opacity-50'
                    }`}
                  >
                    <div className="text-3xl mb-2">{unlocked ? ach.emoji : '🔒'}</div>
                    <p className={`text-sm font-semibold ${unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {ach.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">{ach.description}</p>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Monthly History Chart */}
      {monthlyHistory.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                Histórico Mensal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyHistory}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <RechartsTooltip
                    formatter={(value: number) => [formatCurrency(value), 'Receita']}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, subColor, loading
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  subColor?: string;
  loading?: boolean;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {loading ? (
          <>
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-6 w-24 mb-1" />
            <Skeleton className="h-3 w-16" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              {icon}
              <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="text-xl font-bold text-foreground">{value}</p>
            <p className={`text-xs mt-0.5 ${subColor || 'text-muted-foreground'}`}>{sub}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
