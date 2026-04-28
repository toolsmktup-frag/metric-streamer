import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCreateOffer, useUpdateOffer, type SalesOffer, type OfferStatus } from '@/hooks/useSalesOffers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer?: SalesOffer | null;
}

const EMPTY = {
  name: '',
  status: 'active' as OfferStatus,
  short_description: '',
  price_promo: '',
  price_full: '',
  access_period: '',
  composition: '',
  target_audience: '',
  ai_rules: '',
};

export function OfferDialog({ open, onOpenChange, offer }: Props) {
  const create = useCreateOffer();
  const update = useUpdateOffer();
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (offer) {
      setForm({
        name: offer.name || '',
        status: offer.status,
        short_description: offer.short_description || '',
        price_promo: offer.price_promo || '',
        price_full: offer.price_full || '',
        access_period: offer.access_period || '',
        composition: offer.composition || '',
        target_audience: offer.target_audience || '',
        ai_rules: offer.ai_rules || '',
      });
    } else if (open) {
      setForm(EMPTY);
    }
  }, [offer, open]);

  const isPending = create.isPending || update.isPending;

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      status: form.status,
      short_description: form.short_description || null,
      price_promo: form.price_promo || null,
      price_full: form.price_full || null,
      access_period: form.access_period || null,
      composition: form.composition || null,
      target_audience: form.target_audience || null,
      ai_rules: form.ai_rules || null,
    };
    if (offer) {
      await update.mutateAsync({ id: offer.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const setField = (k: keyof typeof EMPTY) => (e: any) =>
    setForm((f) => ({ ...f, [k]: typeof e === 'string' ? e : e?.target?.value ?? '' }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{offer ? 'Editar oferta' : 'Nova oferta'}</DialogTitle>
          <DialogDescription>
            Os campos abaixo viram conhecimento da IA. Quanto mais claro e específico, melhor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="name">Nome interno</Label>
              <Input
                id="name"
                value={form.name}
                onChange={setField('name')}
                placeholder="Ex: Combo Erveiros — Promo Nov/26"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setField('status')(v as OfferStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="paused">Pausada</SelectItem>
                  <SelectItem value="archived">Encerrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="short">Resumo curto</Label>
            <Input
              id="short"
              value={form.short_description}
              onChange={setField('short_description')}
              placeholder="Ex: 2 cursos juntos por 12x R$ 129,70"
            />
            <p className="text-xs text-muted-foreground">Aparece no card da listagem.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="promo">Preço promocional</Label>
              <Input
                id="promo"
                value={form.price_promo}
                onChange={setField('price_promo')}
                placeholder="12x R$ 129,70 ou R$ 1.297 à vista"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="full">Preço cheio (referência)</Label>
              <Input
                id="full"
                value={form.price_full}
                onChange={setField('price_full')}
                placeholder="R$ 5.000 (ancoragem)"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="access">Acesso / garantia</Label>
            <Input
              id="access"
              value={form.access_period}
              onChange={setField('access_period')}
              placeholder="2 anos com suporte"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comp">Composição / o que tá incluso</Label>
            <Textarea
              id="comp"
              value={form.composition}
              onChange={setField('composition')}
              rows={6}
              className="font-mono text-sm"
              placeholder={'- Curso dos Erveiros — +30 plantas, preparos práticos (chás, tinturas, pomadas, géis, extrato glicólico)\n- Alinhamento com Ervas — +40 plantas, foco vibracional/emocional, protocolo completo'}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="target">Pra quem é / dor que resolve</Label>
            <Textarea
              id="target"
              value={form.target_audience}
              onChange={setField('target_audience')}
              rows={2}
              placeholder="Pessoas que querem cuidar da saúde naturalmente, montar farmácia em casa, reduzir remédios químicos"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rules">Regras de uso pela IA</Label>
            <Textarea
              id="rules"
              value={form.ai_rules}
              onChange={setField('ai_rules')}
              rows={3}
              placeholder="Se o cliente já comprou um dos cursos, não ofertar combo cheio — sugerir apenas o curso que falta. Apresentar preço só depois de gerar valor."
            />
            <p className="text-xs text-muted-foreground">Quando ofertar, quando não ofertar, exceções, condições.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isPending || !form.name.trim()}>
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
