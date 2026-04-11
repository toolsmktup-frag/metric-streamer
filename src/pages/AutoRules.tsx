import { useState } from 'react';
import { Zap, Plus, Trash2, Activity, AlertTriangle, PauseCircle, TrendingDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/sonner';
import {
  useAutoRules,
  useRecentLogs,
  useCreateRule,
  useToggleRule,
  useDeleteRule,
  type RuleCondition,
  type AutomationRule,
} from '@/hooks/useAutoRules';
import { useFunnels } from '@/hooks/useFunnels';
import { useMetaEntities } from '@/hooks/useMetaEntities';

const METRICS = [
  { value: 'cpa', label: 'CPA (Custo por Aquisição)' },
  { value: 'roi', label: 'ROI (%)' },
  { value: 'roas', label: 'ROAS' },
  { value: 'spend', label: 'Gasto (R$)' },
  { value: 'revenue', label: 'Receita (R$)' },
];

const OPERATORS = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '=', label: '=' },
];

const ACTIONS = [
  { value: 'pause_campaign', label: 'Pausar Campanha', icon: PauseCircle },
  { value: 'reduce_budget', label: 'Reduzir Orçamento (%)', icon: TrendingDown },
  { value: 'alert', label: 'Enviar Alerta', icon: AlertTriangle },
];

const SCOPE_LABELS: Record<string, string> = {
  campaign: 'Campanhas',
  adset: 'Conjuntos',
  ad: 'Anúncios',
};

function NewRuleDialog({ onClose }: { onClose: () => void }) {
  const { data: funnels = [] } = useFunnels();
  const createRule = useCreateRule();
  const [name, setName] = useState('');
  const [action, setAction] = useState<string>('alert');
  const [scopeType, setScopeType] = useState<'campaign' | 'adset' | 'ad'>('campaign');
  const [funnelId, setFunnelId] = useState<string>('');
  const [budgetPercent, setBudgetPercent] = useState('20');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allSelected, setAllSelected] = useState(true);
  const [conditions, setConditions] = useState<RuleCondition[]>([
    { metric: 'cpa', operator: '>', value: 50 },
  ]);

  const { data: entities = [], isLoading: entitiesLoading } = useMetaEntities(scopeType);

  const handleScopeChange = (val: string) => {
    setScopeType(val as 'campaign' | 'adset' | 'ad');
    setSelectedIds([]);
    setAllSelected(true);
  };

  const toggleEntity = (id: string) => {
    setAllSelected(false);
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setAllSelected(false);
      setSelectedIds([]);
    } else {
      setAllSelected(true);
      setSelectedIds([]);
    }
  };

  const addCondition = () => setConditions(prev => [...prev, { metric: 'cpa', operator: '>', value: 0 }]);
  const removeCondition = (i: number) => setConditions(prev => prev.filter((_, idx) => idx !== i));
  const updateCondition = (i: number, field: keyof RuleCondition, val: any) => {
    setConditions(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: field === 'value' ? Number(val) : val } : c));
  };

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Informe o nome da regra'); return; }
    if (conditions.length === 0) { toast.error('Adicione ao menos uma condição'); return; }
    if (!allSelected && selectedIds.length === 0) { toast.error('Selecione ao menos uma entidade ou marque "Todas"'); return; }

    try {
      await createRule.mutateAsync({
        name,
        is_active: true,
        conditions,
        action: action as AutomationRule['action'],
        action_params: action === 'reduce_budget' ? { percent: Number(budgetPercent) } : {},
        scope_type: scopeType as AutomationRule['scope_type'],
        scope_ids: allSelected ? [] : selectedIds,
        funnel_id: funnelId || null,
        check_interval_minutes: 15,
      });
      toast.success('Regra criada com sucesso');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar regra');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-muted-foreground">Nome da Regra</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Pausar se CPA > R$50" />
      </div>

      <div>
        <label className="text-sm font-medium text-muted-foreground mb-2 block">Condições (todas devem ser verdadeiras)</label>
        {conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <Select value={c.metric} onValueChange={v => updateCondition(i, 'metric', v)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {METRICS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={c.operator} onValueChange={v => updateCondition(i, 'operator', v)}>
              <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPERATORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={c.value}
              onChange={e => updateCondition(i, 'value', e.target.value)}
              className="w-[120px]"
            />
            {conditions.length > 1 && (
              <Button variant="ghost" size="icon" onClick={() => removeCondition(i)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addCondition}>
          <Plus className="h-3 w-3 mr-1" /> Adicionar condição
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-muted-foreground">Ação</label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Escopo</label>
          <Select value={scopeType} onValueChange={handleScopeChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="campaign">Campanha</SelectItem>
              <SelectItem value="adset">Conjunto de Anúncios</SelectItem>
              <SelectItem value="ad">Anúncio</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Entity Selector */}
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-2 block">
          {SCOPE_LABELS[scopeType]} monitoradas
        </label>
        <div className="border rounded-md">
          <div className="flex items-center gap-2 p-3 border-b bg-muted/30">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              id="select-all"
            />
            <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
              Todas ({entities.length})
            </label>
          </div>
          {entitiesLoading ? (
            <div className="flex items-center justify-center p-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Carregando...
            </div>
          ) : entities.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              Nenhuma entidade sincronizada. Sincronize suas campanhas primeiro.
            </p>
          ) : (
            <ScrollArea className="max-h-[180px]">
              <div className="p-2 space-y-1">
                {entities.map(entity => (
                  <div
                    key={entity.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={allSelected || selectedIds.includes(entity.id)}
                      disabled={allSelected}
                      onCheckedChange={() => toggleEntity(entity.id)}
                      id={`entity-${entity.id}`}
                    />
                    <label htmlFor={`entity-${entity.id}`} className="text-sm flex-1 cursor-pointer truncate">
                      {entity.name}
                    </label>
                    <Badge
                      variant={entity.status === 'ACTIVE' ? 'default' : 'secondary'}
                      className="text-[10px] shrink-0"
                    >
                      {entity.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
        {!allSelected && selectedIds.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {selectedIds.length} selecionada(s)
          </p>
        )}
      </div>

      {action === 'reduce_budget' && (
        <div>
          <label className="text-sm font-medium text-muted-foreground">Reduzir em (%)</label>
          <Input type="number" value={budgetPercent} onChange={e => setBudgetPercent(e.target.value)} className="w-[120px]" />
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-muted-foreground">Funil (opcional)</label>
      <Select value={funnelId || '__all__'} onValueChange={v => setFunnelId(v === '__all__' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="Todos os funis" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os funis</SelectItem>
            {funnels.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={createRule.isPending}>
          {createRule.isPending ? 'Criando...' : 'Criar Regra'}
        </Button>
      </div>
    </div>
  );
}

function actionLabel(action: string) {
  return ACTIONS.find(a => a.value === action)?.label || action;
}

function ActionIcon({ action }: { action: string }) {
  const found = ACTIONS.find(a => a.value === action);
  if (!found) return null;
  const Icon = found.icon;
  return <Icon className="h-4 w-4" />;
}

export default function AutoRules() {
  const { data: rules = [], isLoading } = useAutoRules();
  const { data: logs = [] } = useRecentLogs();
  const toggleRule = useToggleRule();
  const deleteRule = useDeleteRule();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta regra?')) return;
    try {
      await deleteRule.mutateAsync(id);
      toast.success('Regra excluída');
    } catch { toast.error('Erro ao excluir'); }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Auto-Rules</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Nova Regra</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Criar Nova Regra</DialogTitle>
            </DialogHeader>
            <NewRuleDialog onClose={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Regras ({rules.length})</TabsTrigger>
          <TabsTrigger value="logs">Logs Recentes</TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <p className="p-6 text-center text-muted-foreground">Carregando...</p>
              ) : rules.length === 0 ? (
                <div className="p-12 text-center space-y-2">
                  <Zap className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <p className="text-muted-foreground">Nenhuma regra criada ainda</p>
                  <p className="text-sm text-muted-foreground/60">Crie regras para monitorar métricas e executar ações automaticamente</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ativa</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Condições</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Escopo</TableHead>
                      <TableHead>Último Disparo</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map(rule => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={checked => toggleRule.mutate({ id: rule.id, is_active: checked })}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(rule.conditions as RuleCondition[]).map((c, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {c.metric.toUpperCase()} {c.operator} {c.value}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <ActionIcon action={rule.action} />
                            <span className="text-sm">{actionLabel(rule.action)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-xs capitalize">{rule.scope_type}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {rule.scope_ids && rule.scope_ids.length > 0
                                ? `${rule.scope_ids.length} selecionada(s)`
                                : 'Todas'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {rule.last_triggered_at
                            ? new Date(rule.last_triggered_at).toLocaleString('pt-BR')
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4" /> Execuções Recentes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {logs.length === 0 ? (
                <p className="p-6 text-center text-muted-foreground">Nenhuma execução registrada</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Regra</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Alvo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">
                          {new Date(log.triggered_at).toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {(log as any).automation_rules?.name || '—'}
                        </TableCell>
                        <TableCell className="text-sm">{actionLabel(log.action_taken)}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {log.target_id || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                            {log.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
