// v2.3.0 - vendedora vê TODAS as conversas das instâncias autorizadas (sem filtro por assigned_to)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function serializeError(err: any): string {
  if (!err) return 'Unknown error'
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (typeof err === 'object') {
    return err.message || err.error_description || err.error || err.hint || err.details || err.code || JSON.stringify(err)
  }
  return String(err)
}

function normalizePhone(phone: string) {
  return String(phone || '').replace(/\D/g, '')
}

function phoneVariations(phone: string): string[] {
  const digits = normalizePhone(phone)
  if (!digits) return []

  const set = new Set<string>([digits, `+${digits}`])

  if (digits.startsWith('55') && digits.length >= 12) {
    const withoutCountry = digits.slice(2)
    set.add(withoutCountry)
    set.add(`+${withoutCountry}`)
  } else if (digits.length >= 10 && digits.length <= 11) {
    set.add(`55${digits}`)
    set.add(`+55${digits}`)
  }

  return [...set]
}

// Descasca DDI 55 e reduz o número BR à sua parte "DDD + local".
// Retorna null quando não parece um número BR (10 ou 11 dígitos após o DDI).
function brDddLocal(phone: string): { ddd: string; local: string } | null {
  let d = normalizePhone(phone)
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.length < 10 || d.length > 11) return null
  return { ddd: d.slice(0, 2), local: d.slice(2) }
}

// Chave canônica que colapsa as variações do "9º dígito" e do DDI:
// mesmo contato (mesmo DDD + mesmos 8 dígitos finais) → mesma chave.
// Ex.: 554999083301 e 5549999083301 → ambos "4999083301".
function brCanonicalKey(phone: string): string {
  const parsed = brDddLocal(phone)
  if (!parsed) return normalizePhone(phone)
  const { ddd, local } = parsed
  // Celular com 9º dígito (9 dígitos começando em 9) → derruba o 9 para casar
  // com o registro legado de 8 dígitos.
  const base = local.length === 9 && local[0] === '9' ? local.slice(1) : local
  return `${ddd}${base}`
}

// Todas as formas plausíveis em que o número pode estar gravado, para casar
// mensagens/contatos que ficaram em formatos diferentes do mesmo contato.
function brPhoneForms(phone: string): string[] {
  const parsed = brDddLocal(phone)
  if (!parsed) return phoneVariations(phone)
  const { ddd, local } = parsed
  const isMobile = local.length === 9 && local[0] === '9'
  const base8 = isMobile ? local.slice(1) : local
  const locals = new Set<string>([local])
  // Só pareia as formas 8↔9 dígitos para celulares (base começa em 6-9).
  if (/[6-9]/.test(base8[0])) {
    locals.add(base8)
    locals.add(`9${base8}`)
  }
  const forms = new Set<string>()
  for (const loc of locals) {
    forms.add(`${ddd}${loc}`)
    forms.add(`55${ddd}${loc}`)
    forms.add(`+55${ddd}${loc}`)
    forms.add(`+${ddd}${loc}`)
  }
  return [...forms]
}

interface AuthContext {
  userId: string
  orgId: string
  isAdmin: boolean
  allowedInstanceIds: Set<string> | null
}

interface LeadAccess {
  allowedLeadIds: Set<string> | null
  allowedPhones: Set<string> | null
}

async function buildAuthContext(adminClient: any, userId: string, orgId: string): Promise<AuthContext> {
  const { data: profile, error: profileError } = await adminClient
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    throw new Error(`profile lookup failed: ${serializeError(profileError)}`)
  }

  const role = profile?.role || 'vendedor'
  const isAdmin = role === 'admin' || role === 'gestor'

  if (isAdmin) {
    return { userId, orgId, isAdmin: true, allowedInstanceIds: null }
  }

  const { data: accessRows, error: accessError } = await adminClient
    .from('whatsapp_instance_access')
    .select('instance_id')
    .eq('user_id', userId)

  if (accessError) {
    throw new Error(`instance access lookup failed: ${serializeError(accessError)}`)
  }

  return {
    userId,
    orgId,
    isAdmin: false,
    allowedInstanceIds: new Set<string>((accessRows || []).map((row: any) => row.instance_id)),
  }
}

async function resolveLeadAccess(
  adminClient: any,
  ctx: AuthContext,
  candidates: Array<{ phone?: string | null; lead_id?: string | null }>
): Promise<LeadAccess> {
  if (ctx.isAdmin) {
    return { allowedLeadIds: null, allowedPhones: null }
  }

  const allowedLeadIds = new Set<string>()
  const allowedPhones = new Set<string>()

  const candidateLeadIds = Array.from(
    new Set(candidates.map(candidate => candidate?.lead_id).filter(Boolean))
  ) as string[]

  if (candidateLeadIds.length > 0) {
    const { data: leadRowsById, error: leadIdError } = await adminClient
      .from('leads')
      .select('id, phone')
      .eq('organization_id', ctx.orgId)
      .eq('assigned_to', ctx.userId)
      .in('id', candidateLeadIds)

    if (leadIdError) {
      throw new Error(`lead authorization by id failed: ${serializeError(leadIdError)}`)
    }

    for (const lead of leadRowsById || []) {
      if (lead.id) allowedLeadIds.add(lead.id)
      if (lead.phone) allowedPhones.add(normalizePhone(lead.phone))
    }
  }

  const normalizedPhones = Array.from(
    new Set(candidates.map(candidate => normalizePhone(candidate?.phone || '')).filter(Boolean))
  ).slice(0, 250)

  if (normalizedPhones.length > 0) {
    const lookupPhones = Array.from(new Set(normalizedPhones.flatMap(phoneVariations))).slice(0, 1200)

    if (lookupPhones.length > 0) {
      const { data: leadRowsByPhone, error: leadPhoneError } = await adminClient
        .from('leads')
        .select('id, phone')
        .eq('organization_id', ctx.orgId)
        .eq('assigned_to', ctx.userId)
        .in('phone', lookupPhones)

      if (leadPhoneError) {
        throw new Error(`lead authorization by phone failed: ${serializeError(leadPhoneError)}`)
      }

      for (const lead of leadRowsByPhone || []) {
        if (lead.id) allowedLeadIds.add(lead.id)
        if (lead.phone) allowedPhones.add(normalizePhone(lead.phone))
      }
    }
  }

  return { allowedLeadIds, allowedPhones }
}

function hasLeadAccess(
  ctx: AuthContext,
  access: LeadAccess,
  candidate: { phone?: string | null; lead_id?: string | null }
) {
  if (ctx.isAdmin) return true
  if (candidate.lead_id && access.allowedLeadIds?.has(candidate.lead_id)) return true

  const cleanPhone = normalizePhone(candidate.phone || '')
  return !!cleanPhone && !!access.allowedPhones?.has(cleanPhone)
}

async function tryMarkChatAsRead(apiUrl: string, apiToken: string, phone: string) {
  const baseUrl = apiUrl.replace(/\/+$/, '')
  const cleanPhone = normalizePhone(phone)
  const chatId = phone.includes('@') ? phone : `${cleanPhone}@s.whatsapp.net`

  try {
    const res = await fetch(`${baseUrl}/chat/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', token: apiToken },
      body: JSON.stringify({ number: chatId, read: true }),
    })
    await res.text()
    return res.ok
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: orgId, error: orgErr } = await userClient.rpc('get_user_org_id')
    if (orgErr || !orgId) {
      return new Response(JSON.stringify({ error: 'Org not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ctx = await buildAuthContext(adminClient, userData.user.id, orgId)

    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'list_chats'
    const instanceId = url.searchParams.get('instance_id')

    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'instance_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isAllMode = instanceId === 'all'
    let instance: any = null

    if (!isAllMode) {
      if (!ctx.isAdmin && ctx.allowedInstanceIds && !ctx.allowedInstanceIds.has(instanceId)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: inst, error: instErr } = await adminClient
        .from('whatsapp_instances')
        .select('id, organization_id, api_url, api_token')
        .eq('id', instanceId)
        .eq('organization_id', orgId)
        .single()

      if (instErr || !inst) {
        return new Response(JSON.stringify({ error: 'Instance not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      instance = inst
    } else if (!ctx.isAdmin && ctx.allowedInstanceIds && ctx.allowedInstanceIds.size === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'list_chats') {
      const scanLimit = isAllMode ? 300 : 200

      let messagesQuery = adminClient
        .from('whatsapp_messages')
        .select('id, organization_id, instance_id, phone, body, message_type, direction, status, is_deleted, lead_id, sender_name, created_at, updated_at')
        .eq('organization_id', orgId)
        .not('phone', 'is', null)
        .order('created_at', { ascending: false })
        .limit(scanLimit)

      if (!isAllMode) {
        messagesQuery = messagesQuery.eq('instance_id', instanceId)
      } else if (!ctx.isAdmin && ctx.allowedInstanceIds) {
        const ids = [...ctx.allowedInstanceIds]
        if (ids.length === 0) {
          return new Response(JSON.stringify([]), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        messagesQuery = messagesQuery.in('instance_id', ids)
      }

      const { data: recentMessages, error: messagesError } = await messagesQuery
      if (messagesError) {
        throw new Error(`messages query failed: ${serializeError(messagesError)}`)
      }

      // Visibilidade: vendedora com acesso a uma instância vê TODAS as conversas
      // dessa instância (sem filtro adicional por assigned_to). O filtro por
      // instance_id já foi aplicado acima via ctx.allowedInstanceIds.
      const visibleMessages = recentMessages || []

      const chatMap = new Map<string, any>()
      const relevantPhones = new Set<string>()
      const relevantInstanceIds = new Set<string>()

      for (const msg of visibleMessages) {
        if (!msg?.phone || !msg?.instance_id) continue

        // Agrupa por chave canônica (colapsa 9º dígito/DDI) para não duplicar o
        // mesmo contato gravado em formatos diferentes.
        const key = `${msg.instance_id}__${brCanonicalKey(msg.phone)}`
        if (!chatMap.has(key)) {
          chatMap.set(key, {
            // Representante = número REAL da mensagem (o JID que o WhatsApp usa),
            // NÃO uma forma sintética — o front usa este phone pra ENVIAR e pro
            // realtime, então precisa ser o número que entrega de fato.
            phone: msg.phone,
            rep_from_inbound: msg.direction === 'inbound',
            instance_id: msg.instance_id,
            last_message: msg,
            sender_name: msg.sender_name,
            unread_count: 0,
          })
          for (const form of brPhoneForms(msg.phone)) relevantPhones.add(form)
          relevantInstanceIds.add(msg.instance_id)
        }

        const current = chatMap.get(key)
        // Prefere o JID de uma mensagem inbound (número real que o contato usa).
        // Mensagens vêm DESC, então fixa na inbound mais recente e não troca depois.
        if (!current.rep_from_inbound && msg.direction === 'inbound') {
          current.phone = msg.phone
          current.rep_from_inbound = true
        }
        if (!current.sender_name && msg.sender_name && msg.direction === 'inbound') {
          current.sender_name = msg.sender_name
        }
        if (msg.direction === 'inbound' && msg.status !== 'read' && !msg.is_deleted) {
          current.unread_count++
        }
      }

      let contactMap = new Map<string, any>()
      // relevantPhones agora guarda várias formas por contato (9º dígito/DDI),
      // então o teto é maior para não perder nomes/fotos.
      const contactPhoneValues = [...relevantPhones].slice(0, 900)
      const contactInstanceIds = [...relevantInstanceIds]

      if (contactPhoneValues.length > 0) {
        let contactsQuery = adminClient
          .from('whatsapp_contacts')
          .select('phone, name, profile_pic_url, instance_id')
          .eq('organization_id', orgId)
          .in('phone', contactPhoneValues)

        if (contactInstanceIds.length === 1) {
          contactsQuery = contactsQuery.eq('instance_id', contactInstanceIds[0])
        } else if (contactInstanceIds.length > 1) {
          contactsQuery = contactsQuery.in('instance_id', contactInstanceIds)
        }

        const { data: contactsData, error: contactsError } = await contactsQuery
        if (contactsError) {
          console.warn('[whatsapp-chats] contacts query failed (continuing without contacts):', serializeError(contactsError))
        } else {
          contactMap = new Map(
            (contactsData || []).map((contact: any) => [`${contact.instance_id}__${brCanonicalKey(contact.phone)}`, contact])
          )
        }
      }

      // Fallback de nome pela tabela de leads — o painel usa lead.name, então a
      // lista deve casar (evita mostrar o número cru quando o contato não veio do
      // WhatsApp, ex.: conversa só com mensagens de saída). Indexado por canônico.
      const leadNameMap = new Map<string, string>()
      if (contactPhoneValues.length > 0) {
        const { data: leadRows, error: leadErr } = await adminClient
          .from('leads')
          .select('phone, name')
          .eq('organization_id', orgId)
          .in('phone', contactPhoneValues)

        if (leadErr) {
          console.warn('[whatsapp-chats] leads name query failed (continuing):', serializeError(leadErr))
        } else {
          for (const row of (leadRows || []) as Array<{ phone: string | null; name: string | null }>) {
            const nm = (row?.name || '').trim()
            if (!row?.phone || !nm) continue
            const k = brCanonicalKey(row.phone)
            if (!leadNameMap.has(k)) leadNameMap.set(k, nm)
          }
        }
      }

      // Carrega nomes das instâncias da org pra filtrar nomes "poluídos"
      // (UAZAPI grava nome da instância como senderName em mensagens fromMe).
      const instanceNameSet = new Set<string>()
      try {
        const { data: instData } = await adminClient
          .from('wz_instances')
          .select('name')
        for (const row of (instData || []) as Array<{ name: string | null }>) {
          const n = (row?.name || '').trim().toLowerCase()
          if (n) instanceNameSet.add(n)
        }
      } catch (_e) {
        // best effort — segue sem filtro
      }

      const isInstanceName = (n: string | null | undefined) => {
        if (!n) return false
        return instanceNameSet.has(String(n).trim().toLowerCase())
      }

      for (const [key, chat] of chatMap) {
        const contact = contactMap.get(key)
        const contactName = contact?.name && !isInstanceName(contact.name) ? contact.name : null
        if (contact) {
          chat.contact_name = contactName
          chat.contact_picture = contact.profile_pic_url
          if (!chat.sender_name && contactName) chat.sender_name = contactName
        }
        // Limpa sender_name se for nome de instância
        if (isInstanceName(chat.sender_name)) {
          chat.sender_name = chat.contact_name || null
        }
        // Sem nome útil do WhatsApp → usa o nome do lead (mesmo do painel).
        if (!chat.contact_name && !chat.sender_name) {
          const leadName = leadNameMap.get(brCanonicalKey(chat.phone))
          if (leadName) {
            chat.contact_name = leadName
            chat.sender_name = leadName
          }
        }
        delete chat.rep_from_inbound // campo auxiliar interno, não vai pro front
      }

      const chatList = Array.from(chatMap.values()).sort(
        (a, b) => new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime()
      )

      return new Response(JSON.stringify(chatList), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'messages') {
      const phone = url.searchParams.get('phone')
      if (!phone) {
        return new Response(JSON.stringify({ error: 'phone required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const cleanPhone = normalizePhone(phone)
      // Casa todas as formas do número (9º dígito/DDI) para unificar a thread.
      const phoneForms = brPhoneForms(phone)
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 200)
      const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0)

      // Visibilidade: vendedora não-admin precisa ter acesso à instância em
      // que a conversa ocorre. Não filtramos mais por assigned_to do lead —
      // quem tem acesso à instância vê todas as conversas dela.
      if (!ctx.isAdmin && !isAllMode) {
        if (ctx.allowedInstanceIds && !ctx.allowedInstanceIds.has(instanceId!)) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      let messagesQuery = adminClient
        .from('whatsapp_messages')
        .select('id, organization_id, instance_id, phone, body, message_type, direction, status, media_url, media_mime_type, media_filename, message_id_external, payload_raw, is_deleted, lead_id, sender_name, created_at, updated_at')
        .eq('organization_id', orgId)
        .in('phone', phoneForms)
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1)

      if (!isAllMode) {
        messagesQuery = messagesQuery.eq('instance_id', instanceId)
      } else if (!ctx.isAdmin && ctx.allowedInstanceIds) {
        messagesQuery = messagesQuery.in('instance_id', [...ctx.allowedInstanceIds])
      }

      const { data: messages, error: msgErr } = await messagesQuery
      if (msgErr) {
        throw new Error(`messages query failed: ${serializeError(msgErr)}`)
      }

      const messageList = messages || []

      const unreadInbound = messageList.filter((message: any) => message.direction === 'inbound' && message.status !== 'read' && !message.is_deleted)
      const unreadIds = new Set(unreadInbound.map((message: any) => message.id))
      let responseMessages = messageList

      if (unreadInbound.length > 0) {
        let updateQuery = adminClient
          .from('whatsapp_messages')
          .update({ status: 'read', updated_at: new Date().toISOString() })
          .eq('organization_id', orgId)
          .in('phone', phoneForms)
          .eq('direction', 'inbound')
          .neq('status', 'read')

        if (!isAllMode) {
          updateQuery = updateQuery.eq('instance_id', instanceId)
        } else if (!ctx.isAdmin && ctx.allowedInstanceIds) {
          updateQuery = updateQuery.in('instance_id', [...ctx.allowedInstanceIds])
        }

        const { error: updateErr } = await updateQuery
        if (!updateErr) {
          responseMessages = messageList.map((message: any) =>
            unreadIds.has(message.id) ? { ...message, status: 'read' } : message
          )
        }

        if (isAllMode) {
          let instQuery = adminClient
            .from('whatsapp_instances')
            .select('api_url, api_token')
            .eq('organization_id', orgId)

          if (!ctx.isAdmin && ctx.allowedInstanceIds) {
            instQuery = instQuery.in('id', [...ctx.allowedInstanceIds])
          }

          const { data: allInstances } = await instQuery
          if (allInstances) {
            await Promise.allSettled(
              allInstances.map((inst: any) => tryMarkChatAsRead(inst.api_url, inst.api_token, cleanPhone))
            )
          }
        } else if (instance) {
          await tryMarkChatAsRead(instance.api_url, instance.api_token, cleanPhone)
        }
      }

      return new Response(JSON.stringify(responseMessages), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    const message = serializeError(err)
    console.error('whatsapp-chats error:', message, err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})