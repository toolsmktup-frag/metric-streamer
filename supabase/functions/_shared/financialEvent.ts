/** MF-001. Financial-only allowlist. No CRM side effects, no customer data. */
export type FinancialPlatform = 'guru' | 'ticto' | 'youshop' | 'eduzz';
type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};
const id = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return /^[a-zA-Z0-9_.:-]{1,160}$/.test(text) ? text : null;
};
const iso = (value: unknown): string | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
};
export function cents(value: unknown, unit: 'real' | 'cent' = 'real'): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = String(value).trim().match(unit === 'real' ? /^(\d+)(?:\.(\d{1,2}))?$/ : /^(\d+)$/);
  if (!match) return null;
  const amount = BigInt(match[1]) * (unit === 'real' ? 100n : 1n) + BigInt((match[2] || '').padEnd(2, '0') || '0');
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Obj)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function sha256(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export function financialStatus(value: unknown) {
  const status = String(value || '').toLowerCase();
  if (['sale_refunded', 'refunded', 'refund', 'invoice.refunded', 'myeduzz.invoice_refunded'].includes(status)) return 'refunded';
  if (['sale_chargeback', 'chargeback', 'chargedback', 'invoice.chargeback'].includes(status)) return 'chargeback';
  if (['sale_approved', 'sale_completed', 'approved', 'paid', 'authorized', 'completed', 'myeduzz.invoice_paid', 'invoice.paid'].includes(status)) return 'approved';
  if (['pending', 'waiting_payment', 'billet_printed'].includes(status)) return 'pending';
  if (['cancelled', 'canceled', 'expired'].includes(status)) return 'cancelled';
  return 'unknown';
}

export async function normalizeFinancialEvent(platform: FinancialPlatform, accountId: string, raw: unknown, receivedAt: string) {
  const p = obj(raw), sale = obj(p.sale), payment = obj(p.payment), dates = obj(p.dates);
  const data = obj(p.data), order = obj(p.order || data.order), transaction = obj(p.transaction || data.transaction);
  const items = Array.isArray(p.items) ? p.items : Array.isArray(order.items) ? order.items : Array.isArray(data.items) ? data.items : [];
  const invoice = obj(data.invoice), product = obj(p.product || p.item || data.product || items[0]);
  // An order ID is NOT a charge ID: recurring orders must remain distinct.
  const chargeId = platform === 'guru' ? id(sale.transaction_id || payment.marketplace_id || p.id || sale.id)
    : platform === 'ticto' ? id(order.transaction_hash || p.transaction_hash || transaction.hash || transaction.id || payment.marketplace_id)
    : platform === 'youshop' ? id(transaction.id || p.transaction_id || data.transaction_id || obj(order.payment || data.payment || p.payment).id)
    : id(invoice.id || data.invoiceId || (String(p.event || '').includes('invoice') ? data.id : null));
  if (!id(accountId) || !chargeId) return null;
  const currencies = [payment.currency, order.currency, invoice.currency, obj(data.price).currency, data.currency, p.currency].filter(v => v !== undefined && v !== null && v !== '');
  if (currencies.some(currency => currency !== 'BRL')) return null;
  const rawStatus = p.event || p.status || sale.status || order.status || invoice.status;
  const status = financialStatus(rawStatus);
  const approvedAt = iso(dates.confirmed_at || sale.approved_date || invoice.paidAt || data.paidAt || order.paid_at || order.approved_at || (platform === 'ticto' && status === 'approved' ? p.status_date : null));
  const updatedAt = iso(dates.updated_at || sale.updated_at || p.status_date || invoice.updatedAt || data.updatedAt);
  const purchasedAt = iso(dates.ordered_at || sale.created_at || order.order_date || order.created_at || invoice.createdAt || data.createdAt);
  const gross = platform === 'guru' ? cents(payment.total ?? sale.total_amount)
    : platform === 'ticto' ? cents(order.paid_amount ?? p.paid_amount, 'cent')
    : platform === 'youshop' ? cents(order.paid_amount ?? order.total ?? order.amount)
    : cents(invoice.amount ?? obj(data.price).value);
  // Guru field retained as reported only. Other commissions lack verified beneficiary/unit.
  const net = platform === 'guru' ? cents(payment.net) : null;
  const ambiguousItems = items.length > 1;
  const quantity = Number(product.quantity);
  const event = {
    schema_version: 1 as const, parser_version: 'metrics-finance-v1.0.0',
    platform, account_id: accountId, charge_id: chargeId, item_id: '__charge__',
    source_event_id: null, source_revision: null, source_updated_at: updatedAt,
    occurred_at: updatedAt, purchased_at: purchasedAt, approved_at: approvedAt,
    kind: status === 'refunded' ? 'refund' : status === 'chargeback' ? 'chargeback' : status === 'unknown' ? 'unknown' : 'sale_snapshot',
    status, currency: 'BRL' as const, gross_cents: gross, net_cents: net, adjustment_cents: null,
    net_quality: net === null ? 'missing' : 'reported_unverified', net_source: net === null ? null : 'payment.net',
    beneficiary_id: null, product_id: ambiguousItems ? null : id(product.product_id || product.id),
    offer_id: ambiguousItems ? null : id(obj(product.offer).id || product.offer_id),
    quantity: !ambiguousItems && Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null,
    allocation_status: ambiguousItems ? 'unallocated' : 'charge_level', verification_ref: null,
    warnings: [net === null ? 'NET_MISSING' : 'NET_UNVERIFIED', 'BENEFICIARY_UNVERIFIED', ...(!updatedAt ? ['ORDERING_UNVERIFIED'] : []), ...(!approvedAt ? ['APPROVAL_DATE_MISSING'] : []), ...(ambiguousItems ? ['ITEM_ALLOCATION_MISSING'] : [])],
  };
  const eventId = `mf1_${await sha256(event)}`;
  return { ...event, event_id: eventId, payload_hash: await sha256({ ...event, event_id: eventId }), received_at: receivedAt };
}
