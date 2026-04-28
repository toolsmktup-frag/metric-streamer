import { useState, useEffect } from 'react';
import { Sparkles, Save, Loader2, FileText, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useActiveSalesScript, useUpsertSalesScript } from '@/hooks/useSalesScripts';
import { useCurrentUserRole } from '@/hooks/useCurrentUserRole';
import { Navigate } from 'react-router-dom';
import { OffersTab } from '@/components/sales-copilot/OffersTab';

const TEMPLATE = `# Tom de voz
Próximo, consultivo, sem ser invasivo. Trate por você. Use 1 emoji por mensagem no máximo.

# Etapas do script
## Abertura
- Cumprimente pelo nome.
- Pergunte como pode ajudar / referencie a fonte (anúncio, indicação).

## Sondagem
- Pergunte o objetivo / dor.
- Descubra urgência e contexto.

## Oferta
- Conecte a solução à dor mencionada.
- Apresente preço só depois de gerar valor.

## Fechamento
- Crie urgência genuína (estoque, condição, bônus).
- Sempre proponha um próximo passo concreto (link de pagamento, horário, etc.).

# Objeções comuns
- "Tá caro" → reforce o valor entregue, parcele em até 12x, mostre comparativo.
- "Vou pensar" → pergunte o que falta pra decidir, ofereça período de garantia.
- "Não tenho tempo agora" → marque um retorno específico com data/hora.

# O que NÃO falar
- Não fale mal de concorrentes.
- Não prometa resultado garantido.
- Não pressione com agressividade.

> Dica: cadastre suas ofertas/preços na aba "Ofertas" — fica mais organizado e a IA usa automaticamente.
`;

export default function SalesCopilotConfig() {
  const { data: role, isLoading: roleLoading } = useCurrentUserRole();
  const { data: script, isLoading } = useActiveSalesScript();
  const upsert = useUpsertSalesScript();
  const [content, setContent] = useState('');

  useEffect(() => {
    if (script?.content !== undefined) {
      setContent(script.content || '');
    }
  }, [script?.content]);

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (role !== 'admin' && role !== 'gestor') {
    return <Navigate to="/whatsapp" replace />;
  }

  const handleSave = () => {
    upsert.mutate({ id: script?.id, content });
  };

  const useTemplate = () => {
    setContent(TEMPLATE);
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Copiloto de Vendas</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Configure o cérebro do Copiloto: o <strong>script base</strong> ensina como vender (tom, etapas, objeções),
        e as <strong>ofertas</strong> dizem o que vender (combos, preços, regras). Tudo entra no contexto da IA a cada sugestão.
      </p>

      <Tabs defaultValue="script" className="space-y-4">
        <TabsList>
          <TabsTrigger value="script" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Script base
          </TabsTrigger>
          <TabsTrigger value="offers" className="gap-1.5">
            <Package className="h-3.5 w-3.5" /> Ofertas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="script">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Conteúdo do script (Markdown)</CardTitle>
                <CardDescription>Lido pela IA a cada sugestão. Use markdown pra organizar.</CardDescription>
              </div>
              {!content && (
                <Button variant="outline" size="sm" onClick={useTemplate}>
                  Usar template
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="h-96 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="# Tom de voz&#10;Próximo, consultivo..."
                  className="font-mono text-sm min-h-[500px]"
                />
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {content.length} caracteres
                  {script?.updated_at && (
                    <> · Atualizado em {new Date(script.updated_at).toLocaleString('pt-BR')}</>
                  )}
                </span>
                <Button onClick={handleSave} disabled={upsert.isPending} className="gap-1.5">
                  {upsert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Salvar script
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offers">
          <OffersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
