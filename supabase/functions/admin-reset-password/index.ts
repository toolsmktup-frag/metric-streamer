import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate caller identity
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await anonClient.auth.getUser();
    if (claimsError || !claimsData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.user.id;

    // Admin client for privileged operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check caller is admin
    const { data: callerProfile } = await adminClient
      .from("user_profiles")
      .select("role")
      .eq("id", callerId)
      .maybeSingle();

    if (callerProfile?.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem usar esta função" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get target user_id from body
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get target user's email
    const { data: targetUser, error: targetError } = await adminClient.auth.admin.getUserById(user_id);
    if (targetError || !targetUser?.user?.email) {
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate recovery link
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: targetUser.user.email,
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("generateLink error:", linkError);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar link de recuperação" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Adjust redirect to /reset-password
    let url = linkData.properties.action_link;
    try {
      const parsed = new URL(url);
      const redirectTo = parsed.searchParams.get("redirect_to");
      if (redirectTo) {
        const redirectUrl = new URL(redirectTo);
        redirectUrl.pathname = "/reset-password";
        parsed.searchParams.set("redirect_to", redirectUrl.toString());
        url = parsed.toString();
      }
    } catch {
      // keep original url if parsing fails
    }

    return new Response(
      JSON.stringify({ url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("admin-reset-password error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
