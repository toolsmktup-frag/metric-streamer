import { normalizeFinancialEvent, sha256, type FinancialPlatform } from './financialEvent.ts';

// Existing receivers use the SDK's dynamic schema. This interface stays SDK-version independent.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }> };

export async function authenticateAndCapture(client: Client, req: Request, platform: FinancialPlatform, payload: Record<string, unknown>) {
  let credentialRef: string | null = null;
  let guruAccountSlug: string | null = null;
  let funnelId: string | null = null;
  if (platform === 'guru' && typeof payload.api_token === 'string' && payload.api_token.length <= 512) {
    const { data, error } = await client.from('guru_accounts').select('account_slug').eq('api_token', payload.api_token).maybeSingle();
    if (error) throw new Error('authentication_lookup_failed');
    if (data) { guruAccountSlug = data.account_slug; credentialRef = `guru:${data.account_slug}`; }
  }
  const urlToken = new URL(req.url).searchParams.get('token');
  const token = urlToken || (platform === 'ticto' && typeof payload.token === 'string' ? payload.token : null);
  if (token && token.length <= 512) {
    const { data, error } = await client.from('funnel_platforms').select('id,funnel_id').eq('platform', platform).eq('webhook_token', token).eq('is_active', true).maybeSingle();
    if (error) throw new Error('authentication_lookup_failed');
    if (data) { funnelId = data.funnel_id; credentialRef ||= `route:${data.id}`; }
    // Legacy Guru route token may authenticate, but product-name matching never does.
    if (!data && platform === 'guru') {
      const { data: legacy, error: legacyError } = await client.from('lead_funnels').select('id').eq('webhook_token', token).maybeSingle();
      if (legacyError) throw new Error('authentication_lookup_failed');
      if (legacy) { funnelId = legacy.id; credentialRef ||= `legacy:${legacy.id}`; }
    }
  }
  if (!credentialRef) return { authenticated: false as const, funnelId: null, guruAccountSlug: null };
  const { data: account, error: accountError } = await client.from('financial_source_accounts').select('account_id').eq('platform', platform).eq('credential_ref', credentialRef).maybeSingle();
  if (accountError) throw new Error('financial_account_lookup_failed');
  const accountId = account?.account_id || null;
  const receivedAt = new Date().toISOString();
  const event = accountId ? await normalizeFinancialEvent(platform, accountId, payload, receivedAt) : null;
  // Retain original business body, but never archive reusable authentication secrets.
  const { api_token: _apiToken, token: _token, ...raw } = payload;
  const { error } = await client.rpc('financial_capture_event', {
    p_platform: platform, p_credential_ref: credentialRef, p_account_id: accountId,
    p_raw_hash: await sha256(raw), p_raw_payload: raw, p_event: event,
  });
  if (error) throw new Error('financial_capture_failed');
  return { authenticated: true as const, funnelId, guruAccountSlug };
}

export async function financialPreflight(client: Client, req: Request, platform: FinancialPlatform, payload: Record<string, unknown>) {
  try {
    const result = await authenticateAndCapture(client, req, platform, payload);
    return result.authenticated ? { ...result, response: null } : { ...result, response: Response.json({ error: 'Invalid or missing webhook credentials' }, { status: 401 }) };
  } catch {
    // Never log request bodies, credential values or database diagnostics.
    return { authenticated: false, funnelId: null, guruAccountSlug: null, response: Response.json({ error: 'Webhook intake unavailable; retry required' }, { status: 503 }) };
  }
}
