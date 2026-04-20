import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shuffle, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRedistributeLeads } from '@/hooks/useRedistributeLeads';
import type { LeadFunnelStage, LeadStagePosition, Lead } from '@/types/leadFunnels';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funnelId: string;
  stages: LeadFunnelStage[];
  positions: (LeadStagePosition & { lead?: Lead })[];
}

type Scope = 'unassigned' | 'assigned' | 'all' | 'from_seller';

interface Seller {
  id: string;
  full_name: string;
}

const RedistributeLeadsDialog: React.FC<Props> = ({ open, onOpenChange, funnelId, stages, positions }) => {
  const [scope, setScope] = useState<Scope>('unassigned');
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [selectedSellerIds, setSelectedSellerIds] = useState<string[]>([]);
  const [fromSellerId, setFromSellerId] = useState<string | null>(null);
  const redistribute = useRedistributeLeads();

  // Fetch sellers with access to this funnel (destination pool)
  const { data: sellers = [] } = useQuery({
    queryKey: ['funnel-sellers', funnelId],
    queryFn: async (): Promise<Seller[]> => {
      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      if (!orgId) return [];

      const { data: accessRecords, error: accessErr } = await (supabase as any)
        .from('lead_funnel_access')
        .select('user_id')
        .eq('organization_id', orgId)
        .or(`funnel_id.eq.${funnelId},funnel_id.is.null`);
      if (accessErr) throw accessErr;

      if (!accessRecords?.length) return [];

      const userIds = [...new Set(accessRecords.map((r: any) => r.user_id))] as string[];

      const { data: profiles, error: profErr } = await (supabase as any)
        .from('user_profiles')
        .select('id, full_name, role')
        .in('id', userIds)
        .eq('status', 'active');
      if (profErr) throw profErr;

      return (profiles || []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name || 'Sem nome',
      }));
    },
    enabled: open,
  });

  // Fetch sellers WHO HAVE leads in this funnel (origin pool — includes inactive)
  const { data: sellersWithLeads = [] } = useQuery({
    queryKey: ['funnel-sellers-with-leads', funnelId],
    queryFn: async (): Promise<Seller[]> => {
      // Collect distinct assigned_to from current positions in memory first
      const assignedIds = [
        ...new Set(
          positions
            .map(p => p.lead?.assigned_to)
            .filter((v): v is string => !!v)
        ),
      ];
      if (!assignedIds.length) return [];

      const { data: profiles, error } = await (supabase as any)
        .from('user_profiles')
        .select('id, full_name, status')
        .in('id', assignedIds);
      if (error) throw error;

      return (profiles || []).map((p: any) => ({
        id: p.id,
        full_name: (p.full_name || 'Sem nome') + (p.status !== 'active' ? ' (inativo)' : ''),
      }));
    },
    enabled: open && scope === 'from_seller',
  });

  // Auto-select all destination sellers when loaded
  useEffect(() => {
    if (sellers.length > 0 && selectedSellerIds.length === 0) {
      setSelectedSellerIds(sellers.map(s => s.id));
    }
  }, [sellers]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setScope('unassigned');
      setSelectedStageIds([]);
      setSelectedSellerIds([]);
      setFromSellerId(null);
    }
  }, [open]);

  // Destination sellers exclude the origin seller
  const destinationSellers = useMemo(
    () => (scope === 'from_seller' && fromSellerId ? sellers.filter(s => s.id !== fromSellerId) : sellers),
    [sellers, scope, fromSellerId]
  );

  const effectiveSelectedSellerIds = useMemo(
    () => selectedSellerIds.filter(id => destinationSellers.some(s => s.id === id)),
    [selectedSellerIds, destinationSellers]
  );

  // Preview calculation
  const preview = useMemo(() => {
    if (!effectiveSelectedSellerIds.length) return { total: 0, perSeller: [] as { id: string; name: string; count: number }[] };
    if (scope === 'from_seller' && !fromSellerId) return { total: 0, perSeller: [] };

    let filtered = positions;
    if (selectedStageIds.length > 0) {
      filtered = filtered.filter(p => selectedStageIds.includes(p.stage_id));
    }

    const uniqueLeadIds = [...new Set(filtered.map(p => p.lead_id))];

    let scopeFiltered: string[];
    if (scope === 'unassigned') {
      scopeFiltered = uniqueLeadIds.filter(id => {
        const pos = filtered.find(p => p.lead_id === id);
        return !pos?.lead?.assigned_to;
      });
    } else if (scope === 'assigned') {
      scopeFiltered = uniqueLeadIds.filter(id => {
        const pos = filtered.find(p => p.lead_id === id);
        return !!pos?.lead?.assigned_to;
      });
    } else if (scope === 'from_seller') {
      scopeFiltered = uniqueLeadIds.filter(id => {
        const pos = filtered.find(p => p.lead_id === id);
        return pos?.lead?.assigned_to === fromSellerId;
      });
    } else {
      scopeFiltered = uniqueLeadIds;
    }

    const total = scopeFiltered.length;
    const base = Math.floor(total / effectiveSelectedSellerIds.length);
    const remainder = total % effectiveSelectedSellerIds.length;

    const perSeller = effectiveSelectedSellerIds.map((id, idx) => {
      const seller = destinationSellers.find(s => s.id === id);
      return {
        id,
        name: seller?.full_name || 'Sem nome',
        count: base + (idx < remainder ? 1 : 0),
      };
    });

    return { total, perSeller };
  }, [positions, selectedStageIds, effectiveSelectedSellerIds, scope, fromSellerId, destinationSellers]);

  const toggleStage = (stageId: string) => {
    setSelectedStageIds(prev =>
      prev.includes(stageId) ? prev.filter(id => id !== stageId) : [...prev, stageId]
    );
  };

  const toggleSeller = (sellerId: string) => {
    setSelectedSellerIds(prev =>
      prev.includes(sellerId) ? prev.filter(id => id !== sellerId) : [...prev, sellerId]
    );
  };

  const handleConfirm = () => {
    redistribute.mutate(
      {
        funnelId,
        scope,
        stageIds: selectedStageIds,
        sellerIds: effectiveSelectedSellerIds,
        fromSellerId: scope === 'from_seller' ? fromSellerId : null,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const sourceSellerName = sellersWithLeads.find(s => s.id === fromSellerId)?.full_name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-primary" />
            Redistribuir Leads
          </DialogTitle>
          <DialogDescription>
            Distribua leads igualmente entre os vendedores selecionados (round-robin).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scope */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Escopo</label>
            <Select value={scope} onValueChange={v => setScope(v as Scope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Leads sem vendedor</SelectItem>
                <SelectItem value="assigned">Leads com vendedor</SelectItem>
                <SelectItem value="all">Todos os leads</SelectItem>
                <SelectItem value="from_seller">Leads de um vendedor específico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Source seller (only when scope = from_seller) */}
          {scope === 'from_seller' && (
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Vendedor de origem
              </label>
              <Select value={fromSellerId || ''} onValueChange={v => setFromSellerId(v || null)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o vendedor de origem..." />
                </SelectTrigger>
                <SelectContent>
                  {sellersWithLeads.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Nenhum vendedor com leads neste funil.
                    </div>
                  ) : (
                    sellersWithLeads.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Os leads atribuídos a este vendedor serão transferidos.
              </p>
            </div>
          )}

          {/* Stage filter */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Filtrar por etapa <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {stages.map(stage => (
                <label key={stage.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedStageIds.includes(stage.id)}
                    onCheckedChange={() => toggleStage(stage.id)}
                  />
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm">{stage.name}</span>
                </label>
              ))}
            </div>
            {selectedStageIds.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">Nenhuma selecionada = todas as etapas</p>
            )}
          </div>

          {/* Destination Sellers */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {scope === 'from_seller' ? 'Distribuir para' : 'Vendedores'}
            </label>
            {destinationSellers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum vendedor com acesso a este funil.</p>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {destinationSellers.map(seller => (
                  <label key={seller.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedSellerIds.includes(seller.id)}
                      onCheckedChange={() => toggleSeller(seller.id)}
                    />
                    <span className="text-sm">{seller.full_name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          {effectiveSelectedSellerIds.length > 0 && preview.total > 0 && (
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm font-medium text-foreground mb-2">
                Preview: {preview.total} lead(s)
                {scope === 'from_seller' && sourceSellerName ? ` de ${sourceSellerName}` : ''} serão redistribuídos
              </p>
              <div className="space-y-1">
                {preview.perSeller.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{s.name}</span>
                    <span className="font-medium text-foreground">{s.count} lead(s)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {effectiveSelectedSellerIds.length > 0 && preview.total === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Nenhum lead encontrado com os filtros selecionados.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              redistribute.isPending ||
              effectiveSelectedSellerIds.length === 0 ||
              preview.total === 0 ||
              (scope === 'from_seller' && !fromSellerId)
            }
          >
            {redistribute.isPending ? 'Redistribuindo...' : `Redistribuir ${preview.total} lead(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RedistributeLeadsDialog;
