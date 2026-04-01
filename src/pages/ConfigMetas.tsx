import React, { useState, useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAllSellerGoals } from '@/hooks/useSellerGoals';
import { useCurrentUserRole } from '@/hooks/useCurrentUserRole';
import { format, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/formatters';
import { Target, ChevronLeft, ChevronRight, Save, Users } from 'lucide-react';

export default function ConfigMetas() {
  const { data: role, isLoading: roleLoading } = useCurrentUserRole();
  const isAdmin = role === 'admin' || role === 'gestor';

  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const monthKey = format(selectedMonth, 'yyyy-MM');
  const monthLabel = format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR });

  const { data: members = [], isLoading: loadingMembers } = useTeamMembers();
  const { data: goals = [], isLoading: loadingGoals } = useAllSellerGoals(monthKey);
  const queryClient = useQueryClient();

  // Only show active sellers
  const sellers = useMemo(
    () => members.filter(m => m.role === 'vendedor' && m.status === 'active'),
    [members]
  );

  // Local state for goal inputs
  const [goalValues, setGoalValues] = useState<Record<string, string>>({});

  // Sync from DB when goals load
  React.useEffect(() => {
    const vals: Record<string, string> = {};
    for (const g of goals) {
      vals[g.user_id] = String(g.goal_amount);
    }
    setGoalValues(vals);
  }, [goals]);

  const saveMutation = useMutation({
    mutationFn: async (entries: { user_id: string; amount: number }[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      for (const entry of entries) {
        const { error } = await (supabase as any)
          .from('seller_goals')
          .upsert(
            {
              user_id: entry.user_id,
              month: monthKey,
              goal_amount: entry.amount,
              created_by: user.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,month' }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-goals-all'] });
      queryClient.invalidateQueries({ queryKey: ['seller-goal'] });
      toast.success('Metas salvas com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao salvar metas');
    },
  });

  function handleSave() {
    const entries = sellers.map(s => ({
      user_id: s.id,
      amount: parseFloat(goalValues[s.id] || '0') || 0,
    }));
    saveMutation.mutate(entries);
  }

  function handleValueChange(userId: string, value: string) {
    // Allow only numbers and decimals
    const clean = value.replace(/[^\d.,]/g, '').replace(',', '.');
    setGoalValues(prev => ({ ...prev, [userId]: clean }));
  }

  if (roleLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p className="text-lg font-medium">Acesso restrito</p>
        <p className="text-sm">Apenas administradores podem configurar metas.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Configurações de Metas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Defina a meta mensal de faturamento para cada vendedora
          </p>
        </div>
      </div>

      {/* Month selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedMonth(prev => subMonths(prev, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-lg font-semibold capitalize">{monthLabel}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedMonth(prev => addMonths(prev, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sellers list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-primary" />
            Vendedoras ({sellers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingMembers || loadingGoals ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-10 flex-1" />
              </div>
            ))
          ) : sellers.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">
              Nenhuma vendedora ativa encontrada.
            </p>
          ) : (
            sellers.map(seller => {
              const currentValue = goalValues[seller.id] || '';
              const numValue = parseFloat(currentValue) || 0;

              return (
                <div
                  key={seller.id}
                  className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={seller.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {(seller.full_name || '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {seller.full_name || 'Sem nome'}
                    </p>
                    <p className="text-xs text-muted-foreground">Vendedora</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={currentValue}
                      onChange={(e) => handleValueChange(seller.id, e.target.value)}
                      placeholder="0,00"
                      className="w-32 px-3 py-2 text-right rounded-md border bg-background text-foreground text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  {numValue > 0 && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:block">
                      {formatCurrency(numValue)}
                    </span>
                  )}
                </div>
              );
            })
          )}

          {sellers.length > 0 && (
            <div className="pt-4 flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? 'Salvando...' : 'Salvar Metas'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
