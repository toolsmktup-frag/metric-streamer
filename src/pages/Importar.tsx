import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

type Platform = 'ticto' | 'guru' | 'eduzz';
type ImportStatus = 'idle' | 'previewing' | 'importing' | 'done';

interface PreviewRow { [key: string]: string }
interface ImportResult {
  total: number;
  inserted: number;
  skipped: number;
  invalid: number;
  errors: number;
  errorDetails: string[];
}

// ─── Guru column mapping (Excel)
// 0:id transação 3:status 5:pagamento 6:parcelas 8:valor venda 12:valor líquido
// 17:id produto 18:nome produto 26:nome contato 27:doc contato(CPF) 28:email contato
// 37:codigo telefone 38:telefone 45:data pedido 60:utm_source 61:utm_campaign
// 62:utm_medium 63:utm_content 67:nome oferta
const GURU_COLS: Record<string, number> = {
  transaction_id: 0, status: 3, payment_method: 5, installments: 6,
  gross_amount: 8, net_amount: 12, product_id: 17, product_name: 18,
  offer_name: 67, cpf: 27, email: 28, name: 26, phone: 38,
  phone_code: 37, purchased_at: 45, utm_source: 60, utm_campaign: 61,
  utm_medium: 62, utm_content: 63,
};

// ─── Eduzz column mapping (tab-separated CSV) ───
// 0:Fatura 1:Status 2:Método Pagamento 4:Nº Parcelas 10:Data Pagamento
// 16:ID Produto 17:Produto 22:Valor da Venda 24:Valor do Item
// 34:Cliente/Nome 35:Cliente/E-mail 36:Cliente/Fones 38:Cliente/Documento(CPF)
// 47:UTM Source 48:UTM Campaign 49:UTM Medium 50:UTM Content 51:UTM Term 53:Nome da Oferta
const EDUZZ_COLS: Record<string, number> = {
  fatura: 0, status: 1, payment_method: 2, installments: 4,
  purchased_at: 10, product_id: 16, product_name: 17,
  gross_amount: 24, customer_name: 34, customer_email: 35,
  customer_phone: 36, customer_cpf: 38,
  utm_source: 47, utm_campaign: 48, utm_medium: 49,
  utm_content: 50, utm_term: 51, offer_name: 53,
};

// ─── Ticto column mapping ───
// 0:Número Pedido 1:Código Pedido 2:Data Pedido 3:Id Produto 4:Nome Produto
// 5:Nome Oferta 6:Código Oferta 7:Código Transação 8:Status 12:Método Pagamento
// 17:Parcelas 20:Valor Pedido 23:Valor Pago 27:Valor Liquidado
// 36:Transportadora 37:Nome Cliente 38:Email 39:DDI 40:DDD 41:Nº Tel 42:Tel Completo
// 43:Documento 52:src 53:sck 54:utm_source 55:utm_content 56:utm_medium 58:utm_term 59:utm_campaign
const TICTO_COLS: Record<string, number> = {
  order_id: 0, order_hash: 1, purchased_at: 2, product_id: 3, product_name: 4,
  offer_name: 5, transaction_id: 7, status: 8, payment_method: 12,
  installments: 17, gross_amount: 20, net_amount: 27, customer_name: 37,
  customer_email: 38, customer_phone: 42, customer_cpf: 43,
  utm_source: 54, utm_content: 55, utm_medium: 56, utm_term: 58, utm_campaign: 59,
};

function parseBRDate(val: string): string | null {
  if (!val) return null;
  const full = val.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (full) {
    const [, dd, mm, yyyy, hh, mi, ss] = full;
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`;
  }
  const short = val.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (short) {
    const [, dd, mm, yyyy] = short;
    return `${yyyy}-${mm}-${dd}T00:00:00-03:00`;
  }
  return null;
}

function parseBRCurrency(val: string): number {
  if (!val) return 0;
  const clean = val.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

/**
 * Guru exporta valores em centavos como inteiros (ex: "29700" = R$297,00).
 * Remove tudo que não for dígito e divide por 100.
 * Funciona para ambos os formatos: "29700" e "297,00" → R$297,00.
 */
function parseGuruCentavos(val: string): number {
  if (!val) return 0;
  const digits = val.replace(/[^\d]/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

function mapGuruStatus(val: string): string {
  if (!val) return 'unknown';
  const map: Record<string, string> = {
    'Aprovada': 'authorized', 'Aprovado': 'authorized',
    'Cancelada': 'refunded', 'Cancelado': 'refunded',
    'Reembolsada': 'refunded', 'Reembolsado': 'refunded',
    'Aguardando': 'waiting_payment', 'Pendente': 'waiting_payment',
    'Recusada': 'refused', 'Recusado': 'refused',
    'Chargeback': 'chargeback',
  };
  return map[val] || val.toLowerCase().replace(/\s+/g, '_');
}

function mapEduzzStatus(val: string): string {
  if (!val) return 'unknown';
  const map: Record<string, string> = {
    'Paga': 'authorized', 'Pago': 'authorized', 'Aprovada': 'authorized',
    'Reembolsada': 'refunded', 'Reembolsado': 'refunded', 'Cancelada': 'refunded',
    'Aguardando Pagamento': 'waiting_payment', 'Pendente': 'waiting_payment',
    'Recusada': 'refused', 'Chargeback': 'chargeback',
  };
  return map[val] || val.toLowerCase().replace(/\s+/g, '_');
}

function mapTictoStatus(val: string): string {
  if (!val) return 'unknown';
  const map: Record<string, string> = {
    'Autorizado': 'authorized', 'Aprovado': 'authorized',
    'Reembolsado': 'refunded', 'Cancelado': 'refunded',
    'Chargeback': 'chargeback', 'Recusado': 'refused',
    'Aguardando Pagamento': 'waiting_payment', 'Pix Gerado': 'waiting_payment',
  };
  return map[val] || val.toLowerCase().replace(/\s+/g, '_');
}

function mapPayment(val: string): string {
  if (!val) return 'unknown';
  const v = val.toLowerCase();
  if (v.includes('pix')) return 'pix';
  if (v.includes('cart') || v.includes('créd') || v.includes('cred')) return 'credit_card';
  if (v.includes('boleto')) return 'bank_slip';
  return v.replace(/\s+/g, '_');
}

// Auto-detecta separador: tab, ponto-e-vírgula ou vírgula
function detectSeparator(firstLine: string): string {
  const tabs  = (firstLine.match(/\t/g)  || []).length;
  const semis = (firstLine.match(/;/g)   || []).length;
  const commas = (firstLine.match(/,/g)  || []).length;
  if (tabs >= semis && tabs >= commas && tabs > 0) return '\t';
  if (semis >= commas && semis > 0) return ';';
  return ',';
}

function parseLine(line: string, sep: string): string[] {
  if (sep === '\t' || sep === ';') {
    return line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
  }
  // CSV com vírgula — respeita aspas
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function cleanId(val: string | undefined | null): string | null {
  if (!val) return null;
  // Remove BOM, quotes, ="..." wrappers, whitespace
  const cleaned = String(val).replace(/^\uFEFF/, '').replace(/^="?|"?$/g, '').trim();
  return cleaned || null;
}

function normalizeGuruRow(cols: string[]): any {
  const phone_code = c(cols, GURU_COLS.phone_code) || '55';
  const phone = c(cols, GURU_COLS.phone);
  const full_phone = phone ? `${phone_code}${phone}` : null;
  // Primary: transaction_id (col 0). Fallback: product_id + email + date as composite key
  const txId = cleanId(cols[GURU_COLS.transaction_id]);
  return {
    platform: 'guru',
    platform_transaction_id: txId,
    product_name: c(cols, GURU_COLS.product_name) || '',
    product_id: c(cols, GURU_COLS.product_id) || null,
    offer_name: c(cols, GURU_COLS.offer_name) || null,
    gross_amount: parseGuruCentavos(c(cols, GURU_COLS.gross_amount)),
    net_amount: parseGuruCentavos(c(cols, GURU_COLS.net_amount)),
    payment_method: mapPayment(c(cols, GURU_COLS.payment_method)),
    installments: parseInt(c(cols, GURU_COLS.installments)) || 1,
    status: mapGuruStatus(c(cols, GURU_COLS.status)),
    purchased_at: parseBRDate(c(cols, GURU_COLS.purchased_at)),
    customer_name: c(cols, GURU_COLS.name) || null,
    customer_email: c(cols, GURU_COLS.email) || null,
    customer_cpf: c(cols, GURU_COLS.cpf) || null,
    customer_phone: full_phone,
    utm_source: c(cols, GURU_COLS.utm_source) || null,
    utm_campaign: c(cols, GURU_COLS.utm_campaign) || null,
    utm_medium: c(cols, GURU_COLS.utm_medium) || null,
    utm_content: c(cols, GURU_COLS.utm_content) || null,
  };
}

function c(cols: string[], idx: number): string {
  return (cols[idx] ?? '').trim();
}

function dedupeRowsByTransactionId(rows: any[]): { rows: any[]; duplicates: number } {
  const seen = new Set<string>();
  const deduped: any[] = [];
  let duplicates = 0;

  for (const row of rows) {
    const txId = cleanId(row.platform_transaction_id);
    if (!txId) {
      deduped.push(row);
      continue;
    }

    if (seen.has(txId)) {
      duplicates++;
      continue;
    }

    seen.add(txId);
    deduped.push({ ...row, platform_transaction_id: txId });
  }

  return { rows: deduped, duplicates };
}

function normalizeEduzzRow(cols: string[]): any {
  const fatura = c(cols, EDUZZ_COLS.fatura);
  const productId = c(cols, EDUZZ_COLS.product_id);
  const productName = c(cols, EDUZZ_COLS.product_name);
  // Unique key: fatura + productId se disponível, senão fatura + nome do produto
  const productKey = productId || productName.slice(0, 30).replace(/\s+/g, '_');
  const transactionId = fatura ? `${fatura}_${productKey}` : null;
  return {
    platform: 'eduzz',
    platform_transaction_id: transactionId,
    platform_order_id: fatura || null,
    product_name: c(cols, EDUZZ_COLS.product_name) || '',
    product_id: productId || null,
    offer_name: c(cols, EDUZZ_COLS.offer_name) || null,
    gross_amount: parseBRCurrency(c(cols, EDUZZ_COLS.gross_amount)),
    payment_method: mapPayment(c(cols, EDUZZ_COLS.payment_method)),
    installments: parseInt(c(cols, EDUZZ_COLS.installments)) || 1,
    status: mapEduzzStatus(c(cols, EDUZZ_COLS.status)),
    purchased_at: parseBRDate(c(cols, EDUZZ_COLS.purchased_at)),
    customer_name: c(cols, EDUZZ_COLS.customer_name) || null,
    customer_email: c(cols, EDUZZ_COLS.customer_email) || null,
    customer_cpf: c(cols, EDUZZ_COLS.customer_cpf) || null,
    customer_phone: c(cols, EDUZZ_COLS.customer_phone) || null,
    utm_source: c(cols, EDUZZ_COLS.utm_source) || null,
    utm_campaign: c(cols, EDUZZ_COLS.utm_campaign) || null,
    utm_medium: c(cols, EDUZZ_COLS.utm_medium) || null,
    utm_content: c(cols, EDUZZ_COLS.utm_content) || null,
    utm_term: c(cols, EDUZZ_COLS.utm_term) || null,
  };
}

function normalizeTictoRow(cols: string[]): any {
  return {
    platform: 'ticto',
    platform_transaction_id: c(cols, TICTO_COLS.transaction_id) || null,
    platform_order_id: c(cols, TICTO_COLS.order_id) || null,
    product_name: c(cols, TICTO_COLS.product_name) || '',
    product_id: c(cols, TICTO_COLS.product_id) || null,
    offer_name: c(cols, TICTO_COLS.offer_name) || null,
    gross_amount: parseBRCurrency(c(cols, TICTO_COLS.gross_amount)),
    net_amount: parseBRCurrency(c(cols, TICTO_COLS.net_amount)),
    payment_method: mapPayment(c(cols, TICTO_COLS.payment_method)),
    installments: parseInt(c(cols, TICTO_COLS.installments)) || 1,
    status: mapTictoStatus(c(cols, TICTO_COLS.status)),
    purchased_at: parseBRDate(c(cols, TICTO_COLS.purchased_at)),
    customer_name: c(cols, TICTO_COLS.customer_name) || null,
    customer_email: c(cols, TICTO_COLS.customer_email) || null,
    customer_cpf: c(cols, TICTO_COLS.customer_cpf) || null,
    customer_phone: c(cols, TICTO_COLS.customer_phone) || null,
    utm_source: c(cols, TICTO_COLS.utm_source) || null,
    utm_campaign: c(cols, TICTO_COLS.utm_campaign) || null,
    utm_medium: c(cols, TICTO_COLS.utm_medium) || null,
    utm_content: c(cols, TICTO_COLS.utm_content) || null,
    utm_term: c(cols, TICTO_COLS.utm_term) || null,
  };
}

async function parseFile(file: File, platform: Platform): Promise<{ rows: any[]; headers: string[]; preview: PreviewRow[] }> {
  if (platform === 'guru') {
    // Excel (.xlsx)
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as string[][];
    if (raw.length < 2) return { rows: [], headers: [], preview: [] };
    const headers = raw[0].map(String);
    const dataRows = raw.slice(1).filter(r => r.some(c => String(c).trim()));
    const rows = dataRows.map(r => normalizeGuruRow(r.map(String)));
    const preview = dataRows.slice(0, 5).map(r => {
      const obj: PreviewRow = {};
      headers.forEach((h, i) => { obj[h] = String(r[i] || ''); });
      return obj;
    });
    return { rows, headers, preview };
  } else {
    // CSV tab-separated (Ticto ou Eduzz)
    const text = await file.text();
    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim());
    if (lines.length < 2) return { rows: [], headers: [], preview: [] };
    const sep = detectSeparator(lines[0]);
    const headers = parseLine(lines[0], sep);
    const dataRows = lines.slice(1);
    const normalizer = platform === 'eduzz' ? normalizeEduzzRow : normalizeTictoRow;
    const rows = dataRows.map(l => normalizer(parseLine(l, sep)));
    const preview = dataRows.slice(0, 5).map(l => {
      const cols = parseLine(l, sep);
      const obj: PreviewRow = {};
      headers.forEach((h, i) => { obj[h] = cols[i] || ''; });
      return obj;
    });
    return { rows, headers, preview };
  }
}

const PREVIEW_COLS = {
  guru:  ['nome produto', 'status', 'email contato', 'doc contato', 'valor venda', 'data pedido'],
  ticto: ['Nome do Produto', 'Status', 'E-mail do Cliente', 'Documento do Cliente', 'Valor do Pedido', 'Data do Pedido'],
  eduzz: ['Produto', 'Status', 'Cliente / E-mail', 'Cliente / Documento', 'Valor do Item', 'Data de Pagamento'],
};

export default function Importar() {
  const [platform, setPlatform] = useState<Platform>('ticto');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [logLines, setLogLines] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => setLogLines(prev => [...prev, msg]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setFileName(files.length === 1 ? files[0].name : `${files.length} arquivos`);
    setResult(null);
    setLogLines([]);
    setStatus('previewing');

    try {
      const allRows: any[] = [];
      let firstHeaders: string[] = [];
      const allPreview: PreviewRow[] = [];

      for (const file of files) {
        const { rows, headers, preview } = await parseFile(file, platform);
        if (firstHeaders.length === 0) firstHeaders = headers;
        allRows.push(...rows);
        allPreview.push(...preview);
        addLog(`✅ ${file.name}: ${rows.length} linhas encontradas`);
      }

      const { rows, duplicates } = dedupeRowsByTransactionId(allRows);
      setParsedRows(rows);
      setPreviewHeaders(firstHeaders);
      setPreviewRows(allPreview.slice(0, 5));

      const missingId = rows.filter((r: any) => !r.platform_transaction_id).length;
      addLog(`📦 Total consolidado: ${rows.length} linhas válidas para importar`);
      if (duplicates > 0) addLog(`🔁 ${duplicates} linhas duplicadas entre arquivos removidas antes da importação`);
      if (missingId > 0) {
        addLog(`⚠️ ${missingId} linhas sem ID de transação — serão ignoradas na importação`);
        toast.warning(`${missingId} de ${rows.length} linhas sem ID de transação`);
      }
    } catch (err) {
      toast.error('Erro ao ler o arquivo: ' + String(err));
      setStatus('idle');
    }
  };

  const handleImport = async () => {
    if (!parsedRows.length) return;
    setStatus('importing');
    setProgress(0);

    const BATCH = 250;
    const total = parsedRows.length;
    let inserted = 0;
    let skipped = 0;
    let invalid = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (let i = 0; i < parsedRows.length; i += BATCH) {
      const batch = parsedRows.slice(i, i + BATCH);
      const batchNum = Math.floor(i / BATCH) + 1;
      const totalBatches = Math.ceil(total / BATCH);

      try {
        const { data, error } = await supabase.functions.invoke('process-import', {
          body: {
            records: batch,
            platform,
            org_id: '00000000-0000-0000-0000-000000000001',
          },
        });

        if (error) {
          addLog(`❌ Batch ${batchNum}/${totalBatches}: ${error.message}`);
          errors += batch.length;
        } else {
          inserted += data?.inserted || 0;
          skipped += data?.skipped || 0;
          invalid += data?.invalid || 0;
          errors += data?.errors || 0;
          if (data?.errorDetails?.length) errorDetails.push(...data.errorDetails);
          const parts = [`${data?.inserted || 0} inseridos`];
          if (data?.skipped) parts.push(`${data.skipped} duplicados`);
          if (data?.invalid) parts.push(`${data.invalid} sem ID`);
          addLog(`✅ Batch ${batchNum}/${totalBatches}: ${parts.join(', ')}`);
        }
      } catch (err) {
        addLog(`❌ Batch ${batchNum}/${totalBatches}: ${String(err)}`);
        errors += batch.length;
      }

      setProgress(Math.round(((i + BATCH) / total) * 100));
    }

    setResult({ total, inserted, skipped, invalid, errors, errorDetails });
    setStatus('done');
    toast.success(`Importação concluída! ${inserted} registros inseridos.`);
  };

  const handleReset = () => {
    setStatus('idle');
    setParsedRows([]);
    setPreviewRows([]);
    setPreviewHeaders([]);
    setFileName('');
    setResult(null);
    setLogLines([]);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const previewCols = PREVIEW_COLS[platform];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Importar Dados Históricos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Importe vendas antigas da Ticto (CSV) ou Guru (Excel)</p>
      </div>

      {/* Platform selector */}
      <div className="flex gap-3 flex-wrap">
        {([
          { key: 'ticto', label: 'Ticto (CSV)' },
          { key: 'guru',  label: 'Guru (Excel)' },
          { key: 'eduzz', label: 'Eduzz (CSV)' },
        ] as { key: Platform; label: string }[]).map(p => (
          <button
            key={p.key}
            onClick={() => { setPlatform(p.key); handleReset(); }}
            disabled={status === 'importing'}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              platform === p.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {p.label}
          </button>
        ))}
      </div>

      {/* Upload area */}
      {status === 'idle' && (
        <div
          onClick={() => inputRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-border bg-card hover:border-primary/50 hover:bg-accent/30 transition-colors cursor-pointer p-12 text-center"
        >
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">
            Clique para selecionar o arquivo
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {platform === 'guru' ? 'Arquivo .xlsx exportado da Guru' : platform === 'ticto' ? 'Arquivo .csv exportado da Ticto' : 'Arquivo .csv exportado da Eduzz'}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={platform === 'guru' ? '.xlsx,.xls' : '.csv,.txt'}
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}

      {/* Preview */}
      {(status === 'previewing' || status === 'done') && previewRows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Prévia — primeiras 5 linhas</span>
              <span className="text-xs text-muted-foreground">({parsedRows.length} linhas no total)</span>
            </div>
            <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground underline">
              Trocar arquivo
            </button>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-table-header border-b border-border">
                  {previewCols.map(col => (
                    <th key={col} className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b border-border">
                    {previewCols.map(col => (
                      <td key={col} className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate" title={row[col]}>
                        {row[col] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import button */}
      {status === 'previewing' && (
        <button
          onClick={handleImport}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Upload className="h-4 w-4" />
          Importar {parsedRows.length} registros
        </button>
      )}

      {/* Progress */}
      {status === 'importing' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium">Importando... {progress}%</span>
          </div>
          <div className="w-full bg-border rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Result */}
      {status === 'done' && result && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{result.total}</div>
            <div className="text-xs text-muted-foreground mt-1">Total no arquivo</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">{result.inserted}</div>
            <div className="text-xs text-muted-foreground mt-1">Inseridos</div>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{result.skipped}</div>
            <div className="text-xs text-muted-foreground mt-1">Duplicados</div>
          </div>
          {result.invalid > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-4 text-center">
              <div className="text-2xl font-bold text-orange-600">{result.invalid}</div>
              <div className="text-xs text-muted-foreground mt-1">Sem ID (inválidos)</div>
            </div>
          )}
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{result.errors}</div>
            <div className="text-xs text-muted-foreground mt-1">Erros</div>
          </div>
        </div>
      )}

      {/* Log */}
      {logLines.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 max-h-64 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Log</p>
          {logLines.map((l, i) => (
            <div key={i} className="text-xs font-mono text-muted-foreground py-0.5">{l}</div>
          ))}
        </div>
      )}

      {/* New import after done */}
      {status === 'done' && (
        <button
          onClick={handleReset}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card text-muted-foreground px-4 py-2 text-sm hover:text-foreground transition-colors"
        >
          Importar outro arquivo
        </button>
      )}
    </div>
  );
}
