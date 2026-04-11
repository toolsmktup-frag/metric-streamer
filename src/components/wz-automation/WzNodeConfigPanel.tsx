import React, { useState, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Copy, Plus, X, MessageCircleOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWzInstances } from '@/hooks/useWzInstances';
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
      <SheetContent className="w-[340px] sm:w-[380px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground">
            Configurar {nodeType === 'trigger' ? 'Gatilho' : nodeType === 'whatsapp' ? 'WhatsApp' : nodeType === 'timer' ? 'Timer' : nodeType === 'condition' ? 'Condição' : 'Nó'}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
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
      <div className="space-y-2">
        <Label>Instância UAZAPI</Label>
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
                    <div className="flex flex-wrap gap-1">
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
                      onChange={(e) => updateBlock(i, bi, 'text', e.target.value)}
                      placeholder="Digite a mensagem..."
                      rows={3}
                      className="resize-none text-sm"
                    />
                    <div className="text-right text-[10px] text-muted-foreground">
                      {block.text.length}/1024
                    </div>

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
      <div className="grid grid-cols-2 gap-3">
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

export default WzNodeConfigPanel;
