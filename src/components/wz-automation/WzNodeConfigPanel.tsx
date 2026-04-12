import React, { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Copy, Plus, X, MessageCircleOff, MessageSquare, Eye, EyeOff, Power } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWzInstances } from '@/hooks/useWzInstances';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { triggerLabels } from './nodes/WzTriggerNode';
import WzProductSelector from './WzProductSelector';
import type { Node } from '@xyflow/react';

const variableChips = [
  { key: '{{nome}}', label: 'Nome' },
  { key: '{{email}}', label: 'Email' },
  { key: '{{telefone}}', label: 'Telefone' },
  { key: '{{produto}}', label: 'Produto' },
  { key: '{{oferta}}', label: 'Oferta' },
  { key: '{{valor}}', label: 'Valor' },
  { key: '{{parcelas}}', label: 'Parcelas' },
  { key: '{{metodo_pagamento}}', label: 'Método Pgto' },
  { key: '{{plataforma}}', label: 'Plataforma' },
  { key: '{{codigo_pix}}', label: 'Código PIX' },
  { key: '{{codigo_boleto}}', label: 'Código Boleto' },
  { key: '{{link_boleto}}', label: 'Link Boleto' },
];

const conditionVariables = [
  { value: 'valor', label: 'Valor' },
  { value: 'produto', label: 'Produto' },
  { value: 'plataforma', label: 'Plataforma' },
  { value: 'nome', label: 'Nome' },
  { value: 'metodo_pagamento', label: 'Método de Pagamento' },
];

const conditionOperators = [
  { value: 'equals', label: 'Igual a' },
  { value: 'contains', label: 'Contém' },
  { value: 'greater_than', label: 'Maior que' },
  { value: 'less_than', label: 'Menor que' },
  { value: 'not_equals', label: 'Não é' },
];

interface WzNodeConfigPanelProps {
  node: Node | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
}

const WzNodeConfigPanel: React.FC<WzNodeConfigPanelProps> = ({
  node, open, onClose, onUpdate, onDelete, onDuplicate,
}) => {
  if (!node) return null;

  const data = node.data as Record<string, any>;
  const nodeType = node.type;

  const update = (key: string, value: any) => {
    const nextData =
      key.endsWith('Selection') && value && typeof value === 'object' && !Array.isArray(value)
        ? { ...data, ...value }
        : { ...data, [key]: value };

    onUpdate(node.id, nextData);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[400px] sm:w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground">
            Configurar {nodeType === 'trigger' ? 'Gatilho' : nodeType === 'whatsapp' ? 'WhatsApp' : nodeType === 'timer' ? 'Timer' : nodeType === 'condition' ? 'Condição' : nodeType === 'note' ? 'Anotação' : nodeType === 'ab_split' ? 'Divisor A/B' : nodeType === 'smart_delay' ? 'Delay Inteligente' : nodeType === 'webhook' ? 'Webhook' : nodeType === 'tag' ? 'Tag' : nodeType === 'goto' ? 'Goto' : 'Nó'}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Disable toggle */}
          {nodeType !== 'note' && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Power className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{data.disabled ? 'Desabilitado' : 'Ativo'}</span>
              </div>
              <Switch
                checked={!data.disabled}
                onCheckedChange={(v) => update('disabled', !v)}
              />
            </div>
          )}

          {/* Nome */}
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={data.label || ''}
              onChange={(e) => update('label', e.target.value)}
              placeholder="Nome do elemento"
            />
          </div>

          {/* TRIGGER CONFIG */}
          {nodeType === 'trigger' && <TriggerConfig data={data} update={update} />}

          {/* WHATSAPP CONFIG */}
          {nodeType === 'whatsapp' && <WhatsAppConfig data={data} update={update} />}

          {/* TIMER CONFIG */}
          {nodeType === 'timer' && <TimerConfig data={data} update={update} />}

          {/* CONDITION CONFIG */}
          {nodeType === 'condition' && <ConditionConfig data={data} update={update} />}

          {/* NOTE CONFIG */}
          {nodeType === 'note' && <NoteConfig data={data} update={update} />}

          {/* AB SPLIT CONFIG */}
          {nodeType === 'ab_split' && <AbSplitConfig data={data} update={update} />}

          {/* SMART DELAY CONFIG */}
          {nodeType === 'smart_delay' && <SmartDelayConfig data={data} update={update} />}

          {/* WEBHOOK CONFIG */}
          {nodeType === 'webhook' && <WebhookConfig data={data} update={update} />}

          {/* TAG CONFIG */}
          {nodeType === 'tag' && <TagConfig data={data} update={update} />}

          {/* GOTO CONFIG */}
          {nodeType === 'goto' && <GotoConfig data={data} update={update} node={node} />}

          {/* Notas */}
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              value={data.notes || ''}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="Anotações sobre este nó..."
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-border flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => { onDuplicate(node.id); onClose(); }}>
              <Copy className="h-4 w-4 mr-2" /> Duplicar
            </Button>
            <Button variant="destructive" size="sm" className="flex-1" onClick={() => { onDelete(node.id); onClose(); }}>
              <Trash2 className="h-4 w-4 mr-2" /> Remover
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

/* ─── Helper: Multi-input with chips ─── */

function WzMultiInput({ values, onChange, label, placeholder }: { values: string[]; onChange: (v: string[]) => void; label: string; placeholder: string }) {
  const [input, setInput] = React.useState('');
  const add = () => {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput('');
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map(v => (
            <Badge key={v} variant="secondary" className="text-[10px] gap-1 pr-1">
              {v}
              <button type="button" className="ml-0.5 hover:text-destructive" onClick={() => onChange(values.filter(i => i !== v))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <Input value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder} className="h-8 text-xs flex-1" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} />
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={add} disabled={!input.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Sub-panels ─── */

function TriggerConfig({ data, update }: { data: any; update: (k: string, v: any) => void }) {
  return (
    <>
      <div className="space-y-2">
        <Label>Tipo de Gatilho</Label>
        <Select value={data.triggerType || ''} onValueChange={(v) => update('triggerType', v)}>
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent>
            {Object.entries(triggerLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Plataforma</Label>
        <Select value={data.platform || 'any'} onValueChange={(v) => update('platform', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Qualquer</SelectItem>
            <SelectItem value="ticto">Ticto</SelectItem>
            <SelectItem value="guru">Guru</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <WzProductSelector
        selectedIds={Array.isArray(data.productIdFilter) ? data.productIdFilter : (data.productIdFilter ? [data.productIdFilter] : [])}
        onChange={(ids) => update('productIdFilter', ids)}
        label="Filtrar por produto(s) (opcional)"
        customLabels={data.productIdLabels || {}}
        onCustomLabelsChange={(labels) => update('productIdLabels', labels)}
        onManualAdd={(id, name) => {
          const currentIds = Array.isArray(data.productIdFilter) ? data.productIdFilter : (data.productIdFilter ? [data.productIdFilter] : []);
          const newIds = [...currentIds, id];
          const newLabels = { ...(data.productIdLabels || {}), ...(name ? { [id]: name } : {}) };
          update('manualAddSelection', { productIdFilter: newIds, productIdLabels: newLabels });
        }}
      />
      <WzMultiInput
        values={Array.isArray(data.offerFilter) ? data.offerFilter : (data.offerFilter ? [data.offerFilter] : [])}
        onChange={(vals) => update('offerFilter', vals)}
        label="Filtrar por oferta(s) (opcional)"
        placeholder="Nome da oferta"
      />
    </>
  );
}

interface MessageBlock {
  text: string;
  type: string;
  imageUrl?: string;
  caption?: string;
  skipIfReplied?: boolean;
}

interface MessageVariation {
  text: string;
  type: string;
  imageUrl?: string;
  caption?: string;
  skipIfReplied?: boolean;
  blocks?: MessageBlock[];
}

function getBlocks(msg: MessageVariation): MessageBlock[] {
  if (msg.blocks && msg.blocks.length > 0) return msg.blocks;
  return [{ text: msg.text || '', type: msg.type || 'text', imageUrl: msg.imageUrl, caption: msg.caption }];
}

function WhatsAppConfig({ data, update }: { data: any; update: (k: string, v: any) => void }) {
  const { data: instances = [] } = useWzInstances();
  const messages: MessageVariation[] = data.messages || [{ text: '', type: 'text' }];
  const [activeTab, setActiveTab] = useState('0');
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const updateMessage = (index: number, field: string, value: any) => {
    const updated = [...messages];
    updated[index] = { ...updated[index], [field]: value };
    update('messages', updated);
  };

  const updateBlock = (varIndex: number, blockIndex: number, field: string, value: string) => {
    const updated = [...messages];
    const blocks = [...getBlocks(updated[varIndex])];
    blocks[blockIndex] = { ...blocks[blockIndex], [field]: value };
    updated[varIndex] = { ...updated[varIndex], blocks, text: blocks[0]?.text || '', type: blocks[0]?.type || 'text' };
    update('messages', updated);
  };

  const addBlock = (varIndex: number) => {
    const updated = [...messages];
    const blocks = [...getBlocks(updated[varIndex]), { text: '', type: 'text' }];
    updated[varIndex] = { ...updated[varIndex], blocks, text: blocks[0]?.text || '', type: blocks[0]?.type || 'text' };
    update('messages', updated);
  };

  const removeBlock = (varIndex: number, blockIndex: number) => {
    const updated = [...messages];
    const blocks = getBlocks(updated[varIndex]).filter((_, i) => i !== blockIndex);
    if (blocks.length === 0) return;
    updated[varIndex] = { ...updated[varIndex], blocks, text: blocks[0]?.text || '', type: blocks[0]?.type || 'text' };
    update('messages', updated);
  };

  const addVariation = () => {
    if (messages.length >= 10) return;
    const updated = [...messages, { text: '', type: 'text' }];
    update('messages', updated);
    setActiveTab(String(updated.length - 1));
  };

  const removeVariation = (index: number) => {
    if (messages.length <= 1) return;
    const updated = messages.filter((_, i) => i !== index);
    update('messages', updated);
    setActiveTab('0');
  };

  const insertVariable = (varIndex: number, blockIndex: number, variable: string) => {
    const key = `${varIndex}-${blockIndex}`;
    const ta = textareaRefs.current[key];
    const blocks = getBlocks(messages[varIndex]);
    const current = blocks[blockIndex]?.text || '';
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newText = current.substring(0, start) + variable + current.substring(end);
      updateBlock(varIndex, blockIndex, 'text', newText);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    } else {
      updateBlock(varIndex, blockIndex, 'text', current + variable);
    }
  };

  return (
    <>
      <div className="space-y-2 pb-4 border-b border-border">
        <Label className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-green-500" />
          Instância UAZAPI
        </Label>
        <Select
          value={data.instanceId || ''}
          onValueChange={(v) => {
            const inst = instances.find(i => i.id === v);
            update('instanceSelection', {
              instanceId: v,
              instanceName: inst?.name || '',
            });
          }}
        >
          <SelectTrigger><SelectValue placeholder="Selecionar instância..." /></SelectTrigger>
          <SelectContent>
            {instances.map(inst => (
              <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">Deixe em branco para usar a conexão dos blocos anteriores</p>
      </div>

      {/* Message variations */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Variações de mensagem</Label>
          <Button variant="ghost" size="sm" onClick={addVariation} disabled={messages.length >= 10} className="h-7 text-xs gap-1">
            <Plus className="h-3 w-3" /> Adicionar
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-8">
            {messages.map((_, i) => (
              <TabsTrigger key={i} value={String(i)} className="text-xs px-2.5 h-7">
                {i + 1}
              </TabsTrigger>
            ))}
          </TabsList>

          {messages.map((msg, i) => {
            const blocks = getBlocks(msg);
            return (
              <TabsContent key={i} value={String(i)} className="space-y-3 mt-3">
                {blocks.map((block, bi) => (
                  <div key={bi} className="space-y-2 border border-border rounded-lg p-3 relative">
                    {blocks.length > 1 && (
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-muted-foreground">Mensagem {bi + 1}</span>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive hover:text-destructive" onClick={() => removeBlock(i, bi)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">Tipo</Label>
                      <Select value={block.type} onValueChange={(v) => updateBlock(i, bi, 'type', v)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Texto</SelectItem>
                          <SelectItem value="image">Imagem</SelectItem>
                          <SelectItem value="audio">Áudio</SelectItem>
                          <SelectItem value="document">Documento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Variable chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {variableChips.map(v => (
                        <Badge
                          key={v.key}
                          variant="outline"
                          className="cursor-pointer hover:bg-primary/10 text-[10px] px-1.5 py-0.5"
                          onClick={() => insertVariable(i, bi, v.key)}
                        >
                          {v.label}
                        </Badge>
                      ))}
                    </div>

                    <Textarea
                      ref={(el) => { textareaRefs.current[`${i}-${bi}`] = el; }}
                      value={block.text}
                      onChange={(e) => {
                        updateBlock(i, bi, 'text', e.target.value);
                        // Auto-grow
                        const ta = e.target;
                        ta.style.height = 'auto';
                        ta.style.height = Math.max(100, ta.scrollHeight) + 'px';
                      }}
                      placeholder="Digite a mensagem..."
                      rows={4}
                      className="resize-y min-h-[100px] text-sm"
                    />
                    <div className="text-right text-[10px] text-muted-foreground">
                      {block.text.length}/1024
                    </div>

                    {/* Variable preview */}
                    {block.text && /\{\{.*?\}\}/.test(block.text) && (
                      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 mt-1">
                        <div className="flex items-center gap-1 mb-1">
                          <Eye className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground font-medium">Preview</span>
                        </div>
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                          {block.text.split(/(\{\{.*?\}\})/).map((part, idx) =>
                            /^\{\{.*?\}\}$/.test(part) ? (
                              <span key={idx} className="bg-primary/20 text-primary font-semibold rounded px-1 py-0.5 text-[11px]">
                                {part}
                              </span>
                            ) : (
                              <span key={idx}>{part}</span>
                            )
                          )}
                        </p>
                      </div>
                    )}

                    {block.type === 'image' && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">URL da imagem</Label>
                          <Input
                            value={block.imageUrl || ''}
                            onChange={(e) => updateBlock(i, bi, 'imageUrl', e.target.value)}
                            placeholder="https://..."
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Legenda</Label>
                          <Input
                            value={block.caption || ''}
                            onChange={(e) => updateBlock(i, bi, 'caption', e.target.value)}
                            placeholder="Legenda da imagem"
                            className="h-8 text-xs"
                          />
                        </div>
                      </>
                    )}

                    {/* Skip if replied toggle */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <div className="flex items-center gap-1.5">
                        <MessageCircleOff className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">Só enviar se não respondeu</span>
                      </div>
                      <Switch
                        checked={block.skipIfReplied || false}
                        onCheckedChange={(v) => updateBlock(i, bi, 'skipIfReplied', v as any)}
                        className="scale-75"
                      />
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-8 gap-1 border-dashed"
                  onClick={() => addBlock(i)}
                >
                  <Plus className="h-3 w-3" /> Adicionar mais mensagens
                </Button>

                {messages.length > 1 && (
                  <Button variant="ghost" size="sm" className="text-xs text-destructive h-7" onClick={() => removeVariation(i)}>
                    <X className="h-3 w-3 mr-1" /> Remover variação
                  </Button>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>

      {/* Delay humanization */}
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border">
        <div className="space-y-1">
          <Label className="text-xs">Delay mín (seg)</Label>
          <Input
            type="number"
            min={0}
            value={data.delayMin ?? 1}
            onChange={(e) => update('delayMin', Number(e.target.value))}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Delay máx (seg)</Label>
          <Input
            type="number"
            min={0}
            value={data.delayMax ?? 5}
            onChange={(e) => update('delayMax', Number(e.target.value))}
            className="h-8"
          />
        </div>
      </div>
    </>
  );
}

function TimerConfig({ data, update }: { data: any; update: (k: string, v: any) => void }) {
  return (
    <div className="flex gap-3">
      <div className="space-y-2 flex-1">
        <Label>Aguardar</Label>
        <Input
          type="number"
          min={1}
          value={data.delay ?? ''}
          onChange={(e) => update('delay', Number(e.target.value))}
          placeholder="Ex: 2"
        />
      </div>
      <div className="space-y-2 w-32">
        <Label>Unidade</Label>
        <Select value={data.unit || 'minutes'} onValueChange={(v) => update('unit', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="seconds">Segundos</SelectItem>
            <SelectItem value="minutes">Minutos</SelectItem>
            <SelectItem value="hours">Horas</SelectItem>
            <SelectItem value="days">Dias</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ConditionConfig({ data, update }: { data: any; update: (k: string, v: any) => void }) {
  return (
    <>
      <div className="space-y-2">
        <Label>Variável</Label>
        <Select value={data.variable || ''} onValueChange={(v) => update('variable', v)}>
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent>
            {conditionVariables.map(v => (
              <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Operador</Label>
        <Select value={data.operator || ''} onValueChange={(v) => update('operator', v)}>
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent>
            {conditionOperators.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Valor de comparação</Label>
        <Input
          value={data.compareValue || ''}
          onChange={(e) => update('compareValue', e.target.value)}
          placeholder="Ex: 100 ou 'Ticto'"
        />
      </div>
    </>
  );
}

const noteColorOptions = [
  { value: 'yellow', label: 'Amarelo', cls: 'bg-amber-300' },
  { value: 'blue', label: 'Azul', cls: 'bg-blue-300' },
  { value: 'green', label: 'Verde', cls: 'bg-emerald-300' },
  { value: 'pink', label: 'Rosa', cls: 'bg-pink-300' },
];

function NoteConfig({ data, update }: { data: any; update: (k: string, v: any) => void }) {
  return (
    <>
      <div className="space-y-2">
        <Label>Texto da anotação</Label>
        <Textarea
          value={data.text || ''}
          onChange={(e) => update('text', e.target.value)}
          placeholder="Escreva sua anotação aqui..."
          rows={4}
          className="resize-none text-sm"
        />
      </div>
      <div className="space-y-2">
        <Label>Cor</Label>
        <div className="flex gap-2">
          {noteColorOptions.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => update('noteColor', c.value)}
              className={cn(
                'h-8 w-8 rounded-full border-2 transition-all',
                c.cls,
                data.noteColor === c.value ? 'border-foreground scale-110' : 'border-transparent'
              )}
              title={c.label}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function AbSplitConfig({ data, update }: { data: any; update: (k: string, v: any) => void }) {
  const mode = data.splitMode || 'percentage';
  const paths = data.paths || [{ label: 'A', percent: 50 }, { label: 'B', percent: 50 }];
  const pathCount = paths.length;
  const sellers: { id: string; name: string }[] = data.sellers || [];
  const assignAction = data.assignAction || 'assign_and_branch';
  const isSeller = mode === 'round_robin' || mode === 'random';

  const { data: teamMembers = [] } = useTeamMembers();
  const assignableMembers = teamMembers.filter((m: any) => m.status === 'active');

  const updatePercent = (index: number, percent: number) => {
    const updated = [...paths];
    updated[index] = { ...updated[index], percent };
    const total = updated.reduce((s: number, p: any, i: number) => i === updated.length - 1 ? s : s + p.percent, 0);
    updated[updated.length - 1] = { ...updated[updated.length - 1], percent: Math.max(0, 100 - total) };
    update('paths', updated);
  };

  const setPathCount = (count: number) => {
    const labels = ['A', 'B', 'C', 'D'];
    if (mode === 'fixed_count') {
      const newPaths = Array.from({ length: count }, (_, i) => ({
        label: labels[i],
        count: paths[i]?.count || 100,
      }));
      update('paths', newPaths);
    } else {
      const pct = Math.floor(100 / count);
      const newPaths = Array.from({ length: count }, (_, i) => ({
        label: labels[i],
        percent: i === count - 1 ? 100 - pct * (count - 1) : pct,
      }));
      update('paths', newPaths);
    }
  };

  const toggleSeller = (member: any) => {
    const exists = sellers.find((s: any) => s.id === member.id);
    let newSellers: { id: string; name: string }[];
    if (exists) {
      newSellers = sellers.filter((s: any) => s.id !== member.id);
    } else {
      newSellers = [...sellers, { id: member.id, name: member.full_name || 'Sem nome' }];
    }

    if (assignAction === 'assign_and_branch' && newSellers.length > 0) {
      const newPaths = newSellers.map((s: any) => ({
        label: s.name.split(' ')[0],
        percent: Math.floor(100 / newSellers.length),
        sellerId: s.id,
        sellerName: s.name,
      }));
      update('sellerToggleSelection', { sellers: newSellers, paths: newPaths });
    } else {
      update('sellers', newSellers);
    }
  };

  const setMode = (newMode: string) => {
    update('splitMode', newMode);
    if (newMode === 'round_robin' || newMode === 'random') {
      // Keep sellers, reset paths based on assignAction
      if (assignAction === 'assign_and_branch' && sellers.length > 0) {
        update('paths', sellers.map((s: any) => ({
          label: s.name.split(' ')[0],
          sellerId: s.id,
          sellerName: s.name,
        })));
      }
    } else if (newMode === 'fixed_count') {
      update('paths', [{ label: 'A', count: 100 }, { label: 'B', count: 100 }]);
    } else {
      update('paths', [{ label: 'A', percent: 50 }, { label: 'B', percent: 50 }]);
    }
  };

  return (
    <>
      {/* Mode selector */}
      <div className="space-y-2">
        <Label>Modo de divisão</Label>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="percentage">📊 Porcentagem (A/B)</SelectItem>
            <SelectItem value="round_robin">🔄 Round-Robin Vendedores</SelectItem>
            <SelectItem value="random">🎲 Aleatório Vendedores</SelectItem>
            <SelectItem value="fixed_count">🔢 Quantidade fixa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Percentage mode */}
      {mode === 'percentage' && (
        <>
          <div className="space-y-2">
            <Label>Número de caminhos</Label>
            <Select value={String(pathCount)} onValueChange={(v) => setPathCount(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 caminhos</SelectItem>
                <SelectItem value="3">3 caminhos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {paths.map((p: any, i: number) => (
            <div key={i} className="space-y-1">
              <Label className="text-xs">Caminho {p.label}: {p.percent}%</Label>
              {i < paths.length - 1 && (
                <Slider
                  value={[p.percent]}
                  onValueChange={([v]) => updatePercent(i, v)}
                  min={5}
                  max={95}
                  step={5}
                />
              )}
            </div>
          ))}
        </>
      )}

      {/* Fixed count mode */}
      {mode === 'fixed_count' && (
        <>
          <div className="space-y-2">
            <Label>Número de caminhos</Label>
            <Select value={String(pathCount)} onValueChange={(v) => setPathCount(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 caminhos</SelectItem>
                <SelectItem value="3">3 caminhos</SelectItem>
                <SelectItem value="4">4 caminhos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {paths.map((p: any, i: number) => (
            <div key={i} className="space-y-2">
              <Label className="text-xs">Caminho {p.label}: quantidade de leads</Label>
              <Input
                type="number"
                min={1}
                value={p.count || 100}
                onChange={(e) => {
                  const updated = [...paths];
                  updated[i] = { ...updated[i], count: parseInt(e.target.value) || 1 };
                  update('paths', updated);
                }}
                className="h-8"
              />
            </div>
          ))}
        </>
      )}

      {/* Seller modes */}
      {isSeller && (
        <>
          {/* Action toggle */}
          <div className="space-y-2">
            <Label>Ação no lead</Label>
            <Select value={assignAction} onValueChange={(v) => {
              update('assignAction', v);
              if (v === 'assign_only') {
                // Single output path
                update('paths', [{ label: '→' }]);
              } else if (sellers.length > 0) {
                update('paths', sellers.map((s: any) => ({
                  label: s.name.split(' ')[0],
                  sellerId: s.id,
                  sellerName: s.name,
                })));
              }
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="assign_and_branch">Atribuir + ramificar (1 saída por vendedor)</SelectItem>
                <SelectItem value="assign_only">Só atribuir (saída única)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Seller list */}
          <div className="space-y-2">
            <Label>Vendedores ({sellers.length} selecionados)</Label>
            <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {assignableMembers.length === 0 && (
                <p className="text-xs text-muted-foreground p-3 text-center">Nenhum vendedor cadastrado</p>
              )}
              {assignableMembers.map((m: any) => {
                const isSelected = sellers.some((s: any) => s.id === m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleSeller(m)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                      isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-foreground'
                    )}
                  >
                    <div className={cn(
                      'h-4 w-4 rounded border-2 flex items-center justify-center text-[10px] font-bold',
                      isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'
                    )}>
                      {isSelected && '✓'}
                    </div>
                    <span className="truncate">{m.full_name || 'Sem nome'}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{ROLE_LABELS_MAP[m.role] || m.role}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

const ROLE_LABELS_MAP: Record<string, string> = {
  admin: 'Admin',
  gestor: 'Gestor',
  vendedor: 'Vendedor',
  suporte: 'Suporte',
};

function SmartDelayConfig({ data, update }: { data: any; update: (k: string, v: any) => void }) {
  return (
    <>
      <div className="space-y-2">
        <Label>Horário alvo</Label>
        <Input
          type="time"
          value={data.targetTime || '09:00'}
          onChange={(e) => update('targetTime', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Dia alvo</Label>
        <Select value={data.targetDay || 'any'} onValueChange={(v) => update('targetDay', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Qualquer dia</SelectItem>
            <SelectItem value="next_business">Próximo dia útil</SelectItem>
            <SelectItem value="monday">Segunda</SelectItem>
            <SelectItem value="tuesday">Terça</SelectItem>
            <SelectItem value="wednesday">Quarta</SelectItem>
            <SelectItem value="thursday">Quinta</SelectItem>
            <SelectItem value="friday">Sexta</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Apenas dias úteis</Label>
        <Switch
          checked={data.businessDaysOnly || false}
          onCheckedChange={(v) => update('businessDaysOnly', v)}
          className="scale-90"
        />
      </div>
    </>
  );
}

function WebhookConfig({ data, update }: { data: any; update: (k: string, v: any) => void }) {
  return (
    <>
      <div className="space-y-2">
        <Label>Método</Label>
        <Select value={data.method || 'POST'} onValueChange={(v) => update('method', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>URL</Label>
        <Input
          value={data.url || ''}
          onChange={(e) => update('url', e.target.value)}
          placeholder="https://api.exemplo.com/webhook"
        />
      </div>
      <div className="space-y-2">
        <Label>Headers (JSON)</Label>
        <Textarea
          value={data.headers || ''}
          onChange={(e) => update('headers', e.target.value)}
          placeholder='{"Authorization": "Bearer ..."}'
          rows={2}
          className="resize-none text-xs font-mono"
        />
      </div>
      <div className="space-y-2">
        <Label>Body template</Label>
        <Textarea
          value={data.body || ''}
          onChange={(e) => update('body', e.target.value)}
          placeholder='{"phone": "{{telefone}}", "name": "{{nome}}"}'
          rows={3}
          className="resize-none text-xs font-mono"
        />
      </div>
    </>
  );
}

function TagConfig({ data, update }: { data: any; update: (k: string, v: any) => void }) {
  return (
    <>
      <div className="space-y-2">
        <Label>Ação</Label>
        <Select value={data.tagAction || 'add'} onValueChange={(v) => update('tagAction', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="add">Adicionar tag</SelectItem>
            <SelectItem value="remove">Remover tag</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Nome da tag</Label>
        <Input
          value={data.tagName || ''}
          onChange={(e) => update('tagName', e.target.value)}
          placeholder="Ex: recuperado, vip, interessado"
        />
      </div>
    </>
  );
}

function GotoConfig({ data, update, node }: { data: any; update: (k: string, v: any) => void; node: Node }) {
  return (
    <>
      <div className="space-y-2">
        <Label>ID do nó destino</Label>
        <Input
          value={data.targetNodeId || ''}
          onChange={(e) => update('targetNodeId', e.target.value)}
          placeholder="ID do nó para pular"
        />
      </div>
      <div className="space-y-2">
        <Label>Label do destino (referência)</Label>
        <Input
          value={data.targetNodeLabel || ''}
          onChange={(e) => update('targetNodeLabel', e.target.value)}
          placeholder="Ex: Enviar WhatsApp 2"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Copie o ID do nó destino clicando nele. O Goto redireciona o fluxo sem criar conexão visual.
      </p>
    </>
  );
}

export default WzNodeConfigPanel;
