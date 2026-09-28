import "server-only";
import type { createAdminClient } from "../supabase/admin";
import { fetchProspectPage } from "./investigate";
import { detectTicketingProvider, detectExternalTools } from "./ticketing";
import { detectOpportunities } from "./opportunities";
import { normalizeWebsiteDomain } from "./duplicates";
import { PROSPECT_FIELDS, rescoreProspect } from "./prospect";

type Admin = ReturnType<typeof createAdminClient>;

export type InvestigateOutcome =
  | { ok: true; prospectId: string; score: number; investigatedUrl: string }
  | { ok: false; prospectId: string; error: string };

// La logica completa de "Investigar" un prospecto: trae su pagina publica,
// detecta sistema de venta + herramientas + oportunidades, y recalcula el
// puntaje. La usan tanto la ruta de un solo prospecto (boton "Investigar")
// como la de investigar varios pendientes de una ("automatico" dentro de lo
// permitido: un solo fetch puntual por prospecto, nunca repetido sin que
// alguien lo pida).
export async function investigateProspectById(admin: Admin, prospectId: string, urlOverride?: string | null): Promise<InvestigateOutcome> {
  const { data: prospect } = await admin.from("prospects").select("id, website, instagram_url").eq("id", prospectId).is("deleted_at", null).maybeSingle();
  if (!prospect) return { ok: false, prospectId, error: "No se encontró el prospecto." };

  const targetUrl = urlOverride?.trim() || prospect.website || prospect.instagram_url;
  if (!targetUrl) return { ok: false, prospectId, error: "No tiene web ni Instagram cargados." };

  await admin.from("prospects").update({ status: "investigando", updated_at: new Date().toISOString() }).eq("id", prospectId).eq("status", "nuevo");

  const page = await fetchProspectPage(targetUrl);
  if (!page.ok) return { ok: false, prospectId, error: page.error };

  const ownDomain = normalizeWebsiteDomain(targetUrl);
  const ticketing = detectTicketingProvider(page.html, ownDomain);
  const externalTools = detectExternalTools(page.html);
  const hasRrppMention = /\bRRPP\b/i.test(page.text);
  const hasUpcomingEvent = /(pr[oó]xim[ao] (fecha|evento)|entradas ya disponibles|reserv[aá] tu lugar)/i.test(page.text);
  const sellsOnline = ["passline", "eventbrite", "ticketek", "entradaweb", "mercadopago", "sistema_propio", "formulario", "whatsapp"].includes(ticketing.provider);

  const opportunities = detectOpportunities({ sellsOnline, ticketingProvider: ticketing.provider, hasRrppMention, eventsPerMonth: null, hasUpcomingEvent });

  await admin
    .from("prospects")
    .update({ ticketing_provider: ticketing.provider, ticketing_url: ticketing.url, ticketing_confidence: ticketing.confidence, status: "calificado", investigated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", prospectId);

  await admin.from("prospect_opportunities").delete().eq("prospect_id", prospectId);
  if (opportunities.length > 0) {
    await admin.from("prospect_opportunities").insert(opportunities.map((o) => ({ prospect_id: prospectId, type: o.type, description: o.description, priority: o.priority })));
  }

  const result = await rescoreProspect(admin, prospectId, { hasRrppMention, hasUpcomingEvent, sellsOnline, externalToolsCount: externalTools.length });
  if (result.score >= 61) {
    await admin.from("prospects").update({ status: "listo_para_contactar" }).eq("id", prospectId).eq("status", "calificado");
  }

  return { ok: true, prospectId, score: result.score, investigatedUrl: page.finalUrl };
}

export { PROSPECT_FIELDS };
