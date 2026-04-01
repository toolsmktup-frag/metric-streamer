import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth } from 'date-fns';
import { useEffect, useRef } from 'react';
import type { SellerStats } from './useSellerStats';

export interface Achievement {
  key: string;
  label: string;
  emoji: string;
  description: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { key: 'first_sale_of_day', label: 'Primeira do Dia', emoji: '🌅', description: 'Fez a primeira venda do dia' },
  { key: '5_sales_day', label: 'Vendedora Turbo', emoji: '⚡', description: '5 vendas em um único dia' },
  { key: 'goal_1_reached', label: 'Meta 1 Atingida', emoji: '🥉', description: 'Atingiu a Meta 1 do mês' },
  { key: 'goal_2_reached', label: 'Meta 2 Atingida', emoji: '🥈', description: 'Atingiu a Meta 2 do mês' },
  { key: 'goal_3_reached', label: 'Meta 3 Atingida', emoji: '🥇', description: 'Atingiu a Meta 3 do mês' },
  { key: 'streak_7', label: 'Semana de Fogo', emoji: '🔥', description: '7 dias seguidos com vendas' },
  { key: 'streak_14', label: 'Imparável', emoji: '💎', description: '14 dias seguidos com vendas' },
  { key: 'goal_2_months', label: 'Consistência', emoji: '👑', description: 'Meta batida 2 meses seguidos' },
];

export interface UnlockedAchievement {
  achievement_key: string;
  unlocked_at: string;
  month: string | null;
}

export function useSellerAchievements(userId?: string) {
  return useQuery({
    queryKey: ['seller-achievements', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await (supabase as any)
        .from('seller_achievements')
        .select('achievement_key, unlocked_at, month')
        .eq('user_id', userId);
      if (error) throw error;
      return (data || []) as UnlockedAchievement[];
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}

/** Automatically evaluate and unlock achievements based on current stats */
export function useAutoUnlockAchievements(
  userId: string | undefined,
  stats: SellerStats | undefined,
  achievements: UnlockedAchievement[],
  goalAmounts: { goal1: number; goal2: number; goal3: number }
) {
  const queryClient = useQueryClient();
  const processedRef = useRef(false);

  const unlockMutation = useMutation({
    mutationFn: async (keys: { key: string; month: string }[]) => {
      for (const { key, month } of keys) {
        // Check if already exists before inserting
        const { data: existing } = await (supabase as any)
          .from('seller_achievements')
          .select('id')
          .eq('user_id', userId)
          .eq('achievement_key', key)
          .eq('month', month)
          .maybeSingle();
        
        if (!existing) {
          await (supabase as any)
            .from('seller_achievements')
            .insert({ user_id: userId, achievement_key: key, month, unlocked_at: new Date().toISOString() });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-achievements', userId] });
    },
  });

  useEffect(() => {
    if (!userId || !stats || processedRef.current) return;

    const unlockedKeys = new Set(achievements.map(a => `${a.achievement_key}_${a.month || ''}`));
    const currentMonth = format(startOfMonth(new Date()), 'yyyy-MM');
    const today = format(new Date(), 'yyyy-MM-dd');
    const toUnlock: { key: string; month: string }[] = [];

    function shouldUnlock(key: string, month: string) {
      return !unlockedKeys.has(`${key}_${month}`);
    }

    // First sale of the day
    if (stats.todayLeads >= 1 && shouldUnlock('first_sale_of_day', today)) {
      toUnlock.push({ key: 'first_sale_of_day', month: today });
    }

    // 5 sales in a single day
    const hasFiveSalesDay = stats.salesByDay.some(d => d.count >= 5);
    if (hasFiveSalesDay && shouldUnlock('5_sales_day', currentMonth)) {
      toUnlock.push({ key: '5_sales_day', month: currentMonth });
    }

    // Goal 1 reached
    if (goalAmounts.goal1 > 0 && stats.monthRevenue >= goalAmounts.goal1 && shouldUnlock('goal_1_reached', currentMonth)) {
      toUnlock.push({ key: 'goal_1_reached', month: currentMonth });
    }

    // Goal 2 reached
    if (goalAmounts.goal2 > 0 && stats.monthRevenue >= goalAmounts.goal2 && shouldUnlock('goal_2_reached', currentMonth)) {
      toUnlock.push({ key: 'goal_2_reached', month: currentMonth });
    }

    // Goal 3 reached
    if (goalAmounts.goal3 > 0 && stats.monthRevenue >= goalAmounts.goal3 && shouldUnlock('goal_3_reached', currentMonth)) {
      toUnlock.push({ key: 'goal_3_reached', month: currentMonth });
    }

    // Streak 7
    if (stats.streak >= 7 && shouldUnlock('streak_7', currentMonth)) {
      toUnlock.push({ key: 'streak_7', month: currentMonth });
    }

    // Streak 14
    if (stats.streak >= 14 && shouldUnlock('streak_14', currentMonth)) {
      toUnlock.push({ key: 'streak_14', month: currentMonth });
    }

    if (toUnlock.length > 0) {
      processedRef.current = true;
      unlockMutation.mutate(toUnlock);
    }
  }, [userId, stats, achievements, goalAmounts]);
}

export function getSellerLevel(monthlySales: number) {
  if (monthlySales >= 51) return { name: 'Diamante', emoji: '💎', color: 'from-blue-400 to-purple-500' };
  if (monthlySales >= 26) return { name: 'Ouro', emoji: '🥇', color: 'from-yellow-400 to-amber-500' };
  if (monthlySales >= 11) return { name: 'Prata', emoji: '🥈', color: 'from-gray-300 to-gray-400' };
  return { name: 'Bronze', emoji: '🥉', color: 'from-orange-400 to-orange-600' };
}

export function getMonthlyHistory(salesByDay: { date: string; revenue: number }[]) {
  const months = new Map<string, number>();
  for (const s of salesByDay) {
    const m = s.date.slice(0, 7);
    months.set(m, (months.get(m) || 0) + s.revenue);
  }
  return Array.from(months.entries())
    .map(([month, revenue]) => ({ month, revenue }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);
}
