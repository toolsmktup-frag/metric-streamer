import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Plus, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Seller {
  id: string;
  full_name: string | null;
}

interface ManualSaleDialogProps {
  sellers: Seller[];
}

const schema = z.object({
  seller_id: z.string().uuid({ message: 'Selecione a vendedora' }),
  product_name: z
    .string()
    .trim()
    .min(1, 'Produto é obrigatório')
    .max(200, 'Máximo de 200 caracteres'),
  amount: z
    .number({ invalid_type_error: 'Informe um valor' })
    .positive('Valor deve ser maior que zero')
    .max(10_000_000, 'Valor muito alto'),
  commission_pct: z
    .number({ invalid_type_error: 'Informe a comissão' })
    .min(0, 'Mínimo 0%')
    .max(100, 'Máximo 100%'),
  sale_date: z.date({ required_error: 'Selecione a data' }).refine(
    (d) => d <= new Date(),
    'Data não pode ser futura',
  ),
});

type FormValues = z.infer<typeof schema>;

export function ManualSaleDialog({ sellers }: ManualSaleDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      seller_id: '',
      product_name: '',
      amount: undefined as unknown as number,
      commission_pct: 10,
      sale_date: startOfDay(new Date()),
    },
  });

  const amount = form.watch('amount');
  const commissionPct = form.watch('commission_pct');
  const previewCommission =
    Number.isFinite(amount) && Number.isFinite(commissionPct)
      ? (Number(amount) * Number(commissionPct)) / 100
      : 0;

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc('insert_manual_sale', {
        p_seller_id: values.seller_id,
        p_product_name: values.product_name,
        p_amount: values.amount,
        p_commission_pct: values.commission_pct,
        p_sale_date: values.sale_date.toISOString(),
      });

      if (error) throw error;

      toast.success('Venda manual registrada com sucesso');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['crm-sales'] }),
        queryClient.invalidateQueries({ queryKey: ['crm-lead-activities'] }),
        queryClient.invalidateQueries({ queryKey: ['seller-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['seller-goals-all'] }),
      ]);

      form.reset({
        seller_id: '',
        product_name: '',
        amount: undefined as unknown as number,
        commission_pct: 10,
        sale_date: startOfDay(new Date()),
      });
      setOpen(false);
    } catch (err: any) {
      console.error('insert_manual_sale error:', err);
      toast.error(err?.message || 'Erro ao registrar venda');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Inserir venda manual
      </Button>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Inserir venda manual</DialogTitle>
          <DialogDescription>
            Registre uma venda PIX direto que não veio por webhook. Vai refletir
            no painel da vendedora e no CRM Analytics.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="seller_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendedora</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a vendedora" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sellers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.full_name || 'Sem nome'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="product_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Produto</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: Plano Anual" maxLength={200} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor (R$)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          field.onChange(v === '' ? undefined : Number(v));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="commission_pct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comissão (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min="0"
                        max="100"
                        placeholder="10"
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          field.onChange(v === '' ? undefined : Number(v));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="sale_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data da venda</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground',
                          )}
                        >
                          {field.value
                            ? format(field.value, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                            : 'Selecione a data'}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(d) => d && field.onChange(d)}
                        disabled={(date) => date > new Date() || date < new Date('2020-01-01')}
                        initialFocus
                        className={cn('p-3 pointer-events-auto')}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Comissão calculada: </span>
              <span className="font-mono font-semibold text-foreground">
                {previewCommission.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Registrar venda
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
