// manychat-tags — lista as tags da conta ManyChat para popular o dropdown do nó
// "ManyChat" no editor de flows. Chamada pelo front (usuário logado), por isso
// só exige um Authorization header (anon key ou JWT da sessão).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return reply({ ok: false, error: "Unauthorized" }, 401);

  const token = Deno.env.get("MANYCHAT_API_TOKEN");
  if (!token) return reply({ ok: false, error: "MANYCHAT_API_TOKEN ausente" }, 500);

  try {
    const res = await fetch("https://api.manychat.com/fb/page/getTags", {
      headers: { accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    const tags = Array.isArray(json?.data)
      ? json.data.map((t: any) => ({ id: t.id, name: t.name }))
      : [];
    return reply({ ok: true, tags });
  } catch (e) {
    return reply({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
