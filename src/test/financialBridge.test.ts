// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { cents, normalizeFinancialEvent, sha256 } from '../../supabase/functions/_shared/financialEvent';
import { handleBridge } from '../../supabase/functions/financial-bridge/handler';
import { authenticateAndCapture, financialPreflight } from '../../supabase/functions/_shared/financialIntake';

const fixture = { id: 'charge-1', status: 'approved', payment: { total: '100.00', net: '94.12' }, dates: { confirmed_at: '2026-08-01T12:00:00Z', updated_at: '2026-08-01T12:00:00Z' }, product: { id: 'p1' }, customer: { email: 'never-export@example.invalid' }, api_token: 'never-export' };
const received = '2026-09-16T12:00:00.000Z';
describe('financial event allowlist', () => {
  it.each([['94.12',9412],['0',0],['10',1000],['10.001',null],['-1',null],['1e4',null],['',null],['9007199254740992',null]])('parses %s exactly', (raw, expected) => expect(cents(raw)).toBe(expected));
  it('deduplicates deliveries and hashes without received_at', async () => {
    const first = await normalizeFinancialEvent('guru','account-1',fixture,received);
    const second = await normalizeFinancialEvent('guru','account-1',fixture,'2026-09-17T12:00:00.000Z');
    expect(first?.event_id).toBe(second?.event_id);
    const { payload_hash, received_at: _received, ...semantic } = first!;
    expect(payload_hash).toBe(await sha256(semantic));
    expect(first?.net_quality).toBe('reported_unverified');
    expect(JSON.stringify(first)).not.toContain('never-export');
  });
  it('zero is known, absent is null and fees are a new revision', async () => {
    const zero = await normalizeFinancialEvent('guru','a',{...fixture,payment:{total:100,net:0}},received);
    const missing = await normalizeFinancialEvent('guru','a',{...fixture,payment:{total:100}},received);
    expect(zero?.net_cents).toBe(0);
    expect(missing?.net_cents).toBeNull();
    expect(zero?.event_id).not.toBe(missing?.event_id);
  });
  it.each(['refunded','sale_refunded','chargeback','sale_chargeback'])('recognizes %s without inventing adjustment amount', async status => {
    const event = await normalizeFinancialEvent('guru','a',{...fixture,status},received);
    expect(event?.status).toBe(status.includes('chargeback')?'chargeback':'refunded');
    expect(event?.adjustment_cents).toBeNull();
  });
  it('does not collapse recurring charges or repeat order total for items', async () => {
    const raw = { transaction_hash: 'monthly-1', status: 'approved', order: { id: 'subscription', paid_amount: 10000 }, items: [{ id:1 },{ id:2 }] };
    const event = await normalizeFinancialEvent('ticto','a',raw,received);
    const next = await normalizeFinancialEvent('ticto','a',{...raw,transaction_hash:'monthly-2'},received);
    expect(event?.gross_cents).toBe(10000);
    expect(event?.item_id).toBe('__charge__');
    expect(event?.product_id).toBeNull();
    expect(event?.allocation_status).toBe('unallocated');
    expect(event?.event_id).not.toBe(next?.event_id);
    expect(await normalizeFinancialEvent('ticto','a',{ order:{id:'subscription'} },received)).toBeNull();
  });
  it('does not export unsupported currency or unknown ID', async () => {
    expect(await normalizeFinancialEvent('guru','a',{...fixture,payment:{currency:'USD'}},received)).toBeNull();
    expect(await normalizeFinancialEvent('eduzz','a',{event:'myeduzz.invoice_paid',data:{id:'invoice-1',price:{value:100,currency:'USD'}}},received)).toBeNull();
    expect(await normalizeFinancialEvent('guru','a',{...fixture,id:''},received)).toBeNull();
  });
  it('accepts Ticto nested charge hash and explicit approval date/quantity', async () => {
    const event = await normalizeFinancialEvent('ticto','account-1',{ status:'approved',status_date:'2026-08-02T09:00:00-03:00',order:{ transaction_hash:'charge-ticto-1',paid_amount:10000 },item:{ product_id:77,quantity:2 } },received);
    expect(event?.charge_id).toBe('charge-ticto-1');
    expect(event?.approved_at).toBe('2026-08-02T12:00:00.000Z');
    expect(event?.product_id).toBe('77');
    expect(event?.quantity).toBe(2);
  });
});

describe('bridge authorization', () => {
  const secret = 'synthetic-test-secret-of-at-least-32-characters';
  const request = (body: unknown, token=secret) => new Request('https://example.invalid/bridge',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify(body)});
  it('rejects absent/wrong secret before RPC', async () => {
    const rpc=vi.fn();
    expect((await handleBridge(request({action:'claim'},'bad'),secret,rpc)).status).toBe(401);
    expect((await handleBridge(request({action:'claim'}),'',rpc)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('fixes consumer server-side and bounds batch', async () => {
    const rpc=vi.fn();
    expect((await handleBridge(request({action:'claim',consumer:'other'}),secret,rpc)).status).toBe(400);
    expect((await handleBridge(request({action:'claim',consumer:'financeiro-shadow-v1',limit:101}),secret,rpc)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('claims via durable RPC and never reports database diagnostics', async () => {
    const rpc=vi.fn().mockResolvedValue({error:{secret:'internal secret'},data:null});
    const response=await handleBridge(request({action:'claim',consumer:'financeiro-shadow-v1'}),secret,rpc);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('internal secret');
  });
  it('normalizes postgres lease timestamps for contract transport', async () => {
    const rpc=vi.fn().mockResolvedValue({error:null,data:{schema_version:1,lease_token:'x',lease_expires_at:'2026-09-16T12:00:00.123456+00:00',events:[]}});
    const response=await handleBridge(request({action:'claim',consumer:'financeiro-shadow-v1'}),secret,rpc);
    expect((await response.json()).lease_expires_at).toBe('2026-09-16T12:00:00.123Z');
  });
});

function clientFixture(authenticated: boolean, captureError: unknown = null) {
  const calls: string[]=[];
  const from = (table: string) => {
    calls.push(table);
    const chain = { select:()=>chain,eq:()=>chain,maybeSingle:async()=>({error:null,data:table==='funnel_platforms'&&authenticated?{id:'route-1',funnel_id:'funnel-1'}:table==='financial_source_accounts'?{account_id:'account-1'}:null}) };
    return chain;
  };
  return {from,rpc:vi.fn().mockResolvedValue({error:captureError}),calls};
}
describe('intake authentication before side effects', () => {
  it.each(['guru','ticto','youshop','eduzz'] as const)('rejects %s without a credential',async platform=>{
    const client=clientFixture(false);
    const result=await authenticateAndCapture(client,new Request('https://example.invalid'),platform,fixture);
    expect(result.authenticated).toBe(false);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.calls).not.toContain('financial_source_accounts');
  });
  it('persists before CRM, does not archive token and returns retry on persistence failure',async()=>{
    const client=clientFixture(true,'db failure');
    const result=await financialPreflight(client,new Request('https://example.invalid?token=synthetic'),'ticto',{token:'secret',transaction_hash:'charge-1',status:'approved'});
    expect(result.response?.status).toBe(503);
    const capture=client.rpc.mock.calls[0];
    expect(capture[0]).toBe('financial_capture_event');
    expect(JSON.stringify(capture[1])).not.toContain('secret');
  });
});
