import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.25.76'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BodySchema = z.object({
  mode: z.enum(['list_groups', 'get_config', 'save_config', 'preview', 'apply', 'invite_missing', 'enable_webhook', 'webhook_event']),
  funnel_id: z.string().uuid().optional(),
  instance_id: z.string().uuid().nullable().optional(),
  group_ids: z.array(z.string()).optional().default([]),
  in_group_stage_id: z.string().uuid().nullable().optional(),
  not_in_group_stage_id: z.string().uuid().nullable().optional(),
  invited_stage_id: z.string().uuid().nullable().optional(),
  left_group_stage_id: z.string().uuid().nullable().optional(),
  auto_move_on_join: z.boolean().optional().default(true),
  auto_move_on_leave: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  invite_group_id: z.string().nullable().optional(),
  payload: z.any().optional(),
})

type SupabaseClient = any
type Body = z.infer<typeof BodySchema>

type PositionRow = {
  id: string
  lead_id: string
  funnel_id: string
  stage_id: string
  lead: { id: string; name: string | null; phone: string | null; email?: string | null } | null
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function cleanPhone(value: unknown): string {
  return String(value || '')
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .replace('@g.us', '')
    .replace(/\D/g, '')
}

function phoneVariations(phone: string): string[] {
  const clean = cleanPhone(phone)
  if (!clean) return []
  const values = new Set<string>([clean, `+${clean}`])
  if (clean.startsWith('55') && clean.length >= 12) {
    const withoutCc = clean.slice(2)
    values.add(withoutCc)
    values.add(`+${withoutCc}`)
  } else if (clean.length >= 10 && clean.length <= 11) {
    values.add(`55${clean}`)
    values.add(`+55${clean}`)
  }
  if (clean.startsWith('55') && clean.length === 13) {
    values.add(`55${clean.slice(2, 4)}${clean.slice(5)}`)
  }
  if (clean.startsWith('55') && clean.length === 12) {
    values.add(`55${clean.slice(2, 4)}9${clean.slice(4)}`)
  }
  return [...values]
}

function participantPhone(participant: any): string {
  return cleanPhone(
    participant?.PhoneNumber ||
    participant?.JID ||
    participant?.LID ||
    participant?.jid ||
    participant?.id ||
    participant?.phone ||
    participant
  )
}

function groupIdFrom(group: any): string {
  return group?.JID || group?.jid || group?.ID || group?.id || group?.groupjid || group?.GroupJID || ''
}

function groupNameFrom(group: any): string {
  return group?.Name || group?.name || group?.Subject || group?.subject || groupIdFrom(group)
}

async function requireUser(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) throw new Error('Usuário não autenticado')
  const token = authHeader.replace('Bearer ', '').trim()
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token)
  const userId = claimsData?.claims?.sub
  if (claimsError || !userId) throw new Error('Sessão inválida')
  const { data: orgId, error: orgErr } = await userClient.rpc('get_user_org_id')
  if (orgErr || !orgId) throw new Error('Organização não encontrada')
  return { userId, orgId: orgId as string }
}

async function ensureFunnelAccess(admin: SupabaseClient, funnelId: string, orgId: string) {
  const { data, error } = await admin
    .from('lead_funnels')
    .select('id, organization_id')
    .eq('id', funnelId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Funil não encontrado para esta organização')
}

async function getInstance(admin: SupabaseClient, instanceId: string) {
  const { data, error } = await admin
    .from('wz_instances')
    .select('id, name, api_url, api_key')
    .eq('id', instanceId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Instância não encontrada')
  return data as any
}

async function uazapi(instance: any, path: string, init?: RequestInit) {
  const baseUrl = String(instance.api_url || '').replace(/\/+$/, '')
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      token: instance.api_key,
      ...(init?.headers || {}),
    },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || data?.message || `UAZAPI retornou ${res.status}`)
  return data
}

async function listGroups(instance: any) {
  const data = await uazapi(instance, '/group/list?force=true&noparticipants=true')
  const rows = Array.isArray(data) ? data : data?.Groups || data?.groups || data?.data || []
  return rows.map((group: any) => ({
    id: groupIdFrom(group),
    name: groupNameFrom(group),
    participants_count: group?.ParticipantsCount || group?.participants_count || group?.participants?.length || undefined,
  })).filter((group: any) => group.id)
}

async function getGroupParticipants(instance: any, groupId: string) {
  const data = await uazapi(instance, '/group/info', {
    method: 'POST',
    body: JSON.stringify({ groupjid: groupId, force: true, getInviteLink: true, getRequestsParticipants: true }),
  })
  const participants = data?.Participants || data?.participants || data?.Group?.Participants || data?.group?.participants || []
  return participants.map(participantPhone).filter(Boolean)
}

async function fetchPositions(admin: SupabaseClient, funnelId: string): Promise<PositionRow[]> {
  const rows: PositionRow[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await admin
      .from('lead_stage_positions')
      .select('id, lead_id, funnel_id, stage_id, lead:leads(id, name, phone, email)')
      .eq('funnel_id', funnelId)
      .range(from, from + pageSize - 1)
    if (error) throw error
    const batch = (data || []) as unknown as PositionRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function buildComparison(admin: SupabaseClient, instance: any, body: Body) {
  const groupPhones = new Set<string>()
  for (const groupId of body.group_ids) {
    const participants = await getGroupParticipants(instance, groupId)
    for (const phone of participants) for (const variant of phoneVariations(phone)) groupPhones.add(cleanPhone(variant))
  }

  const positions = await fetchPositions(admin, body.funnel_id!)
  const matched: PositionRow[] = []
  const missing: PositionRow[] = []
  const invalid: PositionRow[] = []

  for (const position of positions) {
    const phone = position.lead?.phone || ''
    const variants = phoneVariations(phone).map(cleanPhone)
    if (variants.length === 0) {
      invalid.push(position)
    } else if (variants.some(v => groupPhones.has(v))) {
      matched.push(position)
    } else {
      missing.push(position)
    }
  }

  const already = matched.filter(p => body.in_group_stage_id && p.stage_id === body.in_group_stage_id).length
  return { positions, matched, missing, invalid, already }
}

function sample(rows: PositionRow[]) {
  return rows.slice(0, 5).map(row => ({ name: row.lead?.name || null, phone: row.lead?.phone || null }))
}

async function movePositions(admin: SupabaseClient, rows: PositionRow[], stageId: string | null | undefined, body: Body, matched: boolean) {
  if (!stageId) return 0
  let moved = 0
  for (const row of rows) {
    if (row.stage_id === stageId) continue
    const fromStageId = row.stage_id
    const { error } = await admin
      .from('lead_stage_positions')
      .update({ stage_id: stageId, entered_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) throw error
    await admin.from('lead_events').insert({
      lead_id: row.lead_id,
      funnel_id: body.funnel_id,
      event_name: 'whatsapp_group_sync',
      metadata: {
        mode: 'manual_sync',
        matched,
        group_ids: body.group_ids,
        instance_id: body.instance_id,
        from_stage_id: fromStageId,
        to_stage_id: stageId,
      },
    })
    moved++
  }
  return moved
}

async function logRun(admin: SupabaseClient, body: Body, result: any, userId: string | null, status = 'success', errorMessage: string | null = null) {
  const { data: config } = await admin
    .from('lead_funnel_group_sync_configs')
    .select('id')
    .eq('funnel_id', body.funnel_id)
    .maybeSingle()
  await admin.from('lead_funnel_group_sync_runs').insert({
    config_id: config?.id || null,
    funnel_id: body.funnel_id,
    instance_id: body.instance_id || null,
    mode: body.mode,
    group_ids: body.group_ids || [],
    total_positions: result?.total_positions || 0,
    matched_count: result?.matched_count || 0,
    missing_count: result?.missing_count || 0,
    invalid_phone_count: result?.invalid_phone_count || 0,
    moved_in_count: result?.moved_in_count || 0,
    moved_out_count: result?.moved_out_count || 0,
    invited_count: result?.invited_count || 0,
    failed_invite_count: result?.failed_invite_count || 0,
    status,
    error_message: errorMessage,
    payload: result || {},
    created_by: userId,
  })
}

async function handleWebhookEvent(admin: SupabaseClient, payload: any) {
  const eventType = payload.EventType || payload.event || payload.type || ''
  const groupId = payload.groupjid || payload.groupJid || payload.GroupJID || payload.chatid || payload.chat?.wa_chatid || payload.group?.jid || ''
  const participant = cleanPhone(payload.participant || payload.Participant || payload.phone || payload.jid || payload.data?.participant || payload.message?.sender_pn)
  const actionRaw = String(payload.action || payload.Action || payload.eventAction || payload.data?.action || eventType).toLowerCase()
  const isJoin = ['add', 'join', 'joined', 'participant_add', 'group_join', 'groups'].some(v => actionRaw.includes(v))
  const isLeave = ['remove', 'leave', 'left', 'participant_remove', 'group_leave'].some(v => actionRaw.includes(v))
  if (!groupId || !participant || (!isJoin && !isLeave)) return { handled: false }

  const { data: configs, error } = await admin
    .from('lead_funnel_group_sync_configs')
    .select('*')
    .eq('is_active', true)
    .contains('group_ids', [groupId])
  if (error) throw error

  let moved = 0
  for (const config of configs || []) {
    const targetStage = isJoin && config.auto_move_on_join ? config.in_group_stage_id : isLeave && config.auto_move_on_leave ? config.left_group_stage_id : null
    if (!targetStage) continue
    const positions = await fetchPositions(admin, config.funnel_id)
    const target = positions.find(row => phoneVariations(row.lead?.phone || '').map(cleanPhone).some(v => phoneVariations(participant).map(cleanPhone).includes(v)))
    if (!target || target.stage_id === targetStage) continue
    await movePositions(admin, [target], targetStage, { ...config, mode: 'webhook_event', group_ids: [groupId] }, isJoin)
    moved++
  }
  return { handled: true, moved }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  let body: Body
  try {
    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400)
    body = parsed.data

    if (body.mode === 'webhook_event') {
      return json(await handleWebhookEvent(admin, body.payload || body))
    }

    if (!body.funnel_id) return json({ error: 'funnel_id é obrigatório' }, 400)
    const user = await requireUser(req, supabaseUrl, anonKey)
    await ensureFunnelAccess(admin, body.funnel_id, user.orgId)

    if (body.mode === 'get_config') {
      const { data, error } = await admin.from('lead_funnel_group_sync_configs').select('*').eq('funnel_id', body.funnel_id).maybeSingle()
      if (error) throw error
      return json({ config: data })
    }

    if (!body.instance_id) return json({ error: 'instance_id é obrigatório' }, 400)
    const instance = await getInstance(admin, body.instance_id)

    if (body.mode === 'list_groups') return json({ groups: await listGroups(instance) })

    if (body.mode === 'save_config') {
      const payload = {
        funnel_id: body.funnel_id,
        instance_id: body.instance_id,
        group_ids: body.group_ids,
        in_group_stage_id: body.in_group_stage_id || null,
        not_in_group_stage_id: body.not_in_group_stage_id || null,
        invited_stage_id: body.invited_stage_id || null,
        left_group_stage_id: body.left_group_stage_id || null,
        auto_move_on_join: body.auto_move_on_join,
        auto_move_on_leave: body.auto_move_on_leave,
        is_active: body.is_active,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await admin.from('lead_funnel_group_sync_configs').upsert(payload, { onConflict: 'funnel_id' }).select().single()
      if (error) throw error
      return json({ config: data })
    }

    if (body.mode === 'enable_webhook') {
      const url = `${supabaseUrl}/functions/v1/uazapi-webhook`
      await uazapi(instance, '/webhook', {
        method: 'POST',
        body: JSON.stringify({ url, enabled: true, events: ['messages', 'messages_update', 'connection', 'groups'] }),
      })
      return json({ ok: true })
    }

    const comparison = await buildComparison(admin, instance, body)
    const baseResult = {
      total_positions: comparison.positions.length,
      matched_count: comparison.matched.length,
      missing_count: comparison.missing.length,
      invalid_phone_count: comparison.invalid.length,
      already_in_stage_count: comparison.already,
      samples: { matched: sample(comparison.matched), missing: sample(comparison.missing), invalid: sample(comparison.invalid) },
    }

    if (body.mode === 'preview') {
      await logRun(admin, body, baseResult, user.userId)
      return json({ result: baseResult })
    }

    if (body.mode === 'apply') {
      const movedIn = await movePositions(admin, comparison.matched, body.in_group_stage_id, body, true)
      const movedOut = await movePositions(admin, comparison.missing, body.not_in_group_stage_id, body, false)
      const result = { ...baseResult, moved_in_count: movedIn, moved_out_count: movedOut }
      await logRun(admin, body, result, user.userId)
      return json({ result })
    }

    if (body.mode === 'invite_missing') {
      const groupId = body.invite_group_id || body.group_ids[0]
      if (!groupId) return json({ error: 'Escolha um grupo para convidar' }, 400)
      let invited = 0
      let failed = 0
      const invitePhones: string[] = []
      for (const row of comparison.missing) {
        const phone = cleanPhone(row.lead?.phone)
        if (!phone) continue
        invitePhones.push(phone.startsWith('55') ? phone : `55${phone}`)
      }
      for (let i = 0; i < invitePhones.length; i += 20) {
        const batch = invitePhones.slice(i, i + 20)
        try {
          await uazapi(instance, '/group/updateParticipants', {
            method: 'POST',
            body: JSON.stringify({ groupjid: groupId, action: 'add', participants: batch }),
          })
          invited += batch.length
        } catch (_err) {
          failed += batch.length
        }
      }
      const movedInvited = invited > 0 ? await movePositions(admin, comparison.missing.slice(0, invited), body.invited_stage_id, body, false) : 0
      const result = { ...baseResult, invited_count: invited, failed_invite_count: failed, moved_out_count: movedInvited }
      await logRun(admin, body, result, user.userId)
      return json({ result })
    }

    return json({ error: 'Modo inválido' }, 400)
  } catch (err) {
    console.error('wz-group-sync error:', err)
    return json({ error: err instanceof Error ? err.message : 'Erro inesperado' }, 500)
  }
})
