import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, json } from "../_shared/cors.ts";

function normalizeStatus(status: string) {
  if (status === "approved" || status === "accredited") return "approved";
  if (status === "rejected" || status === "cancelled" || status === "refunded" || status === "charged_back") return "rejected";
  return "pending";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!accessToken || !supabaseUrl || !serviceKey) return json({ error: "Missing backend environment variables" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const paymentId = body?.data?.id || body?.id;
  if (!paymentId) return json({ ok: true });

  const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });
  const payment = await paymentRes.json();
  if (!paymentRes.ok) return json({ error: "Could not fetch payment", detail: payment }, { status: 502 });

  const externalReference = payment.external_reference;
  if (!externalReference) return json({ ok: true });

  const status = normalizeStatus(payment.status);
  const supabase = createClient(supabaseUrl, serviceKey);
  const { error } = await supabase.from("mp_sales").upsert({
    external_reference: externalReference,
    amount: Number(payment.transaction_amount || 0),
    status,
    payment_id: String(payment.id),
    approved_at: status === "approved" ? new Date().toISOString() : null,
    raw_payment: payment,
    updated_at: new Date().toISOString(),
  }, { onConflict: "external_reference" });
  if (error) return json({ error: error.message }, { status: 500 });

  return json({ ok: true });
});
