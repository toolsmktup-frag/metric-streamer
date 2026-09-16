/** Admin-only financial replay. Never invokes CRM/legacy webhooks. Run with Deno. */
import { normalizeFinancialEvent, type FinancialPlatform } from '../supabase/functions/_shared/financialEvent.ts';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('Required server credentials missing');
const limit = Number(Deno.args[0] || 100);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Limit must be 1..500');
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
async function rest(path: string, options: RequestInit = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers });
  if (!response.ok) throw new Error(`Financial replay failed: HTTP ${response.status}`);
  return response.json();
}
const accounts = await rest('financial_source_accounts?select=platform,credential_ref,account_id');
// Bounded by ID, not status alone; unmappable rows must not starve later rows.
const after = Number(Deno.args[1] || 0);
if (!Number.isSafeInteger(after) || after < 0) throw new Error('Invalid cursor');
const rows = await rest(`financial_webhook_inbox?select=id,platform,credential_ref,raw_hash,raw_payload,received_at&order=id.asc&id=gt.${after}&limit=${limit}`);
let replayed = 0;
for (const row of rows) {
  const account = accounts.find((a: { platform: string; credential_ref: string }) => a.platform === row.platform && a.credential_ref === row.credential_ref);
  if (!account) continue;
  const event = await normalizeFinancialEvent(row.platform as FinancialPlatform, account.account_id, row.raw_payload, row.received_at);
  await rest('rpc/financial_capture_event', { method: 'POST', body: JSON.stringify({p_platform:row.platform,p_credential_ref:row.credential_ref,p_account_id:account.account_id,p_raw_hash:row.raw_hash,p_raw_payload:row.raw_payload,p_event:event}) });
  replayed++;
}
console.log(JSON.stringify({ scanned: rows.length, replayed, next_after_id: rows.at(-1)?.id || after, mode: 'financial-shadow-only' }));
