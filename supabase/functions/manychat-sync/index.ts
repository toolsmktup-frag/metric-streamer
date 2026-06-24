// manychat-sync — sincroniza um contato no ManyChat (cria-OU-atualiza) e aplica uma
// tag, numa única chamada. Substitui o fluxo do n8n e resolve duas limitações da
// API do ManyChat:
//   1) não existe "upsert" — createSubscriber só cria e NÃO devolve o id do existente;
//   2) não dá pra buscar contato de WhatsApp pelo telefone — o número vive no `wa_id`,
//      e a busca olha o campo `phone` (que fica vazio sem permissão de import).
//
// Estratégia: um "custom field espelho" (wa_busca) guarda o número e é pesquisável
// via findByCustomField. Toda criação grava o espelho, então re-cadastros passam a
// ser localizáveis e a tag entra sem o erro de duplicado.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MC_BASE = "https://api.manychat.com";
// custom field "wa_busca" criado na conta (espelho do número de WhatsApp).
const WA_BUSCA_FIELD_ID = Number(Deno.env.get("MANYCHAT_WA_FIELD_ID") || "14698343");

function mcHeaders(token: string) {
  return {
    accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/** Normaliza para 55 + DDD + número (com 9 no celular). Retorna null se inválido. */
function normalizePhone(raw: string): string | null {
  let clean = (raw || "").replace(/\D/g, "");
  if (clean.length < 10) return null;
  if (clean.startsWith("55") && (clean.length === 12 || clean.length === 13)) return clean;
  if (clean.startsWith("0")) clean = clean.slice(1);
  const ddd = clean.slice(0, 2);
  let number = clean.slice(2);
  if (number.length === 8) number = "9" + number;
  return `55${ddd}${number}`;
}

/** Extrai um subscriber id de uma resposta findBy* (data pode ser objeto OU array). */
function extractId(json: any): string | null {
  const d = json?.data;
  if (!d) return null;
  if (Array.isArray(d)) return d.length ? (String(d[0]?.id ?? "") || null) : null;
  return d.id ? String(d.id) : null;
}

async function findByCustomField(token: string, phone: string): Promise<string | null> {
  const url =
    `${MC_BASE}/fb/subscriber/findByCustomField` +
    `?field_id=${WA_BUSCA_FIELD_ID}&field_value=${encodeURIComponent(phone)}`;
  const res = await fetch(url, { headers: mcHeaders(token) });
  if (!res.ok) return null;
  return extractId(await res.json().catch(() => ({})));
}

/** Fallback p/ contatos legados que tenham o campo `phone` do sistema preenchido. */
async function findBySystemPhone(token: string, phone: string): Promise<string | null> {
  for (const v of [phone, `+${phone}`]) {
    const url = `${MC_BASE}/fb/subscriber/findBySystemField?phone=${encodeURIComponent(v)}`;
    const res = await fetch(url, { headers: mcHeaders(token) });
    if (res.ok) {
      const id = extractId(await res.json().catch(() => ({})));
      if (id) return id;
    }
  }
  return null;
}

/**
 * Fallback decisivo p/ contatos de WhatsApp LEGADOS (existem mas sem `phone` nem
 * espelho `wa_busca`): busca por NOME — única chamada que devolve o `whatsapp_phone`
 * preenchido — e casa pelos últimos 8 dígitos do número. Resolve o 409
 * `legacy_unfindable` para quem tem nome cadastrado no ManyChat.
 */
async function findByName(token: string, name: string, phone: string): Promise<string | null> {
  const url = `${MC_BASE}/fb/subscriber/findByName?name=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: mcHeaders(token) });
  if (!res.ok) return null;
  const json = await res.json().catch(() => ({}));
  const list = Array.isArray(json?.data) ? json.data : [];
  const last8 = phone.slice(-8);
  for (const s of list) {
    const wp = String(s?.whatsapp_phone ?? "").replace(/\D/g, "");
    if (wp && wp.slice(-8) === last8 && s?.id) return String(s.id);
  }
  return null;
}

async function createSubscriber(token: string, phone: string, name?: string, email?: string) {
  const body: Record<string, unknown> = {
    whatsapp_phone: phone,
    phone,
    has_opt_in_sms: true,
    has_opt_in_email: !!email,
    consent_phrase: "Eu aceito receber mensagens do Matheus Colombo",
  };
  if (name) { body.first_name = name; body.name = name; }
  if (email) body.email = email;
  const res = await fetch(`${MC_BASE}/fb/subscriber/createSubscriber`, {
    method: "POST",
    headers: mcHeaders(token),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/**
 * Seta custom fields arbitrários antes de aplicar a tag (ex.: código de rastreio).
 * Aceita { field_id, value } ou { field_name, value }. Best-effort — não quebra o fluxo.
 */
async function setCustomFields(
  token: string,
  subscriberId: string,
  fields: Array<{ field_id?: number | string; field_name?: string; value?: unknown; field_value?: unknown }>,
) {
  const sid = Number(subscriberId);
  for (const f of fields) {
    if (!f) continue;
    const value = f.value ?? f.field_value;
    if (value === undefined || value === null || value === "") continue;
    if (f.field_id !== undefined && f.field_id !== null && f.field_id !== "") {
      await fetch(`${MC_BASE}/fb/subscriber/setCustomField`, {
        method: "POST",
        headers: mcHeaders(token),
        body: JSON.stringify({ subscriber_id: sid, field_id: Number(f.field_id), field_value: value }),
      }).catch(() => {});
    } else if (f.field_name) {
      await fetch(`${MC_BASE}/fb/subscriber/setCustomFieldByName`, {
        method: "POST",
        headers: mcHeaders(token),
        body: JSON.stringify({ subscriber_id: sid, field_name: f.field_name, field_value: value }),
      }).catch(() => {});
    }
  }
}

async function setWaBusca(token: string, subscriberId: string, phone: string) {
  await fetch(`${MC_BASE}/fb/subscriber/setCustomField`, {
    method: "POST",
    headers: mcHeaders(token),
    body: JSON.stringify({
      subscriber_id: Number(subscriberId),
      field_id: WA_BUSCA_FIELD_ID,
      field_value: phone,
    }),
  }).catch(() => {});
}

/** Aplica a tag por NOME (addTagByName, mais amigável) ou por ID (addTag). */
async function applyTag(
  token: string,
  subscriberId: string,
  tagId?: number,
  tagName?: string,
): Promise<boolean> {
  const sid = Number(subscriberId);
  if (tagName) {
    const res = await fetch(`${MC_BASE}/fb/subscriber/addTagByName`, {
      method: "POST",
      headers: mcHeaders(token),
      body: JSON.stringify({ subscriber_id: sid, tag_name: tagName }),
    });
    if (res.ok) return true;
  }
  if (tagId) {
    const res = await fetch(`${MC_BASE}/fb/subscriber/addTag`, {
      method: "POST",
      headers: mcHeaders(token),
      body: JSON.stringify({ subscriber_id: sid, tag_id: tagId }),
    });
    return res.ok;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // 🔒 Função interna: aceita o secret próprio (usado pelo motor de flows / nó nativo)
  // OU a service_role key. O secret próprio é o caminho determinístico — a service
  // role injetada no ambiente pode divergir da exposta pela API de gerenciamento.
  const syncSecret = Deno.env.get("MANYCHAT_SYNC_SECRET") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const authorized =
    (syncSecret && bearer === syncSecret) || (serviceKey && bearer === serviceKey);
  if (!authorized) {
    return reply({ ok: false, error: "Unauthorized" }, 401);
  }

  const token = Deno.env.get("MANYCHAT_API_TOKEN");
  if (!token) return reply({ ok: false, error: "MANYCHAT_API_TOKEN ausente" }, 500);

  let input: any;
  try { input = await req.json(); } catch { return reply({ ok: false, error: "JSON inválido" }, 400); }

  const phone = normalizePhone(String(input.phone ?? input.telefone ?? input.whatsapp ?? ""));
  const name = (input.name ?? input.nome ?? "").toString().trim() || undefined;
  const email = (input.email ?? "").toString().trim() || undefined;
  const rawTag = input.tag_id ?? input.tag;
  const tagId =
    rawTag !== undefined && rawTag !== null && rawTag !== "" ? Number(rawTag) : undefined;
  const tagName = (input.tag_name ?? "").toString().trim() || undefined;
  const fields = Array.isArray(input.fields) ? input.fields : [];
  if (!phone) return reply({ ok: false, error: "telefone inválido" }, 400);
  if (!tagId && !tagName) return reply({ ok: false, error: "tag_id ou tag_name obrigatório" }, 400);

  try {
    let subscriberId: string | null = null;
    let created = false;

    // 1) espelho wa_busca — caminho confiável p/ quem já passou pelo fluxo novo
    subscriberId = await findByCustomField(token, phone);
    // 2) fallback — campo `phone` do sistema (pega legados com phone preenchido)
    if (!subscriberId) subscriberId = await findBySystemPhone(token, phone);
    // 3) fallback — legados de WhatsApp: busca por nome e casa pelo whatsapp_phone
    if (!subscriberId && name) subscriberId = await findByName(token, name, phone);

    // 4) não achou em lugar nenhum → cria
    if (!subscriberId) {
      const c = await createSubscriber(token, phone, name, email);
      if (c.ok) {
        subscriberId = extractId(c.json);
        created = true;
      } else {
        const msg = JSON.stringify(c.json);
        // legado: já existe mas não é localizável (sem phone nem espelho)
        if (msg.includes("already exists")) {
          return reply({
            ok: false,
            reason: "legacy_unfindable",
            phone,
            detail:
              "Contato já existe no ManyChat mas não é localizável via API (sem phone nem wa_busca). Regulariza-se na 1ª interação dele.",
          }, 409);
        }
        return reply({ ok: false, reason: "create_failed", phone, detail: c.json }, 502);
      }
    }

    if (!subscriberId) return reply({ ok: false, reason: "no_subscriber_id", phone }, 502);

    // grava/atualiza o espelho (garante localização futura), seta campos
    // (ex.: código de rastreio) e por fim aplica a tag — nessa ordem para o
    // fluxo oficial já encontrar o campo preenchido quando a tag disparar.
    await setWaBusca(token, subscriberId, phone);
    if (fields.length) await setCustomFields(token, subscriberId, fields);
    const tagged = await applyTag(token, subscriberId, tagId, tagName);

    return reply({ ok: true, subscriber_id: subscriberId, created, tagged, phone });
  } catch (e) {
    return reply({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
