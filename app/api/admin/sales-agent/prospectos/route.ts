import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../lib/quotes/auth";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { PROSPECT_FIELDS, isMissingTable, findDuplicate, normalizedColumns, rescoreProspect, type ProspectInput } from "../../../../../lib/sales-agent/prospect";
import { investigateProspectById } from "../../../../../lib/sales-agent/investigate-prospect";

const MISSING = "Falta aplicar la actualización de la base de datos (Capital Sales Agent, 20260990).";

// GET: lista con filtros. ?city=&province=&category=&status=&potential=&campaignId=&q=&minScore=
export async function GET(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const params = request.nextUrl.searchParams;
    const admin = createAdminClient();
    let query = admin.from("prospects").select(PROSPECT_FIELDS).is("deleted_at", null).order("score", { ascending: false }).order("created_at", { ascending: false }).limit(500);

    const city = params.get("city");
    if (city) query = query.ilike("city", `%${city}%`);
    const province = params.get("province");
    if (province) query = query.ilike("province", `%${province}%`);
    const category = params.get("category");
    if (category) query = query.eq("category", category);
    const status = params.get("status");
    if (status) query = query.eq("status", status);
    const potential = params.get("potential");
    if (potential) query = query.eq("potential", potential);
    const campaignId = params.get("campaignId");
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const minScore = params.get("minScore");
    if (minScore) query = query.gte("score", Math.max(0, Math.min(100, Number(minScore))));
    const ticketing = params.get("ticketingProvider");
    if (ticketing) query = query.eq("ticketing_provider", ticketing);
    const q = params.get("q");
    if (q) {
      const like = `%${q.replace(/[,()%]/g, " ").trim()}%`;
      query = query.or(`name.ilike.${like},instagram_username.ilike.${like}`);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      console.error("SALES AGENT PROSPECTOS GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar los prospectos." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, prospects: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

function parseInput(body: Record<string, unknown>): { input: ProspectInput; error: string | null } {
  const name = String(body.name ?? "").trim().slice(0, 150);
  if (!name) return { input: {} as ProspectInput, error: "Ingresá el nombre del prospecto." };
  const num = (v: unknown) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const txt = (v: unknown, max: number) => (v ? String(v).trim().slice(0, max) || null : null);
  return {
    error: null,
    input: {
      name,
      instagramUsername: txt(body.instagramUsername, 100),
      instagramUrl: txt(body.instagramUrl, 300),
      website: txt(body.website, 300),
      city: txt(body.city, 100),
      province: txt(body.province, 100),
      category: txt(body.category, 40),
      followers: num(body.followers),
      eventsPerMonth: num(body.eventsPerMonth),
      email: txt(body.email, 200),
      phone: txt(body.phone, 40),
      whatsapp: txt(body.whatsapp, 40),
      notes: txt(body.notes, 2000),
      campaignId: /^[0-9a-f-]{36}$/i.test(String(body.campaignId ?? "")) ? String(body.campaignId) : null,
    },
  };
}

// POST: crea un prospecto a mano. Rechaza duplicados (instagram/web/telefono/email).
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const { input, error: validationError } = parseInput(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const admin = createAdminClient();
    const duplicate = await findDuplicate(admin, input);
    if (duplicate) {
      return NextResponse.json({ error: `Ya existe "${duplicate.name}" con ${duplicate.reason}.`, duplicateId: duplicate.id }, { status: 409 });
    }

    const { data, error } = await admin
      .from("prospects")
      .insert({
        campaign_id: input.campaignId,
        name: input.name,
        instagram_username: input.instagramUsername,
        instagram_url: input.instagramUrl,
        website: input.website,
        city: input.city,
        province: input.province,
        category: input.category,
        followers: input.followers,
        events_per_month: input.eventsPerMonth,
        email: input.email,
        phone: input.phone,
        whatsapp: input.whatsapp,
        notes: input.notes,
        source: "manual",
        created_by: verification.userId,
        ...normalizedColumns(input),
      })
      .select(PROSPECT_FIELDS)
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      if (error.code === "23505") return NextResponse.json({ error: "Ya existe un prospecto con esos mismos datos de contacto." }, { status: 409 });
      console.error("SALES AGENT PROSPECTOS POST:", error);
      return NextResponse.json({ error: "No se pudo guardar el prospecto." }, { status: 500 });
    }

    const result = await rescoreProspect(admin, data.id as string);
    let prospect: Record<string, unknown> = { ...data, score: result.score, potential: result.potential, score_reasons: result.reasons, score_missing: result.missing };

    // Si trae web o Instagram, lo investigamos ya mismo (un solo fetch
    // puntual): asi el admin no tiene que apretar "Investigar" a mano para
    // cada prospecto que carga. Si falla (sitio caido, timeout, etc.) no
    // rompe la creacion -- queda "nuevo" y se puede investigar despues.
    if (input.website || input.instagramUrl) {
      try {
        const outcome = await investigateProspectById(admin, data.id as string);
        if (outcome.ok) {
          const { data: fresh } = await admin.from("prospects").select(PROSPECT_FIELDS).eq("id", data.id as string).maybeSingle();
          if (fresh) prospect = fresh;
        }
      } catch (investigateError) {
        console.error("SALES AGENT AUTO-INVESTIGAR:", investigateError);
      }
    }

    return NextResponse.json({ ok: true, prospect });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
