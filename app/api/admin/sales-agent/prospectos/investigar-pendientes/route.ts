import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../../lib/quotes/auth";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { investigateProspectById } from "../../../../../../lib/sales-agent/investigate-prospect";
import { checkRateLimit } from "../../../../../../lib/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cada prospecto puede tardar hasta 8s en investigarse (timeout de
// fetchProspectPage). Con tope de 55s dejamos margen bajo el limite por
// defecto de las funciones serverless de Vercel (60s en Hobby).
export const maxDuration = 55;

const BUDGET_MS = 48_000;
const MAX_PER_CALL = 12;

// POST { campaignId?, limit? }: investiga en lote los prospectos "nuevo" con
// web o Instagram cargados que todavia no se investigaron. Pensado para
// llamarse varias veces seguidas desde el panel (un lote por click, o el
// boton "Investigar todos" repitiendo la llamada) hasta que no queden
// pendientes -- nunca procesa de mas de lo que entra en el tiempo/limite.
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    if (!(await checkRateLimit(`sales-agent-investigar-lote:${verification.userId}`, 12, 300))) {
      return NextResponse.json({ error: "Demasiados lotes seguidos. Esperá unos minutos." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const campaignId = /^[0-9a-f-]{36}$/i.test(String(body.campaignId ?? "")) ? String(body.campaignId) : null;
    const limit = Math.max(1, Math.min(MAX_PER_CALL, Math.round(Number(body.limit) || 8)));

    const admin = createAdminClient();

    let query = admin
      .from("prospects")
      .select("id, name")
      .is("deleted_at", null)
      .is("investigated_at", null)
      .eq("status", "nuevo")
      .or("website.not.is.null,instagram_url.not.is.null")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (campaignId) query = query.eq("campaign_id", campaignId);

    const { data: candidates, error: candidatesError } = await query;
    if (candidatesError) {
      console.error("SALES AGENT INVESTIGAR PENDIENTES (candidatos):", candidatesError);
      return NextResponse.json({ error: "No se pudieron buscar prospectos pendientes." }, { status: 500 });
    }

    const results: { id: string; name: string; ok: boolean; error?: string }[] = [];
    const deadline = Date.now() + BUDGET_MS;

    for (const candidate of candidates ?? []) {
      if (Date.now() > deadline) break;
      try {
        const outcome = await investigateProspectById(admin, candidate.id as string, null, { requireClaim: true });
        results.push(outcome.ok ? { id: candidate.id as string, name: candidate.name as string, ok: true } : { id: candidate.id as string, name: candidate.name as string, ok: false, error: outcome.error });
      } catch (error) {
        results.push({ id: candidate.id as string, name: candidate.name as string, ok: false, error: error instanceof Error ? error.message : "Error inesperado." });
      }
    }

    let remainingQuery = admin
      .from("prospects")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .is("investigated_at", null)
      .eq("status", "nuevo")
      .or("website.not.is.null,instagram_url.not.is.null");
    if (campaignId) remainingQuery = remainingQuery.eq("campaign_id", campaignId);
    const { count: remaining } = await remainingQuery;

    return NextResponse.json({
      ok: true,
      processed: results.length,
      investigated: results.filter((r) => r.ok).length,
      errors: results.filter((r) => !r.ok),
      remaining: remaining ?? 0,
    });
  } catch (error) {
    console.error("SALES AGENT INVESTIGAR PENDIENTES:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
