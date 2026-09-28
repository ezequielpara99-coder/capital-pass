import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../../../lib/quotes/auth";
import { createAdminClient } from "../../../../../../../lib/supabase/admin";
import { buildMessageVariants } from "../../../../../../../lib/sales-agent/messages";

const UUID = /^[0-9a-f-]{36}$/i;

// POST: genera los 3 estilos de mensaje (no los guarda todavia -- eso pasa
// al aprobar uno, ver PATCH). Solo con datos reales del prospecto.
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Prospecto inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { data: prospect } = await admin.from("prospects").select("name, city, category").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!prospect) return NextResponse.json({ error: "No se encontró el prospecto." }, { status: 404 });

    const { data: opportunities } = await admin.from("prospect_opportunities").select("description, priority").eq("prospect_id", id).order("priority", { ascending: false }).limit(1);
    const opportunity = opportunities?.[0]?.description ?? null;

    const variants = buildMessageVariants({ name: prospect.name, city: prospect.city, category: prospect.category, opportunity });
    return NextResponse.json({ ok: true, variants });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: guarda un mensaje con un estado puntual { message, style, channel, status }.
// status "borrador" = generado y editable; "aprobado" = lo confirmaste para enviar a mano;
// "enviado" = lo mandaste vos desde la app correspondiente (WhatsApp/Instagram/email);
// "descartado" = no se usa.
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Prospecto inválido." }, { status: 400 });

    const body = await request.json();
    const message = String(body.message ?? "").trim().slice(0, 2000);
    const style = ["directo", "natural", "profesional"].includes(body.style) ? body.style : null;
    const channel = ["whatsapp", "instagram", "email", "otro"].includes(body.channel) ? body.channel : "whatsapp";
    const status = ["borrador", "aprobado", "enviado", "descartado"].includes(body.status) ? body.status : "borrador";
    if (!message || !style) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

    const admin = createAdminClient();
    const { data: prospect } = await admin.from("prospects").select("id, campaign_id, status").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!prospect) return NextResponse.json({ error: "No se encontró el prospecto." }, { status: 404 });

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("prospect_messages")
      .insert({
        prospect_id: id, campaign_id: prospect.campaign_id, channel, style, message, status,
        created_by: verification.userId,
        approved_at: status === "aprobado" || status === "enviado" ? now : null,
        sent_at: status === "enviado" ? now : null,
      })
      .select("id, channel, style, message, status, created_at, approved_at, sent_at")
      .single();

    if (error) {
      console.error("SALES AGENT MENSAJE:", error);
      return NextResponse.json({ error: "No se pudo guardar el mensaje." }, { status: 500 });
    }

    // "Enviado" mueve el pipeline a contactado (si no estaba mas adelante ya) y
    // programa el primer seguimiento a 3 dias, como pide el punto 15 de la spec.
    if (status === "enviado") {
      if (["nuevo", "investigando", "calificado", "listo_para_contactar"].includes(prospect.status)) {
        await admin.from("prospects").update({ status: "contactado", last_contacted_at: now, updated_at: now }).eq("id", id);
      } else {
        await admin.from("prospects").update({ last_contacted_at: now, updated_at: now }).eq("id", id);
      }
      const followupAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      await admin.from("prospect_followups").insert({ prospect_id: id, message_id: data.id, scheduled_at: followupAt });
      await admin.from("prospects").update({ next_followup_at: followupAt }).eq("id", id).is("next_followup_at", null);
    }

    return NextResponse.json({ ok: true, message: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
