import { useState } from 'react';
import { Plus, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSalesOffers, type SalesOffer } from '@/hooks/useSalesOffers';
import { OfferCard } from './OfferCard';
import { OfferDialog } from './OfferDialog';

export function OffersTab() {
  const { data: offers, isLoading } = useSalesOffers();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SalesOffer | null>(null);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (offer: SalesOffer) => { setEditing(offer); setDialogOpen(true); };

  const activeCount = offers?.filter((o) => o.status === 'active').length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            Cadastre suas ofertas/promoções. Apenas as <strong>ativas</strong> entram no contexto da IA.
            A oferta <strong>destacada</strong> é priorizada quando o cliente está em descoberta.
          </p>
          {!isLoading && offers && (
            <p className="text-xs text-muted-foreground mt-1">
              {activeCount} ativa{activeCount === 1 ? '' : 's'} de {offers.length} total
            </p>
          )}
        </div>
        <Button onClick={openNew} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" /> Nova oferta
        </Button>
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !offers?.length ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center gap-3">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Nenhuma oferta cadastrada ainda</p>
              <p className="text-xs text-muted-foreground mt-1">
                Cadastre seus combos, cursos e promoções pra IA ofertar com precisão.
              </p>
            </div>
            <Button onClick={openNew} variant="outline" className="gap-1.5">
              <Plus className="h-4 w-4" /> Criar primeira oferta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} onEdit={openEdit} />
          ))}
        </div>
      )}

      <OfferDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        offer={editing}
      />
    </div>
  );
}
