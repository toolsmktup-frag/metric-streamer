// v1.0.3 - use admin client for message reads and simplify UAZAPI read sync
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

async function tryMarkChatAsRead(apiUrl: string, apiToken: string, phone: string, messageId?: string | null) {
  const baseUrl = apiUrl.replace(/\/+$/, '')
  const cleanPhone = normalizePhone(phone)
  const chatId = phone.includes('@') ? phone : `${cleanPhone}@s.whatsapp.net`

  const attempts = [
    {
      label: 'chat/read number',
      url: `${baseUrl}/chat/read`,
      body: { number: cleanPhone },
    },
    {
      label: 'chat/read phone',
      url: `${baseUrl}/chat/read`,
      body: { phone: cleanPhone },
    },
    {
      label: 'chat/read chatId',
      url: `${baseUrl}/chat/read`,
      body: { phone: chatId },
    },
    ...(messageId
      ? [
          {
            label: 'chat/read messageId',
            url: `${baseUrl}/chat/read`,
            body: { number: cleanPhone, messageId },
          },
          {
            label: 'message/read legacy',
            url: `${baseUrl}/message/read`,
            body: { number: cleanPhone, messageId },
          },
        ]
      : []),
  ]

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          token: apiToken,
        },
        body: JSON.stringify(attempt.body),
      })

      const text = await res.text()
      console.log(`[whatsapp-chats] mark read ${attempt.label}: ${res.status} - ${text.slice(0, 300)}`)
      if (res.ok) return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`[whatsapp-chats] mark read failed ${attempt.label}: ${message}`)
    }
  }

  return false
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

    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'list_chats'
    const instanceId = url.searchParams.get('instance_id')

    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'instance_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: instance, error: instErr } = await userClient
      .from('whatsapp_instances')
      .select('id, organization_id, api_url, api_token')
      .eq('id', instanceId)
      .eq('organization_id', orgId)
      .single()

    if (instErr || !instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'list_chats') {
      const { data: chats, error: chatsErr } = await adminClient
        .from('whatsapp_messages')
        .select('*')
        .eq('organization_id', orgId)
        .eq('instance_id', instanceId)
        .order('created_at', { ascending: false })

      if (chatsErr) throw chatsErr

      const chatMap = new Map<string, any>()

      for (const msg of chats || []) {
        if (!chatMap.has(msg.phone)) {
          chatMap.set(msg.phone, {
            phone: msg.phone,
            last_message: msg,
            sender_name: msg.sender_name,
            unread_count: 0,
          })
        }
        if (msg.direction === 'inbound' && msg.status !== 'read' && !msg.is_deleted) {
          const current = chatMap.get(msg.phone)
          if (current) current.unread_count++
        }
      }

      const chatList = Array.from(chatMap.values())
        .sort((a, b) => new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime())

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
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const offset = parseInt(url.searchParams.get('offset') || '0')

      const { data: messages, error: msgErr } = await adminClient
        .from('whatsapp_messages')
        .select('*')
        .eq('organization_id', orgId)
        .eq('instance_id', instanceId)
        .eq('phone', cleanPhone)
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1)

      if (msgErr) throw msgErr

      const messageList = messages || []
      const unreadInbound = messageList.filter(msg => msg.direction === 'inbound' && msg.status !== 'read' && !msg.is_deleted)
      const unreadIds = new Set(unreadInbound.map(msg => msg.id))
      let responseMessages = messageList

      if (unreadInbound.length > 0) {
        const latestUnread = unreadInbound[unreadInbound.length - 1]

        const { error: updateErr } = await adminClient
          .from('whatsapp_messages')
          .update({ status: 'read', updated_at: new Date().toISOString() })
          .eq('organization_id', orgId)
          .eq('instance_id', instanceId)
          .eq('phone', cleanPhone)
          .eq('direction', 'inbound')
          .neq('status', 'read')

        if (updateErr) {
          console.error('Failed to mark messages as read locally:', updateErr)
        } else {
          responseMessages = messageList.map(msg =>
            unreadIds.has(msg.id) ? { ...msg, status: 'read' } : msg
          )
        }

        await tryMarkChatAsRead(instance.api_url, instance.api_token, cleanPhone, latestUnread.message_id_external)
      }

      return new Response(JSON.stringify(responseMessages), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('whatsapp-chats error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})