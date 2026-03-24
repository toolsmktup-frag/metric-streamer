import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

function parseDate(val: string): string | null {
  if (!val) return null;
  const match = val.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = match;
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`;
}

function parseCurrency(val: string): number {
  if (!val) return 0;
  const clean = val.replace(/[R$\s.]/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

function mapStatus(val: string): string {
  const map: Record<string, string> = {
    'Autorizado': 'authorized', 'Aguardando Pagamento': 'waiting_payment',
    'Pix Gerado': 'pix_created', 'Boleto Impresso': 'bank_slip_created',
    'Reembolsado': 'refunded', 'Reembolso': 'refunded',
    'Chargeback': 'chargeback', 'Recusado': 'refused', 'Recusada': 'refused',
    'Carrinho Abandonado': 'abandoned_cart', 'Cancelado': 'refused',
  };
  return map[val] || val.toLowerCase().replace(/\s+/g, '_');
}

function mapPaymentMethod(val: string): string {
  if (!val) return 'unknown';
  const lower = val.toLowerCase();
  if (lower.includes('cr') || lower.includes('cart')) return 'credit_card';
  if (lower.includes('pix')) return 'pix';
  if (lower.includes('boleto')) return 'bank_slip';
  return lower.replace(/\s+/g, '_');
}

const COL = {
  ORDER_ID: 0, ORDER_HASH: 1, ORDER_DATE: 2, PRODUCT_ID: 3, PRODUCT_NAME: 4,
  OFFER_NAME: 5, OFFER_CODE: 6, TRANSACTION_HASH: 7, STATUS: 8, STATUS_DATE: 11,
  PAYMENT_METHOD: 12, INSTALLMENTS: 17, PAID_AMOUNT: 23, CUSTOMER_NAME: 38,
  CUSTOMER_EMAIL: 39, CUSTOMER_PHONE: 43, CUSTOMER_CODE: 44,
  SRC: 53, SCK: 54, UTM_SOURCE: 55, UTM_CONTENT: 56, UTM_MEDIUM: 57,
  UTM_TERM: 59, UTM_CAMPAIGN: 60,
};

export default function ImportCSV() {
  const [log, setLog] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);

  const addLog = (msg: string) => setLog(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    setLog([]);
    addLog(`Arquivo: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    const text = await file.text();
    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim());
    addLog(`${lines.length - 1} linhas de dados encontradas`);

    const records: any[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 45) { errors.push(`Linha ${i + 1}: poucos campos (${cols.length})`); continue; }

        const txHash = cols[COL.TRANSACTION_HASH]?.replace(/^="?|"?$/g, '');
        if (!txHash) { errors.push(`Linha ${i + 1}: sem transaction_hash`); continue; }

        const customerCode = cols[COL.CUSTOMER_CODE]?.replace(/^="?|"?$/g, '') || null;

        records.push({
          order_id: parseInt(cols[COL.ORDER_ID]) || null,
          order_hash: cols[COL.ORDER_HASH] || null,
          order_date: parseDate(cols[COL.ORDER_DATE]),
          product_id: parseInt(cols[COL.PRODUCT_ID]) || null,
          product_name: cols[COL.PRODUCT_NAME] || null,
          offer_name: cols[COL.OFFER_NAME] || null,
          offer_code: cols[COL.OFFER_CODE] || null,
          transaction_hash: txHash,
          status: mapStatus(cols[COL.STATUS] || ''),
          status_date: parseDate(cols[COL.STATUS_DATE]),
          payment_method: mapPaymentMethod(cols[COL.PAYMENT_METHOD]),
          installments: parseInt(cols[COL.INSTALLMENTS]) || 1,
          paid_amount: parseCurrency(cols[COL.PAID_AMOUNT]),
          customer_name: cols[COL.CUSTOMER_NAME] || null,
          customer_email: cols[COL.CUSTOMER_EMAIL] || null,
          customer_phone: cols[COL.CUSTOMER_PHONE] || null,
          customer_code: customerCode,
          src: cols[COL.SRC] || null,
          sck: cols[COL.SCK] || null,
          utm_source: cols[COL.UTM_SOURCE] || null,
          utm_campaign: cols[COL.UTM_CAMPAIGN] || null,
          utm_medium: cols[COL.UTM_MEDIUM] || null,
          utm_content: cols[COL.UTM_CONTENT] || null,
          utm_term: cols[COL.UTM_TERM] || null,
        });
      } catch (err) {
        errors.push(`Linha ${i + 1}: ${String(err)}`);
      }
    }

    addLog(`${records.length} registros válidos, ${errors.length} erros de parsing`);
    if (errors.length > 0) addLog(`Erros: ${errors.slice(0, 5).join('; ')}`);

    // Send in batches of 250 to edge function
    let totalInserted = 0;
    const batchSize = 250;
    const totalBatches = Math.ceil(records.length / batchSize);

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      addLog(`Enviando batch ${batchNum}/${totalBatches} (${batch.length} registros)...`);

      const { data, error } = await supabase.functions.invoke('import-ticto-csv', {
        body: { records: batch, platform: 'ticto' },
      });

      if (error) {
        addLog(`❌ Erro batch ${batchNum}: ${error.message}`);
      } else {
        totalInserted += data?.inserted || 0;
        if (data?.errors?.length > 0) {
          addLog(`⚠️ Batch ${batchNum}: ${data.errors.join('; ')}`);
        } else {
          addLog(`✅ Batch ${batchNum}: ${data?.inserted || 0} inseridos`);
        }
      }
    }

    addLog(`🎉 Importação concluída! Total inserido: ${totalInserted}`);
    setProcessing(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Importar CSV Ticto</h1>
        <p className="text-sm text-muted-foreground">Selecione o arquivo CSV exportado da Ticto</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          disabled={processing}
          className="block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
        />
      </div>

      {log.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 max-h-96 overflow-y-auto">
          <h3 className="font-semibold mb-2 text-foreground">Log de Importação:</h3>
          {log.map((l, i) => (
            <div key={i} className="text-xs font-mono text-muted-foreground py-0.5">{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
