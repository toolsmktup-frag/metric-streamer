import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface SellerGoal {
  id: string;
  user_id: string;
  month: string;
  goal_amount: number;
  goal_amount_2: number;
  goal_amount_3: number;
}

export function useSellerGoal(userId?: string) {
  const currentMonth = format(new Date(), 'yyyy-MM');

  return useQuery({
    queryKey: ['seller-goal', userId, currentMonth],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await (supabase as any)
        .from('seller_goals')
        .select('*')
        .eq('user_id', userId)
        .eq('month', currentMonth)
        .maybeSingle();
      if (error) throw error;
      return data ? {
        ...data,
        goal_amount_2: data.goal_amount_2 || 0,
        goal_amount_3: data.goal_amount_3 || 0,
      } as SellerGoal : null;
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}

export function useAllSellerGoals(month?: string) {
  const m = month || format(new Date(), 'yyyy-MM');

  return useQuery({
    queryKey: ['seller-goals-all', m],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('seller_goals')
        .select('*')
        .eq('month', m);
      if (error) throw error;
      return (data || []).map((g: any) => ({
        ...g,
        goal_amount_2: g.goal_amount_2 || 0,
        goal_amount_3: g.goal_amount_3 || 0,
      })) as SellerGoal[];
    },
    staleTime: 60 * 1000,
  });
}
