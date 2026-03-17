import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { LeadFunnelStage } from '@/types/leadFunnels';
import { useImportLeads } from '@/hooks/useImportLeads';

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

// Common column name mappings (Guru, Eduzz, generic)
const COLUMN_MAP: Record<string, keyof ParsedLead | null> = {
  'nome contato': 'name',
  'nome': 'name',
  'name': 'name',
  'full_name': 'name',
  'email contato': 'email',
  'email': 'email',
  'e-mail': 'email',
  'telefone contato': 'phone',
  'telefone': 'phone',
  'phone': 'phone',
  'celular': 'phone',
  'utm_source': 'utm_source',
  'utm_medium': 'utm_medium',
  'utm_campaign': 'utm_campaign',
  'utm_content': 'utm_content',
  'utm_term': 'utm_term',
};

const METADATA_COLUMNS = [
  'nome produto', 'product_name', 'produto',
  'valor venda', 'valor líquido', 'gross_amount', 'net_amount', 'valor',
  'status', 'status da compra',
  'data pedido', 'purchased_at', 'data',
  'plataforma', 'platform',
  'código de telefone', 'código telefone',
];

function parseSpreadsheet(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
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
    } else if (METADATA_COLUMNS.some(mc => normalizedCol.includes(mc.toLowerCase()))) {
      lead.metadata[normalizedCol] = val;
    } else {
      lead.metadata[normalizedCol] = val;
    }
  }

  // Combine phone code if separate
  if (lead.metadata['código de telefone'] && lead.phone) {
    lead.phone = `+${lead.metadata['código de telefone']}${lead.phone}`;
  }

  return lead;
}

const ImportLeadsDialog: React.FC<ImportLeadsDialogProps> = ({
  open, onOpenChange, stages, funnelId, organizationId,
}) => {
  const [parsedRows, setParsedRows] = useState<ParsedLead[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportLeads();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    try {
      const rows = await parseSpreadsheet(file);
      const mapped = rows.map(mapRow).filter(l => l.email || l.phone);
      setParsedRows(mapped);
    } catch {
      setParsedRows([]);
    }
  };

  const handleImport = async () => {
    if (!selectedStage || parsedRows.length === 0) return;
    setImporting(true);
    setProgress(0);

    const res = await importMutation.mutateAsync({
      leads: parsedRows,
      funnelId,
      stageId: selectedStage,
      organizationId,
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
    setProgress(0);
    setResult(null);
    onOpenChange(false);
  };

  const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const previewLeads = parsedRows.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
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
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Etapa destino</label>
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
                      <th className="text-left p-2 font-medium text-muted-foreground">Telefone</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">UTM Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewLeads.map((lead, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2 text-foreground truncate max-w-[150px]">{lead.name || '—'}</td>
                        <td className="p-2 text-foreground truncate max-w-[180px]">{lead.email || '—'}</td>
                        <td className="p-2 text-foreground">{lead.phone || '—'}</td>
                        <td className="p-2 text-foreground">{lead.utm_source || '—'}</td>
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
