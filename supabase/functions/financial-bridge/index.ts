import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleBridge } from './handler.ts';

Deno.serve((req: Request) => handleBridge(req, Deno.env.get('METRICS_FINANCE_BRIDGE_SECRET') || '', (name, args) => {
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  return client.rpc(name, args);
}));
