import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Users, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFunnels } from '@/hooks/useFunnels';
import { useLeadFunnelStages } from '@/hooks/useLeadFunnelStages';
import { supabase } from '@/integrations/supabase/client';

interface BulkEnrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowId: string | null;
  flowName: string;
  isFlowActive: boolean;
}

interface PreviewResult {
  total_leads: number;
  flow_name: string;
}

interface EnrollResult {
  enrolled: number;
  skipped_already_active: number;
  skipped_no_contact: number;
  errors: number;
  total_leads: number;
}

export default function BulkEnrollDialog({
  open, onOpenChange, flowId, flowName, isFlowActive,
}: BulkEnrollDialogProps) {
  const { data: funnels = [] } = useFunnels();
  const [funnelId, setFunnelId] = useState<string>('');
  const { data: stagesMap = {} } = useLeadFunnelStages(funnelId ? [funnelId] : []);
  const stages = funnelId ? (stagesMap[funnelId] || []) : [];

  const [selectedStages, setSelectedStages] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [result, setResult] = useState<EnrollResult | null>(null);

  const reset = () => {
    setFunnelId('');
    setSelectedStages(new Set());
    setPreview(null);
    setResult(null);
  };

  const toggleStage = (id: string) => {
    setSelectedStages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setPreview(null);
  };

  const stageIds = useMemo(() => Array.from(selectedStages), [selectedStages]);
  const canPreview = !!flowId && !!funnelId && stageIds.length > 0;

  const handlePreview = async () => {
    if (!canPreview) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke('wz-bulk-enroll', {
        body: { flow_id: flowId, funnel_id: funnelId, stage_ids: stageIds, dry_run: true },
      });
      if (error) throw error;
      setPreview({ total_leads: data.total_leads || 0, flow_name: data.flow_name || flowName });
    } catch (err: any) {
      toast.error(`Preview falhou: ${err.message || err}`);
    } finally {
      setPreviewing(false);
    }
  };

  const handleEnroll = async () => {
    if (!canPreview) return;
    if (!isFlowActive) {
      toast.error('Ative o fluxo antes de enrolar leads');
      return;
    }
    const confirmed = window.confirm(
      `Enrolar ${preview?.total_leads || '?'} leads na automação "${flowName}"? Esta ação não pode ser desfeita facilmente.`
    );
    if (!confirmed) return;

    setEnrolling(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('wz-bulk-enroll', {
        body: { flow_id: flowId, funnel_id: funnelId, stage_ids: stageIds, dry_run: false },
      });
      if (error) throw error;
      setResult({
        enrolled: data.enrolled || 0,
        skipped_already_active: data.skipped_already_active || 0,
        skipped_no_contact: data.skipped_no_contact || 0,
        errors: data.errors || 0,
        total_leads: data.total_leads || 0,
      });
      toast.success(`${data.enrolled} leads enrolados!`);
    } catch (err: any) {
      toast.error(`Falha ao enrolar: ${err.message || err}`);
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Aplicar a leads existentes
          </DialogTitle>
          <DialogDescription>
            Adiciona leads que já estão em colunas selecionadas ao fluxo <strong>{flowName}</strong>.
            Cada lead pula o gatilho e começa direto pelo primeiro nó.
          </DialogDescription>
        </DialogHeader>

        {!isFlowActive && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
            <span className="text-foreground">
              Este fluxo está <strong>inativo</strong>. Ative-o antes de enrolar leads.
            </span>
          </div>
        )}

        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Funil</Label>
            <Select value={funnelId} onValueChange={(v) => { setFunnelId(v); setSelectedStages(new Set()); setPreview(null); }}>
              <SelectTrigger><SelectValue placeholder="Selecione o funil" /></SelectTrigger>
              <SelectContent>
                {funnels.map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {funnelId && (
            <div className="space-y-2">
              <Label>Colunas (selecione 1 ou mais)</Label>
              <ScrollArea className="h-48 border border-border rounded-lg p-2">
                <div className="space-y-1">
                  {stages.length === 0 && (
                    <p className="text-xs text-muted-foreground p-2">Sem colunas neste funil.</p>
                  )}
                  {stages.map((s: any) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedStages.has(s.id)}
                        onCheckedChange={() => toggleStage(s.id)}
                      />
                      <span className="text-sm text-foreground">{s.name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {preview && !result && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/30">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm text-foreground">
                <strong>{preview.total_leads}</strong> leads serão enrolados.
              </span>
            </div>
          )}

          {result && (
            <div className="space-y-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/30">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-semibold text-foreground">Concluído</span>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>✅ Enrolados: <strong className="text-foreground">{result.enrolled}</strong></p>
                {result.skipped_already_active > 0 && (
                  <p>⏭️ Já em execução: {result.skipped_already_active}</p>
                )}
                {result.skipped_no_contact > 0 && (
                  <p>⚠️ Sem telefone/email: {result.skipped_no_contact}</p>
                )}
                {result.errors > 0 && (
                  <p className="text-destructive">❌ Erros: {result.errors}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={!canPreview || previewing || enrolling}
          >
            {previewing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Preview
          </Button>
          <Button
            onClick={handleEnroll}
            disabled={!canPreview || !preview || enrolling || !isFlowActive}
          >
            {enrolling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Enrolar leads
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
