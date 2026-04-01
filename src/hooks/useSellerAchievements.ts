import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface Achievement {
  key: string;
  label: string;
  emoji: string;
  description: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { key: 'first_sale_of_day', label: 'Primeira do Dia', emoji: '🌅', description: 'Fez a primeira venda do dia' },
  { key: '5_sales_day', label: 'Vendedora Turbo', emoji: '⚡', description: '5 vendas em um único dia' },
  { key: 'goal_reached', label: 'Meta Batida', emoji: '🏆', description: 'Atingiu a meta mensal' },
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
