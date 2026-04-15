import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-funnel-token',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const funnelToken = req.headers.get('x-funnel-token')
    if (!funnelToken) {
      return new Response(JSON.stringify({ error: 'Missing X-Funnel-Token header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()

    // Aliases for capture page compatibility
    const phone = body.phone || body.whatsapp || body.telefone || null
    const email = body.email || null
    const name = body.name || body.nome || null
    const event = body.event || 'capture'
    const xcod = body.xcod || null
    const { utm_source, utm_medium, utm_campaign, utm_content, utm_term } = body
    const metadata = { ...(body.metadata || {}), ...(xcod ? { xcod } : {}) }

    if (!phone && !email) {
      return new Response(JSON.stringify({ error: 'Phone or email required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Find funnel by token
    const { data: funnel, error: funnelError } = await supabase
      .from('lead_funnels')
      .select('id, organization_id, is_active')
      .eq('webhook_token', funnelToken)
      .single()

    if (funnelError || !funnel) {
      return new Response(JSON.stringify({ error: 'Invalid funnel token' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!funnel.is_active) {
      return new Response(JSON.stringify({ error: 'Funnel is inactive' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Deduplicate / find-or-create lead
    let lead = null

    if (phone) {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', funnel.organization_id)
        .eq('phone', phone)
        .maybeSingle()
      lead = data
    }

    if (!lead && email) {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', funnel.organization_id)
        .ilike('email', email)
        .maybeSingle()
      lead = data
    }

    if (!lead) {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          organization_id: funnel.organization_id,
          phone: phone || null,
          email: email || null,
          name: name || null,
          utm_source: utm_source || null,
          utm_medium: utm_medium || null,
          utm_campaign: utm_campaign || null,
          utm_content: utm_content || null,
          utm_term: utm_term || null,
          metadata: metadata || {},
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating lead:', error)
        return new Response(JSON.stringify({ error: 'Failed to create lead' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      lead = data
    } else {
      // Update name/UTMs — COALESCE: só preenche se lead não tem
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (name && !lead.name) updates.name = name
      if (utm_source && !lead.utm_source) updates.utm_source = utm_source
      if (utm_medium && !lead.utm_medium) updates.utm_medium = utm_medium
      if (utm_campaign && !lead.utm_campaign) updates.utm_campaign = utm_campaign
      if (utm_content && !lead.utm_content) updates.utm_content = utm_content
      if (utm_term && !lead.utm_term) updates.utm_term = utm_term

      await supabase.from('leads').update(updates).eq('id', lead.id)
    }

    // 3. Log event
    await supabase.from('lead_events').insert({
      lead_id: lead.id,
      funnel_id: funnel.id,
      event_name: event,
      metadata: metadata || {},
    })

    // 4. Apply transition rules
    const { data: rules } = await supabase
      .from('stage_transition_rules')
      .select('*')
      .eq('funnel_id', funnel.id)
      .eq('event_name', event)

    if (rules && rules.length > 0) {
      // Get current position
      const { data: currentPos } = await supabase
        .from('lead_stage_positions')
        .select('*')
        .eq('lead_id', lead.id)
        .eq('funnel_id', funnel.id)
        .maybeSingle()

      for (const rule of rules) {
        const fromMatches = !rule.from_stage_id || (currentPos && currentPos.stage_id === rule.from_stage_id)
        if (fromMatches) {
          // Upsert position
          if (currentPos) {
            await supabase
              .from('lead_stage_positions')
              .update({ stage_id: rule.to_stage_id, entered_at: new Date().toISOString() })
              .eq('id', currentPos.id)
          } else {
            await supabase
              .from('lead_stage_positions')
              .insert({
                lead_id: lead.id,
                funnel_id: funnel.id,
                stage_id: rule.to_stage_id,
              })
          }
          break // Apply first matching rule
        }
      }
    } else if (!(await supabase.from('lead_stage_positions').select('id').eq('lead_id', lead.id).eq('funnel_id', funnel.id).maybeSingle()).data) {
      // No rules matched, place in first stage if not yet positioned
      const { data: firstStage } = await supabase
        .from('lead_funnel_stages')
        .select('id')
        .eq('funnel_id', funnel.id)
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (firstStage) {
        await supabase.from('lead_stage_positions').insert({
          lead_id: lead.id,
          funnel_id: funnel.id,
          stage_id: firstStage.id,
        })
      }
    }

    return new Response(
      JSON.stringify({ success: true, lead_id: lead.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
