import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, json } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Missing backend environment variables" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const refs = Array.isArray(body.externalReferences) ? body.externalReferences.map(String).filter(Boolean) : [];
  if (!refs.length) return json({ sales: [] });

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase
    .from("mp_sales")
    .select("external_reference,status,payment_id,approved_at,updated_at")
    .in("external_reference", refs);
  if (error) return json({ error: error.message }, { status: 500 });

  return json({ sales: data || [] });
});
