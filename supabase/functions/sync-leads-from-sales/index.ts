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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Create a log entry to track this sync job
    const { data: logEntry, error: logError } = await supabase
      .from("meta_sync_log")
      .insert({ status: "processing", records_synced: 0 })
      .select("id")
      .single();

    if (logError || !logEntry) {
      return new Response(
        JSON.stringify({ error: "Could not create sync log", detail: logError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call the stored procedure in background — single RPC call, no timeout risk
    EdgeRuntime.waitUntil(
      supabase
        .rpc("sync_leads_from_sales", { p_log_id: logEntry.id })
        .then(({ error }) => {
          if (error) {
            console.error(`RPC failed for job ${logEntry.id}:`, error.message);
            // The stored procedure handles its own error logging,
            // but if the RPC itself fails, update the log
            supabase
              .from("meta_sync_log")
              .update({ status: "failed", finished_at: new Date().toISOString(), error: error.message })
              .eq("id", logEntry.id)
              .then(() => {});
          } else {
            console.log(`Sync completed for job ${logEntry.id}`);
          }
        })
        .catch((err) => {
          console.error(`Unexpected error for job ${logEntry.id}:`, err);
          supabase
            .from("meta_sync_log")
            .update({ status: "failed", finished_at: new Date().toISOString(), error: String(err) })
            .eq("id", logEntry.id)
            .then(() => {});
        })
    );

    // Return immediately with job ID
    return new Response(
      JSON.stringify({ success: true, job_id: logEntry.id, message: "Sync started in background." }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Sync init error:", err);
    return new Response(
      JSON.stringify({ error: "Sync failed to start", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
