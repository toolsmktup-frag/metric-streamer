import React, { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay, getDaysInMonth, getDate, isSunday, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import confetti from 'canvas-confetti';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import { useSellerGoal } from '@/hooks/useSellerGoals';
import { useSellerStats, type SellerStatsDateRange } from '@/hooks/useSellerStats';
import { useSellerAchievements, useAutoUnlockAchievements, ACHIEVEMENTS, getSellerLevel } from '@/hooks/useSellerAchievements';
import {
  Trophy, Target, Flame, TrendingUp, DollarSign, ShoppingCart,
  Bell, BarChart3, CalendarIcon, ChevronDown
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import type { DateRange as DayPickerRange } from 'react-day-picker';

const GOAL_LABELS = ['Meta 1', 'Meta 2', 'Meta 3'];
const GOAL_EMOJIS = ['🥉', '🥈', '🥇'];
const GOAL_GRADIENT_ACTIVE = [
  'from-primary/80 to-primary',
  'from-amber-400 to-amber-500',
  'from-emerald-400 to-emerald-600',
];

function getActiveGoal(
  revenue: number,
  goals: { amount: number; label: string; emoji: string }[]
) {
  for (let i = 0; i < goals.length; i++) {
    if (goals[i].amount <= 0) continue;
    if (revenue < goals[i].amount) {
      return {
        index: i,
        target: goals[i].amount,
        label: goals[i].label,
        emoji: goals[i].emoji,
        percent: (revenue / goals[i].amount) * 100,
        remaining: goals[i].amount - revenue,
        completed: false,
      };
    }
  }
  // All goals beaten
  const last = goals.filter(g => g.amount > 0);
  const lastGoal = last[last.length - 1];
  if (!lastGoal || lastGoal.amount <= 0) {
    return { index: 0, target: 0, label: 'Meta', emoji: '🎯', percent: 0, remaining: 0, completed: false };
  }
  return {
    index: goals.indexOf(lastGoal),
    target: lastGoal.amount,
    label: lastGoal.label,
    emoji: '🏆',
    percent: (revenue / lastGoal.amount) * 100,
    remaining: 0,
    completed: true,
  };
}

function getMotivationalMessage(percent: number, name: string, remaining: number, completed: boolean, goalLabel: string) {
  if (completed) return `TODAS AS METAS BATIDAS! Você é lenda, ${name}! 🏆👑🎉`;
  if (percent >= 90) return `UAUUU! Só mais ${formatCurrency(remaining)} para bater a ${goalLabel}! 👑`;
  if (percent >= 60) return `Incrível! Mais ${formatCurrency(remaining)} e você bate a ${goalLabel}! 🚀`;
  if (percent >= 30) return `Você está no caminho! Faltam ${formatCurrency(remaining)} para a ${goalLabel} 🔥`;
  return `Bora começar forte, ${name}! A ${goalLabel} está esperando por você 💪`;
}

function getPercentColor(percent: number) {
  if (percent >= 80) return 'bg-emerald-500 text-white';
  if (percent >= 50) return 'bg-yellow-500 text-white';
  return 'bg-red-500 text-white';
}

function getRemainingWorkDays(): number {
  const now = new Date();
  const totalDays = getDaysInMonth(now);
  const today = getDate(now);
  let count = 0;
  for (let d = today; d <= totalDays; d++) {
    const date = new Date(now.getFullYear(), now.getMonth(), d);
    if (!isSunday(date)) count++;
  }
  return Math.max(count, 1);
}

function getDailyGoalInfo(monthRevenue: number, goalAmount: number, todayRevenue: number) {
  if (goalAmount <= 0) return null;
  const remaining = Math.max(goalAmount - monthRevenue, 0);
  const workDays = getRemainingWorkDays();
  const dailyTarget = remaining <= 0 ? 0 : remaining / workDays;
  const percent = dailyTarget > 0 ? Math.min((todayRevenue / dailyTarget) * 100, 150) : (todayRevenue > 0 ? 100 : 0);
  return { dailyTarget, percent, todayRevenue, remaining, monthlyDone: remaining <= 0 };
}

function getDailyMotivationalMessage(percent: number, name: string, dailyTarget: number, todayRevenue: number, monthlyDone: boolean) {
  if (monthlyDone) return { text: `Meta do mês já batida! Cada venda agora é bônus, ${name}! 🏆✨`, emoji: '🏆' };
  if (percent >= 100) return { text: `BATEU A META DO DIA! Você é fera, ${name}! Continue assim! 🎉🔥`, emoji: '🎉' };
  if (percent >= 70) return { text: `Quase lá! Falta pouco pra fechar o dia! Você consegue! 🚀`, emoji: '🚀' };
  if (percent >= 30) return { text: `Tá no caminho certo! Tem leads pra ligar? Bora converter! 💪`, emoji: '💪' };
  if (todayRevenue > 0) return { text: `Bom começo! Continue assim e bate a meta do dia! 🔥`, emoji: '🔥' };
  return { text: `Bora começar o dia forte, ${name}! Sua meta de hoje te espera! 💪`, emoji: '🎯' };
}

const PERIOD_PRESETS = [
  { label: 'Hoje', getDates: () => ({ start: startOfDay(new Date()), end: endOfDay(new Date()) }) },
  { label: 'Ontem', getDates: () => { const d = subDays(new Date(), 1); return { start: startOfDay(d), end: endOfDay(d) }; } },
  { label: 'Últimos 3 dias', getDates: () => ({ start: startOfDay(subDays(new Date(), 2)), end: endOfDay(new Date()) }) },
  { label: 'Últimos 7 dias', getDates: () => ({ start: startOfDay(subDays(new Date(), 6)), end: endOfDay(new Date()) }) },
];

export default function MinhasMetas() {
  const [confettiFired, setConfettiFired] = useState(false);
  const [periodLabel, setPeriodLabel] = useState('Hoje');
  const [periodRange, setPeriodRange] = useState<SellerStatsDateRange>(() => PERIOD_PRESETS[0].getDates());
  const [periodOpen, setPeriodOpen] = useState(false);
  const [showCustomCal, setShowCustomCal] = useState(false);
  const [customRange, setCustomRange] = useState<DayPickerRange | undefined>(undefined);

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
  const { data: stats, isLoading: statsLoading } = useSellerStats(sellerName, periodRange);
  const { data: achievements = [] } = useSellerAchievements(userId);

  const isLoading = goalLoading || statsLoading;
  const monthRevenue = stats?.monthRevenue || 0;

  // Build 3 goals array
  const goals = [
    { amount: goal?.goal_amount || 0, label: GOAL_LABELS[0], emoji: GOAL_EMOJIS[0] },
    { amount: goal?.goal_amount_2 || 0, label: GOAL_LABELS[1], emoji: GOAL_EMOJIS[1] },
    { amount: goal?.goal_amount_3 || 0, label: GOAL_LABELS[2], emoji: GOAL_EMOJIS[2] },
  ];
  const hasAnyGoal = goals.some(g => g.amount > 0);

  const activeGoal = getActiveGoal(monthRevenue, goals);

  // Daily goal breakdown
  const dailyGoal = useMemo(() => {
    const primaryGoal = goals.find(g => g.amount > 0);
    if (!primaryGoal) return null;
    return getDailyGoalInfo(monthRevenue, primaryGoal.amount, stats?.todayRevenue || 0);
  }, [monthRevenue, goals, stats?.todayRevenue]);

  const dailyMessage = useMemo(() => {
    if (!dailyGoal) return null;
    return getDailyMotivationalMessage(dailyGoal.percent, sellerName, dailyGoal.dailyTarget, dailyGoal.todayRevenue, dailyGoal.monthlyDone);
  }, [dailyGoal, sellerName]);

  const level = getSellerLevel(stats?.monthSales || 0);
  const unlockedKeys = new Set(achievements.map(a => a.achievement_key));

  // Auto-unlock achievements based on current stats
  useAutoUnlockAchievements(userId, stats, achievements, {
    goal1: goal?.goal_amount || 0,
    goal2: goal?.goal_amount_2 || 0,
    goal3: goal?.goal_amount_3 || 0,
  });

  // Confetti when all goals beaten
  useEffect(() => {
    if (activeGoal.completed && !confettiFired) {
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
  }, [activeGoal.completed, confettiFired]);

  const todayVariation = stats && stats.yesterdayRevenue > 0
    ? ((stats.todayRevenue - stats.yesterdayRevenue) / stats.yesterdayRevenue) * 100
    : 0;

  const monthlyHistory = React.useMemo(() => {
    if (!stats?.salesByDay) return [];
    const months = new Map<string, number>();
    for (const s of stats.salesByDay) {
      const m = s.date.slice(0, 7);
      months.set(m, (months.get(m) || 0) + s.revenue);
    }
    return Array.from(months.entries())
      .map(([month, revenue]) => ({ month: month.slice(5), revenue }))
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
      {/* Header */}
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

      {/* Period Filter + KPIs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                Resumo por Período
              </CardTitle>
              <Popover open={periodOpen} onOpenChange={(v) => { setPeriodOpen(v); if (!v) setShowCustomCal(false); }}>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted transition-colors">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    {periodLabel}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className={cn("p-1", showCustomCal ? "w-auto" : "w-48")} align="end">
                  {!showCustomCal ? (
                    <div>
                      {PERIOD_PRESETS.map(preset => (
                        <button
                          key={preset.label}
                          className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                            periodLabel === preset.label ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                          }`}
                          onClick={() => {
                            const dates = preset.getDates();
                            setPeriodRange(dates);
                            setPeriodLabel(preset.label);
                            setPeriodOpen(false);
                          }}
                        >
                          {preset.label}
                        </button>
                      ))}
                      <div className="border-t border-border mt-1 pt-1">
                        <button
                          className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                            !PERIOD_PRESETS.some(p => p.label === periodLabel) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                          }`}
                          onClick={() => {
                            setCustomRange({ from: periodRange.start, to: periodRange.end });
                            setShowCustomCal(true);
                          }}
                        >
                          Personalizado
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 space-y-3">
                      <Calendar
                        mode="range"
                        selected={customRange}
                        onSelect={setCustomRange}
                        numberOfMonths={2}
                        locale={ptBR}
                        disabled={(date) => date > new Date()}
                        className={cn("p-3 pointer-events-auto")}
                      />
                      <div className="flex items-center justify-between px-1">
                        <button onClick={() => setShowCustomCal(false)} className="text-sm text-muted-foreground hover:text-foreground">
                          Voltar
                        </button>
                        <button
                          onClick={() => {
                            if (customRange?.from && customRange?.to) {
                              const start = startOfDay(customRange.from);
                              const end = endOfDay(customRange.to);
                              setPeriodRange({ start, end });
                              setPeriodLabel(`${format(start, 'dd/MM', { locale: ptBR })} - ${format(end, 'dd/MM', { locale: ptBR })}`);
                              setShowCustomCal(false);
                              setPeriodOpen(false);
                            }
                          }}
                          disabled={!customRange?.from || !customRange?.to}
                          className="px-4 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          Aplicar
                        </button>
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                  <ShoppingCart className="h-4 w-4" />
                  <span className="text-xs font-medium">Vendas</span>
                </div>
                {isLoading ? <Skeleton className="h-7 w-16 mx-auto" /> : (
                  <p className="text-2xl font-bold text-foreground">{stats?.periodSales || 0}</p>
                )}
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-xs font-medium">Receita</span>
                </div>
                {isLoading ? <Skeleton className="h-7 w-24 mx-auto" /> : (
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(stats?.periodRevenue || 0)}</p>
                )}
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium">Comissão</span>
                </div>
                {isLoading ? <Skeleton className="h-7 w-24 mx-auto" /> : (
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(stats?.periodCommission || 0)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Goal Card — Active goal progress */}
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
              {hasAnyGoal && (
                <Badge className={getPercentColor(activeGoal.percent)}>
                  {activeGoal.percent.toFixed(1)}%
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !hasAnyGoal ? (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">Nenhuma meta definida para este mês</p>
                <p className="text-sm">Peça ao administrador para configurar suas metas.</p>
              </div>
            ) : (
              <>
                {/* Revenue display */}
                <div className="text-center">
                  <p className="text-4xl md:text-5xl font-bold text-foreground">
                    {formatCurrency(monthRevenue)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {activeGoal.completed
                      ? 'Todas as metas batidas! 🎉'
                      : `Faltam ${formatCurrency(activeGoal.remaining)} para a ${activeGoal.label}`}
                  </p>
                </div>

                {/* 3 Goals progress indicators */}
                <div className="grid grid-cols-3 gap-3">
                  {goals.map((g, idx) => {
                    if (g.amount <= 0) return (
                      <div key={idx} className="rounded-lg border border-border/50 p-3 text-center opacity-40">
                        <p className="text-xs text-muted-foreground">{GOAL_LABELS[idx]}</p>
                        <p className="text-sm text-muted-foreground">—</p>
                      </div>
                    );

                    const goalPercent = Math.min((monthRevenue / g.amount) * 100, 100);
                    const beaten = monthRevenue >= g.amount;

                    return (
                      <div
                        key={idx}
                        className={`rounded-lg border-2 p-3 text-center transition-all ${
                          beaten
                            ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                            : idx === activeGoal.index
                            ? 'border-primary bg-primary/5'
                            : 'border-border/50 opacity-60'
                        }`}
                      >
                        <div className="text-lg mb-0.5">{beaten ? '✅' : GOAL_EMOJIS[idx]}</div>
                        <p className="text-xs font-semibold text-muted-foreground">{GOAL_LABELS[idx]}</p>
                        <p className={`text-sm font-bold ${beaten ? 'text-emerald-600' : 'text-foreground'}`}>
                          {formatCurrency(g.amount)}
                        </p>
                        {idx === 2 && (
                          <div className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            beaten
                              ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white animate-pulse'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {beaten ? '🎁 Bônus desbloqueado!' : '🎁 Bônus extra'}
                          </div>
                        )}
                        <div className="mt-1.5 h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${goalPercent}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            className={`h-full rounded-full ${
                              beaten
                                ? 'bg-emerald-500'
                                : `bg-gradient-to-r ${GOAL_GRADIENT_ACTIVE[idx]}`
                            }`}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {goalPercent.toFixed(0)}%
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Main progress bar for active goal */}
                <div className="relative pt-2 pb-6">
                  <div className="relative h-4 w-full bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(activeGoal.percent, 100)}%` }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                      className={`h-full rounded-full ${
                        activeGoal.completed
                          ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                          : activeGoal.percent >= 50
                          ? 'bg-gradient-to-r from-primary to-emerald-400'
                          : 'bg-gradient-to-r from-amber-400 to-primary'
                      }`}
                    />
                  </div>
                  {[25, 50, 75, 100].map((mark) => (
                    <div
                      key={mark}
                      className="absolute top-2"
                      style={{ left: `${mark}%` }}
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
                  key={activeGoal.index + '_' + Math.floor(activeGoal.percent / 30)}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`text-center text-sm font-medium ${
                    activeGoal.completed ? 'text-emerald-600 text-lg' : 'text-muted-foreground'
                  }`}
                >
                  {getMotivationalMessage(activeGoal.percent, sellerName, activeGoal.remaining, activeGoal.completed, activeGoal.label)}
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
          label="Vendas do Período"
          value={String(stats?.periodSales || 0)}
          sub={`Média: ${(stats?.avgDailyLeads || 0).toFixed(1)}/dia`}
          loading={isLoading}
        />
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Receita do Período"
          value={formatCurrency(stats?.periodRevenue || 0)}
          sub={periodLabel}
          loading={isLoading}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Comissão do Período"
          value={formatCurrency(stats?.periodCommission || 0)}
          sub={`${stats?.periodSales || 0} vendas`}
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
                  <RechartsTooltip formatter={(value: number) => [formatCurrency(value), 'Receita']} />
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
