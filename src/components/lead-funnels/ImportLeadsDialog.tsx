import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, GitBranch } from 'lucide-react';
import { LeadFunnelStage } from '@/types/leadFunnels';
import { useImportLeads } from '@/hooks/useImportLeads';
import { Badge } from '@/components/ui/badge';

interface ImportLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: LeadFunnelStage[];
  funnelId: string;
  organizationId: string;
}

interface ParsedLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  metadata: Record<string, unknown>;
}

// Common column name mappings (Guru, Eduzz, Ticto, generic)
const COLUMN_MAP: Record<string, keyof ParsedLead | null> = {
  // Name variations
  'nome contato': 'name',
  'nome contacto': 'name',
  'nome': 'name',
  'name': 'name',
  'full_name': 'name',
  'cliente': 'name',
  'comprador': 'name',
  'nome do cliente': 'name',
  'nome cliente': 'name',
  'nome comprador': 'name',
  'customer_name': 'name',
  'buyer_name': 'name',
  'nome completo': 'name',
  // Email variations
  'email contato': 'email',
  'email contacto': 'email',
  'e-mail contacto': 'email',
  'email': 'email',
  'e-mail': 'email',
  'email do cliente': 'email',
  'e-mail do cliente': 'email',
  'email cliente': 'email',
  'customer_email': 'email',
  'buyer_email': 'email',
  'e-mail contato': 'email',
  // Phone variations
  'telefone contato': 'phone',
  'telefone contacto': 'phone',
  'telefone': 'phone',
  'phone': 'phone',
  'celular': 'phone',
  'telefone cliente': 'phone',
  'customer_phone': 'phone',
  'telefone completo do cliente': 'phone',
  'número do telefone do cliente': 'phone',
  'numero do telefone do cliente': 'phone',
  // UTM variations
  'utm_source': 'utm_source',
  'utm source': 'utm_source',
  'utm_medium': 'utm_medium',
  'utm medium': 'utm_medium',
  'utm_campaign': 'utm_campaign',
  'utm campaign': 'utm_campaign',
  'utm_content': 'utm_content',
  'utm content': 'utm_content',
  'utm_term': 'utm_term',
  'utm term': 'utm_term',
};

// Map export columns to standardized metadata keys
const METADATA_KEY_MAP: Record<string, string> = {
  'produto': 'product_name',
  'nome produto': 'product_name',
  'nome do produto': 'product_name',
  'product_name': 'product_name',
  'oferta': 'offer_name',
  'nome da oferta': 'offer_name',
  'offer_name': 'offer_name',
  'valor': 'amount',
  'valor venda': 'amount',
  'valor líquido': 'amount',
  'valor pago': 'amount',
  'gross_amount': 'amount',
  'net_amount': 'amount',
  'status': 'status',
  'status da compra': 'status',
  'status da transação': 'status',
  'status da transacao': 'status',
  'pagamento': 'payment_method',
  'payment_method': 'payment_method',
  'método pagamento': 'payment_method',
  'método de pagamento': 'payment_method',
  'metodo de pagamento': 'payment_method',
  'plataforma': 'platform',
  'platform': 'platform',
  'data': 'purchased_at',
  'data pedido': 'purchased_at',
  'data do pedido': 'purchased_at',
  'purchased_at': 'purchased_at',
  'data do status': 'status_date',
  'campanha meta': 'meta_campaign_name',
  'meta campaign name': 'meta_campaign_name',
  'adset meta': 'meta_adset_name',
  'meta adset name': 'meta_adset_name',
  'anúncio meta': 'meta_ad_name',
  'meta ad name': 'meta_ad_name',
  'tráfego pago': 'is_paid_traffic',
  'código de telefone': '_phone_code',
  'código telefone': '_phone_code',
  'codigo telefone contato': '_phone_code',
  'código telefone contato': '_phone_code',
  'codigo telefone contacto': '_phone_code',
  'código telefone contacto': '_phone_code',
  'codigo telefone': '_phone_code',
  'ddi do cliente': '_phone_ddi',
  'ddd do cliente': '_phone_ddd',
  'id marketplace': 'transaction_id',
  'código da transação': 'transaction_id',
  'codigo da transação': 'transaction_id',
  'código da transacao': 'transaction_id',
  'codigo da transacao': 'transaction_id',
  'nome marketplace': 'platform',
  'doc contacto': 'customer_doc',
};

function parseSpreadsheet(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
          defval: '',
          raw: false,
          blankrows: false,
        });
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function mapRow(row: Record<string, string>): ParsedLead {
  const lead: ParsedLead = {
    name: null, email: null, phone: null,
    utm_source: null, utm_medium: null, utm_campaign: null,
    utm_content: null, utm_term: null, metadata: {},
  };

  for (const [col, val] of Object.entries(row)) {
    const normalizedCol = col.toLowerCase().trim();
    const mapped = COLUMN_MAP[normalizedCol];

    if (mapped) {
      (lead as any)[mapped] = val?.toString().trim() || null;
    } else {
      const metaKey = METADATA_KEY_MAP[normalizedCol];
      if (metaKey) {
        lead.metadata[metaKey] = val?.toString().trim() || null;
      } else {
        lead.metadata[normalizedCol] = val;
      }
    }
  }

  // Combine phone code if separate
  if (lead.metadata['_phone_code'] && lead.phone) {
    lead.phone = `+${lead.metadata['_phone_code']}${lead.phone}`;
    delete lead.metadata['_phone_code'];
  }

  // Ticto: combine DDI + DDD + phone number if phone not already set
  if (!lead.phone && lead.metadata['_phone_ddi'] && lead.metadata['_phone_ddd']) {
    const ddi = String(lead.metadata['_phone_ddi']).replace(/\D/g, '');
    const ddd = String(lead.metadata['_phone_ddd']).replace(/\D/g, '');
    // Look for a raw phone number in metadata
    const rawPhone = lead.metadata['numero do telefone do cliente'] || lead.metadata['número do telefone do cliente'] || '';
    const phoneDigits = String(rawPhone).replace(/\D/g, '');
    if (phoneDigits) {
      lead.phone = `+${ddi}${ddd}${phoneDigits}`;
    }
    delete lead.metadata['_phone_ddi'];
    delete lead.metadata['_phone_ddd'];
  }

  return lead;
}

function getLeadStatus(lead: ParsedLead): string {
  return ((lead.metadata.status as string) || '').toLowerCase().trim();
}

const ImportLeadsDialog: React.FC<ImportLeadsDialogProps> = ({
  open, onOpenChange, stages, funnelId, organizationId,
}) => {
  const [parsedRows, setParsedRows] = useState<ParsedLead[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [separateByStatus, setSeparateByStatus] = useState(false);
  const [statusStageMap, setStatusStageMap] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<number>(0);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportLeads();

  const hasStatusColumn = parsedRows.length > 0 && parsedRows.some(r => r.metadata.status);

  // Compute unique statuses with counts
  const uniqueStatuses = useMemo(() => {
    if (!hasStatusColumn) return [];
    const counts: Record<string, number> = {};
    for (const row of parsedRows) {
      const status = getLeadStatus(row);
      if (status) {
        counts[status] = (counts[status] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({ status, count }));
  }, [parsedRows, hasStatusColumn]);

  const noStatusCount = useMemo(() => {
    return parsedRows.filter(r => !getLeadStatus(r)).length;
  }, [parsedRows]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setStatusStageMap({});
    try {
      const rows = await parseSpreadsheet(file);
      const mapped = rows.map(mapRow).filter(l => l.name || l.email || l.phone);
      setParsedRows(mapped);
    } catch {
      setParsedRows([]);
    }
  };

  const handleImport = async () => {
    if (!selectedStage || parsedRows.length === 0) return;
    setImporting(true);
    setProgress(0);

    // Inject selected platform into metadata
    if (selectedPlatform) {
      parsedRows.forEach(lead => {
        if (!lead.metadata.platform) {
          lead.metadata.platform = selectedPlatform;
        }
      });
    }

    const res = await importMutation.mutateAsync({
      leads: parsedRows,
      funnelId,
      stageId: selectedStage,
      organizationId,
      resolveStageId: separateByStatus
        ? (lead) => {
            const status = getLeadStatus(lead as ParsedLead);
            return (status && statusStageMap[status]) || selectedStage;
          }
        : undefined,
      onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
    });

    setResult(res);
    setImporting(false);
  };

  const handleClose = () => {
    if (importing) return;
    setParsedRows([]);
    setFileName(null);
    setSelectedStage('');
    setSelectedPlatform('');
    setStatusStageMap({});
    setSeparateByStatus(false);
    setProgress(0);
    setResult(null);
    onOpenChange(false);
  };

  const updateStatusMap = (status: string, stageId: string) => {
    setStatusStageMap(prev => ({ ...prev, [status]: stageId }));
  };

  const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const previewLeads = parsedRows.slice(0, 5);

  // Check if all statuses are mapped (for button enable state)
  const allMapped = !separateByStatus || uniqueStatuses.every(s => statusStageMap[s.status]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Leads
          </DialogTitle>
          <DialogDescription>
            Envie uma planilha (.xlsx ou .csv) para importar leads para este funil.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Platform selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Plataforma de origem</label>
            <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a plataforma..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="guru">Guru</SelectItem>
                <SelectItem value="ticto">Ticto</SelectItem>
                <SelectItem value="eduzz">Eduzz</SelectItem>
                <SelectItem value="youshop">YouShop</SelectItem>
                <SelectItem value="outro">Outro / Genérico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* File Upload */}
          <div
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            {fileName ? (
              <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                {fileName} — <span className="text-muted-foreground">{parsedRows.length} leads encontrados</span>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Clique para selecionar arquivo</p>
                <p className="text-xs text-muted-foreground">.xlsx, .xls ou .csv</p>
              </div>
            )}
          </div>

          {/* Stage Selector */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Etapa padrão {separateByStatus && <span className="text-muted-foreground font-normal">(fallback)</span>}
                </label>
                <Select value={selectedStage} onValueChange={setSelectedStage}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a etapa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedStages.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Separate by status toggle */}
              {hasStatusColumn && (
                <div className="rounded-lg border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">Separar por status</span>
                    </div>
                    <Switch checked={separateByStatus} onCheckedChange={setSeparateByStatus} />
                  </div>
                  {separateByStatus && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Mapeie cada status para uma etapa do funil. Status sem mapeamento vão para a etapa padrão.
                      </p>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                        {uniqueStatuses.map(({ status, count }) => (
                          <div key={status} className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 min-w-[160px]">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono shrink-0">
                                {status}
                              </Badge>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">({count})</span>
                            </div>
                            <span className="text-xs text-muted-foreground">→</span>
                            <Select
                              value={statusStageMap[status] || ''}
                              onValueChange={(v) => updateStatusMap(status, v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Etapa padrão" />
                              </SelectTrigger>
                              <SelectContent>
                                {sortedStages.map(s => (
                                  <SelectItem key={s.id} value={s.id}>
                                    <div className="flex items-center gap-2">
                                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                                      {s.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                      {noStatusCount > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {noStatusCount} leads sem status → etapa padrão
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          {previewLeads.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Preview ({parsedRows.length} leads)</p>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 font-medium text-muted-foreground">Nome</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Email</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Produto</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewLeads.map((lead, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2 text-foreground truncate max-w-[120px]">{lead.name || '—'}</td>
                        <td className="p-2 text-foreground truncate max-w-[150px]">{lead.email || '—'}</td>
                        <td className="p-2 text-foreground truncate max-w-[120px]">{(lead.metadata.product_name as string) || '—'}</td>
                        <td className="p-2">
                          {lead.metadata.status ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                              {lead.metadata.status as string}
                            </Badge>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 5 && (
                  <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30">
                    +{parsedRows.length - 5} leads adicionais
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Progress */}
          {importing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">Importando... {progress}%</p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
              {result.skipped > 0 ? (
                <AlertCircle className="h-4 w-4 text-yellow-500" />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              <span className="text-foreground">
                {result.imported} importados{result.skipped > 0 && `, ${result.skipped} ignorados`}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            {result ? 'Fechar' : 'Cancelar'}
          </Button>
          {!result && (
            <Button
              onClick={handleImport}
              disabled={importing || parsedRows.length === 0 || !selectedStage}
            >
              {importing ? 'Importando...' : `Importar ${parsedRows.length} leads`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportLeadsDialog;
