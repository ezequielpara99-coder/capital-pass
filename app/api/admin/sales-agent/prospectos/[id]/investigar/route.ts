import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../../../lib/quotes/auth";
import { createAdminClient } from "../../../../../../../lib/supabase/admin";
import { fetchProspectPage } from "../../../../../../../lib/sales-agent/investigate";
import { detectTicketingProvider, detectExternalTools } from "../../../../../../../lib/sales-agent/ticketing";
import { detectOpportunities } from "../../../../../../../lib/sales-agent/opportunities";
import { normalizeWebsiteDomain } from "../../../../../../../lib/sales-agent/duplicates";
import { PROSPECT_FIELDS, rescoreProspect } from "../../../../../../../lib/sales-agent/prospect";
import { checkRateLimit } from "../../../../../../../lib/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

// POST { url? }: trae la pagina publica indicada (o la web/instagram ya
// cargados del prospecto), detecta el sistema de venta, herramientas
// externas y oportunidades, y recalcula el puntaje. Un solo fetch puntual,
// no repetido -- el admin decide cuando volver a investigar.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    if (!(await checkRateLimit(`sales-agent-investigar:${verification.userId}`, 20, 60))) {
      return NextResponse.json({ error: "Demasiados intentos. Esperá un minuto." }, { status: 429 });
    }

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Prospecto inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { data: prospect } = await admin.from("prospects").select("id, website, instagram_url").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!prospect) return NextResponse.json({ error: "No se encontró el prospecto." }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const targetUrl = String(body.url ?? "").trim() || prospect.website || prospect.instagram_url;
    if (!targetUrl) return NextResponse.json({ error: "Cargá una web o un Instagram para poder investigar." }, { status: 400 });

    await admin.from("prospects").update({ status: "investigando", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "nuevo");

    const page = await fetchProspectPage(targetUrl);
    if (!page.ok) {
      return NextResponse.json({ error: page.error }, { status: 502 });
    }

    const ownDomain = normalizeWebsiteDomain(targetUrl);
    const ticketing = detectTicketingProvider(page.html, ownDomain);
    const externalTools = detectExternalTools(page.html);
    const hasRrppMention = /\bRRPP\b/i.test(page.text);
    const hasUpcomingEvent = /(pr[oó]xim[ao] (fecha|evento)|entradas ya disponibles|reserv[aá] tu lugar)/i.test(page.text);
    const sellsOnline = ["passline", "eventbrite", "ticketek", "entradaweb", "mercadopago", "sistema_propio", "formulario", "whatsapp"].includes(ticketing.provider);

    const opportunities = detectOpportunities({
      sellsOnline,
      ticketingProvider: ticketing.provider,
      hasRrppMention,
      eventsPerMonth: null, // se carga a mano si se sabe; investigar solo mira UNA pagina, no un historico
      hasUpcomingEvent,
    });

    await admin
      .from("prospects")
      .update({
        ticketing_provider: ticketing.provider,
        ticketing_url: ticketing.url,
        ticketing_confidence: ticketing.confidence,
        status: "calificado",
        investigated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    await admin.from("prospect_opportunities").delete().eq("prospect_id", id);
    if (opportunities.length > 0) {
      await admin.from("prospect_opportunities").insert(opportunities.map((o) => ({ prospect_id: id, type: o.type, description: o.description, priority: o.priority })));
    }

    const result = await rescoreProspect(admin, id, { hasRrppMention, hasUpcomingEvent, sellsOnline, externalToolsCount: externalTools.length });

    // Si con lo investigado ya quedo con buen puntaje, pasa a "listo para
    // contactar" -- el admin igual decide cuando de verdad contactar.
    if (result.score >= 61) {
      await admin.from("prospects").update({ status: "listo_para_contactar" }).eq("id", id).eq("status", "calificado");
    }

    const { data: refreshed } = await admin.from("prospects").select(PROSPECT_FIELDS).eq("id", id).maybeSingle();
    return NextResponse.json({ ok: true, prospect: refreshed, opportunities, externalTools, investigatedUrl: page.finalUrl });
  } catch (error) {
    console.error("SALES AGENT INVESTIGAR:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
