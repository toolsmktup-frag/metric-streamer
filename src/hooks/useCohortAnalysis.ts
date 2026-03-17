import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CohortRow {
  cohort_month: string;       // "2024-01-01"
  cohort_label: string;       // "Jan/2024"
  customer_count: number;
  avg_ltv_1m: number;
  avg_ltv_2m: number;
  avg_ltv_3m: number;
  avg_ltv_6m: number;
  avg_ltv_9m: number;
  avg_ltv_12m: number;
  total_revenue_1m: number;
  months_since_cohort: number;
}

export const COHORT_WINDOWS = [
  { key: 'avg_ltv_1m',  label: '1m',  months: 1  },
  { key: 'avg_ltv_2m',  label: '2m',  months: 2  },
  { key: 'avg_ltv_3m',  label: '3m',  months: 3  },
  { key: 'avg_ltv_6m',  label: '6m',  months: 6  },
  { key: 'avg_ltv_9m',  label: '9m',  months: 9  },
  { key: 'avg_ltv_12m', label: '12m', months: 12 },
] as const;

export type CohortWindowKey = typeof COHORT_WINDOWS[number]['key'];

async function fetchCohortData(): Promise<CohortRow[]> {
  const { data, error } = await (supabase as any).rpc('fn_cohort_analysis');
  if (error) throw new Error(error.message);
  return (data as CohortRow[]) ?? [];
}

export function useCohortAnalysis() {
  return useQuery({
    queryKey: ['cohort_analysis'],
    queryFn: fetchCohortData,
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
