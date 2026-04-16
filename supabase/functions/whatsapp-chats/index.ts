// v2.0.2 - resilient error serialization + tolerate missing contacts table
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function serializeError(err: any): string {
  if (!err) return 'Unknown error'
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (typeof err === 'object') {
    return err.message || err.error_description || err.error || err.hint || err.details || err.code || JSON.stringify(err)
  }
  return String(err)
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

/** Generate phone variations for matching against leads.phone (which can have +, 55, etc) */
function phoneVariations(phone: string): string[] {
  const digits = normalizePhone(phone)
  const set = new Set<string>([phone, digits, `+${digits}`])
  if (digits.startsWith('55') && digits.length >= 12) {
    const without = digits.slice(2)
    set.add(without)
    set.add(`+55${without}`)
  } else if (digits.length >= 10 && digits.length <= 11) {
    set.add(`55${digits}`)
    set.add(`+55${digits}`)
  }
  return [...set]
}

/**
 * Authorization context. For admin/gestor, full org access.
 * For sellers, restricted to:
 *   - allowedInstanceIds (from whatsapp_instance_access)
 *   - allowedPhones: phones of leads assigned to this user (digits-only)
 */
interface AuthContext {
  userId: string
  orgId: string
  isAdmin: boolean
  allowedInstanceIds: Set<string> | null // null = all
  allowedPhones: Set<string> | null      // null = all (admin)
}

async function buildAuthContext(adminClient: any, userId: string, orgId: string): Promise<AuthContext> {
  const { data: profile } = await adminClient
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  const role = profile?.role || 'vendedor'
  const isAdmin = role === 'admin' || role === 'gestor'

  if (isAdmin) {
    return { userId, orgId, isAdmin: true, allowedInstanceIds: null, allowedPhones: null }
  }

  // Allowed instances
  const { data: accessRows } = await adminClient
    .from('whatsapp_instance_access')
    .select('instance_id')
    .eq('user_id', userId)
  const allowedInstanceIds = new Set<string>((accessRows || []).map((r: any) => r.instance_id))

  // Allowed phones via leads.assigned_to
  const { data: assignedLeads } = await adminClient
    .from('leads')
    .select('phone')
    .eq('organization_id', orgId)
    .eq('assigned_to', userId)
    .not('phone', 'is', null)
  const allowedPhones = new Set<string>()
  for (const l of assignedLeads || []) {
    const d = normalizePhone(l.phone || '')
    if (d) allowedPhones.add(d)
  }

  return { userId, orgId, isAdmin: false, allowedInstanceIds, allowedPhones }
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: orgId, error: orgErr } = await userClient.rpc('get_user_org_id')
    if (orgErr || !orgId) {
      return new Response(JSON.stringify({ error: 'Org not found' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ctx = await buildAuthContext(adminClient, userData.user.id, orgId)

    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'list_chats'
    const instanceId = url.searchParams.get('instance_id')

    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'instance_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isAllMode = instanceId === 'all'

    // --- Instance authorization ---
    let instance: any = null
    if (!isAllMode) {
      // Sellers: instance must be in their access list
      if (!ctx.isAdmin && ctx.allowedInstanceIds && !ctx.allowedInstanceIds.has(instanceId)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      instance = inst
    } else {
      // 'all' mode for sellers: only allowed if they have at least one instance
      if (!ctx.isAdmin && ctx.allowedInstanceIds && ctx.allowedInstanceIds.size === 0) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (action === 'list_chats') {
      let messagesQuery = adminClient
        .from('whatsapp_messages')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(2000)

      let contactsQuery = adminClient
        .from('whatsapp_contacts')
        .select('phone, name, profile_pic_url, instance_id')
        .eq('organization_id', orgId)

      if (!isAllMode) {
        messagesQuery = messagesQuery.eq('instance_id', instanceId)
        contactsQuery = contactsQuery.eq('instance_id', instanceId)
      } else if (!ctx.isAdmin && ctx.allowedInstanceIds) {
        const ids = [...ctx.allowedInstanceIds]
        if (ids.length === 0) {
          return new Response(JSON.stringify([]), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        messagesQuery = messagesQuery.in('instance_id', ids)
        contactsQuery = contactsQuery.in('instance_id', ids)
      }

      const [messagesResult, contactsResult] = await Promise.all([messagesQuery, contactsQuery])
      if (messagesResult.error) {
        throw new Error(`messages query failed: ${serializeError(messagesResult.error)}`)
      }
      if (contactsResult.error) {
        console.warn('[whatsapp-chats] contacts query failed (continuing without contacts):', contactsResult.error.message || contactsResult.error)
      }

      // Seller phone whitelist
      const restrictByPhone = !ctx.isAdmin && ctx.allowedPhones !== null

      const contactMap = new Map(
        (contactsResult.data || []).map((c: any) => [`${c.instance_id}__${c.phone}`, c])
      )

      // Use composite key instance_id + phone so threads are NOT merged across instances
      const chatMap = new Map<string, any>()

      for (const msg of messagesResult.data || []) {
        const cleanPhone = normalizePhone(msg.phone)
        if (restrictByPhone && !ctx.allowedPhones!.has(cleanPhone)) continue

        const key = `${msg.instance_id}__${msg.phone}`
        if (!chatMap.has(key)) {
          chatMap.set(key, {
            phone: msg.phone,
            instance_id: msg.instance_id,
            last_message: msg,
            sender_name: msg.sender_name,
            unread_count: 0,
          })
        }
        const current = chatMap.get(key)
        if (!current.sender_name && msg.sender_name && msg.direction === 'inbound') {
          current.sender_name = msg.sender_name
        }
        if (msg.direction === 'inbound' && msg.status !== 'read' && !msg.is_deleted) {
          current.unread_count++
        }
      }

      for (const [key, chat] of chatMap) {
        const contact = contactMap.get(key)
        if (contact) {
          chat.contact_name = contact.name
          chat.contact_picture = contact.profile_pic_url
          if (!chat.sender_name) chat.sender_name = contact.name
        }
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
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const cleanPhone = normalizePhone(phone)

      // Seller authorization: phone must belong to a lead assigned to them
      if (!ctx.isAdmin && ctx.allowedPhones !== null && !ctx.allowedPhones.has(cleanPhone)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const limit = parseInt(url.searchParams.get('limit') || '50')
      const offset = parseInt(url.searchParams.get('offset') || '0')

      let messagesQuery = adminClient
        .from('whatsapp_messages')
        .select('*')
        .eq('organization_id', orgId)
        .eq('phone', cleanPhone)
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1)

      if (!isAllMode) {
        messagesQuery = messagesQuery.eq('instance_id', instanceId)
      } else if (!ctx.isAdmin && ctx.allowedInstanceIds) {
        messagesQuery = messagesQuery.in('instance_id', [...ctx.allowedInstanceIds])
      }

      const { data: messages, error: msgErr } = await messagesQuery
      if (msgErr) throw new Error(`messages query failed: ${serializeError(msgErr)}`)

      const messageList = messages || []
      const unreadInbound = messageList.filter(m => m.direction === 'inbound' && m.status !== 'read' && !m.is_deleted)
      const unreadIds = new Set(unreadInbound.map(m => m.id))
      let responseMessages = messageList

      if (unreadInbound.length > 0) {
        let updateQuery = adminClient
          .from('whatsapp_messages')
          .update({ status: 'read', updated_at: new Date().toISOString() })
          .eq('organization_id', orgId)
          .eq('phone', cleanPhone)
          .eq('direction', 'inbound')
          .neq('status', 'read')

        if (!isAllMode) {
          updateQuery = updateQuery.eq('instance_id', instanceId)
        } else if (!ctx.isAdmin && ctx.allowedInstanceIds) {
          updateQuery = updateQuery.in('instance_id', [...ctx.allowedInstanceIds])
        }

        const { error: updateErr } = await updateQuery
        if (!updateErr) {
          responseMessages = messageList.map(m => unreadIds.has(m.id) ? { ...m, status: 'read' } : m)
        }

        if (isAllMode) {
          let instQ = adminClient
            .from('whatsapp_instances')
            .select('api_url, api_token')
            .eq('organization_id', orgId)
          if (!ctx.isAdmin && ctx.allowedInstanceIds) {
            instQ = instQ.in('id', [...ctx.allowedInstanceIds])
          }
          const { data: allInstances } = await instQ
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
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    let message: string
    if (err instanceof Error) message = err.message
    else if (err && typeof err === 'object') {
      message = err.message || err.error_description || err.error || err.hint || err.details || JSON.stringify(err)
    } else {
      message = String(err)
    }
    console.error('whatsapp-chats error:', message, err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
