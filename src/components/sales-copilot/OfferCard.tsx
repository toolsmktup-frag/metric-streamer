import { Star, Pencil, Copy, Trash2, MoreVertical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  type SalesOffer,
  useToggleOfferActive, useSetFeaturedOffer, useDeleteOffer, useDuplicateOffer,
} from '@/hooks/useSalesOffers';
import { cn } from '@/lib/utils';

interface Props {
  offer: SalesOffer;
  onEdit: (offer: SalesOffer) => void;
}

const STATUS_LABEL: Record<SalesOffer['status'], string> = {
  draft: 'Rascunho',
  active: 'Ativa',
  paused: 'Pausada',
  archived: 'Encerrada',
};

export function OfferCard({ offer, onEdit }: Props) {
  const toggleActive = useToggleOfferActive();
  const setFeatured = useSetFeaturedOffer();
  const del = useDeleteOffer();
  const duplicate = useDuplicateOffer();

  const isActive = offer.status === 'active';

  return (
    <Card className={cn('transition-colors', offer.is_featured && 'border-primary/60 bg-primary/5')}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {offer.is_featured && (
                <Badge variant="default" className="gap-1 h-5">
                  <Star className="h-3 w-3 fill-current" />
                  Destaque
                </Badge>
              )}
              <Badge variant={isActive ? 'default' : 'secondary'} className="h-5">
                {STATUS_LABEL[offer.status]}
              </Badge>
            </div>
            <h3 className="text-sm font-semibold mt-1.5 truncate">{offer.name}</h3>
            {offer.short_description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{offer.short_description}</p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(offer)}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicate.mutate(offer)}>
                <Copy className="h-3.5 w-3.5 mr-2" /> Duplicar
              </DropdownMenuItem>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir oferta?</AlertDialogTitle>
                    <AlertDialogDescription>
                      "{offer.name}" será removida permanentemente. A IA deixa de ter acesso a ela.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => del.mutate(offer.id)}>
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {offer.price_promo && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{offer.price_promo}</span>
            {offer.price_full && <span className="ml-2 line-through opacity-60">{offer.price_full}</span>}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Switch
              checked={isActive}
              onCheckedChange={(v) => toggleActive.mutate({ id: offer.id, active: v })}
            />
            <span className="text-muted-foreground">{isActive ? 'Ativa pra IA' : 'Inativa'}</span>
          </label>
          <Button
            variant={offer.is_featured ? 'default' : 'ghost'}
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setFeatured.mutate({ id: offer.id, featured: !offer.is_featured })}
          >
            <Star className={cn('h-3 w-3', offer.is_featured && 'fill-current')} />
            {offer.is_featured ? 'Destacada' : 'Destacar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
