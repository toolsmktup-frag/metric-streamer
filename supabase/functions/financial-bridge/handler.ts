export async function validSecret(provided: string, expected: string): Promise<boolean> {
  if (expected.length < 32 || provided.length > 512) return false;
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([hash(provided), hash(expected)]);
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
  return different === 0;
}
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
export async function handleBridge(req: Request, secret: string, rpc: Rpc): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  if (!await validSecret(req.headers.get('authorization')?.replace(/^Bearer /, '') || '', secret)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try {
    const text = await req.text();
    if (text.length > 32_000) throw new Error();
    body = JSON.parse(text);
    if (!body || body.consumer !== 'financeiro-shadow-v1') throw new Error();
  } catch { return Response.json({ error: 'invalid_request' }, { status: 400 }); }
  if (body.action === 'claim') {
    const limit = body.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return Response.json({ error: 'invalid_limit' }, { status: 400 });
    const { data, error } = await rpc('financial_bridge_claim', { p_limit: limit });
    if (error || !data || typeof data !== 'object') return Response.json({ error: 'claim_failed' }, { status: 503 });
    const result = data as Record<string, unknown>;
    const expiry = typeof result.lease_expires_at === 'string' ? Date.parse(result.lease_expires_at) : NaN;
    if (!Number.isFinite(expiry)) return Response.json({ error: 'claim_failed' }, { status: 503 });
    return Response.json({ ...result, lease_expires_at: new Date(expiry).toISOString() });
  }
  if (body.action === 'ack') {
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(body.lease_token) || !Array.isArray(body.event_ids) || body.event_ids.length < 1 || body.event_ids.length > 100 || !body.event_ids.every((v: unknown) => typeof v === 'string' && /^mf1_[\da-f]{64}$/.test(v))) return Response.json({ error: 'invalid_ack' }, { status: 400 });
    const { data, error } = await rpc('financial_bridge_ack', { p_lease_token: body.lease_token, p_event_ids: body.event_ids });
    return error ? Response.json({ error: 'ack_rejected' }, { status: 409 }) : Response.json({ acknowledged: data });
  }
  return Response.json({ error: 'invalid_action' }, { status: 400 });
}
