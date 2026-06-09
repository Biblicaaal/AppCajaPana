import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, json } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!accessToken || !supabaseUrl || !serviceKey) {
    return json({ error: "Missing backend environment variables" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const externalReference = String(body.externalReference || "");
  const amount = Number(body.amount || 0);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!externalReference || amount <= 0 || !items.length) {
    return json({ error: "externalReference, amount and items are required" }, { status: 400 });
  }

  const notificationUrl = Deno.env.get("MP_WEBHOOK_URL") || `${supabaseUrl}/functions/v1/mp-webhook`;
  const preferencePayload = {
    external_reference: externalReference,
    notification_url: notificationUrl,
    items: items.map((item: any) => ({
      title: String(item.title || "Producto"),
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.unit_price || 0),
      currency_id: "ARS",
    })),
    metadata: {
      business_date: body.businessDate || "",
      shift_type: body.shiftType || "",
    },
  };

  const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify(preferencePayload),
  });
  const preference = await mpRes.json();
  if (!mpRes.ok) return json({ error: "Mercado Pago preference failed", detail: preference }, { status: 502 });

  const supabase = createClient(supabaseUrl, serviceKey);
  const { error } = await supabase.from("mp_sales").upsert({
    external_reference: externalReference,
    amount,
    status: "pending",
    preference_id: preference.id,
    items,
    business_date: body.businessDate || "",
    shift_type: body.shiftType || "",
    updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: error.message }, { status: 500 });

  return json({
    preferenceId: preference.id,
    initPoint: preference.init_point,
    sandboxInitPoint: preference.sandbox_init_point,
    externalReference,
  });
});
