import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../../lib/quotes/auth";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { PROSPECT_FIELDS, isMissingTable, findDuplicate, normalizedColumns, rescoreProspect, STATUSES } from "../../../../../../lib/sales-agent/prospect";

const UUID = /^[0-9a-f-]{36}$/i;
const MISSING = "Falta aplicar la actualización de la base de datos (Capital Sales Agent, 20260990).";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Prospecto inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { data: prospect, error } = await admin.from("prospects").select(PROSPECT_FIELDS).eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      console.error("SALES AGENT PROSPECTO GET:", error);
      return NextResponse.json({ error: "No se pudo cargar el prospecto." }, { status: 500 });
    }
    if (!prospect) return NextResponse.json({ error: "No se encontró el prospecto." }, { status: 404 });

    const [events, opportunities, messages, followups, interactions] = await Promise.all([
      admin.from("prospect_events").select("id, name, event_date, url, source, kind").eq("prospect_id", id).order("event_date", { ascending: false }).limit(20),
      admin.from("prospect_opportunities").select("id, type, description, priority").eq("prospect_id", id).order("created_at", { ascending: false }),
      admin.from("prospect_messages").select("id, channel, style, message, status, created_at, approved_at, sent_at").eq("prospect_id", id).order("created_at", { ascending: false }).limit(20),
      admin.from("prospect_followups").select("id, scheduled_at, status, notes").eq("prospect_id", id).order("scheduled_at", { ascending: true }),
      admin.from("prospect_interactions").select("id, channel, type, content, created_at").eq("prospect_id", id).order("created_at", { ascending: false }).limit(50),
    ]);

    return NextResponse.json({
      ok: true,
      prospect,
      events: events.data ?? [],
      opportunities: opportunities.data ?? [],
      messages: messages.data ?? [],
      followups: followups.data ?? [],
      interactions: interactions.data ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: edita campos y/o cambia el estado del pipeline.
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Prospecto inválido." }, { status: 400 });

    const body = await request.json();
    const admin = createAdminClient();

    const { data: current } = await admin.from("prospects").select("instagram_username, website, email, phone, whatsapp").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!current) return NextResponse.json({ error: "No se encontró el prospecto." }, { status: 404 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const txt = (v: unknown, max: number) => (v ? String(v).trim().slice(0, max) || null : null);
    const num = (v: unknown) => {
      if (v === undefined || v === null || v === "") return null;
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 150);
      if (!name) return NextResponse.json({ error: "El nombre no puede quedar vacío." }, { status: 400 });
      updates.name = name;
    }
    for (const [key, col, max] of [["instagramUsername", "instagram_username", 100], ["instagramUrl", "instagram_url", 300], ["website", "website", 300], ["city", "city", 100], ["province", "province", 100], ["category", "category", 40], ["email", "email", 200], ["phone", "phone", 40], ["whatsapp", "whatsapp", 40], ["notes", "notes", 2000]] as const) {
      if (body[key] !== undefined) updates[col] = txt(body[key], max);
    }
    if (body.followers !== undefined) updates.followers = num(body.followers);
    if (body.eventsPerMonth !== undefined) updates.events_per_month = num(body.eventsPerMonth);
    if (body.responsibleUserId !== undefined) updates.responsible_user_id = UUID.test(String(body.responsibleUserId ?? "")) ? body.responsibleUserId : null;
    if (body.campaignId !== undefined) updates.campaign_id = UUID.test(String(body.campaignId ?? "")) ? body.campaignId : null;
    if (body.nextFollowupAt !== undefined) updates.next_followup_at = body.nextFollowupAt || null;

    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
      updates.status = body.status;
      if (body.status === "contactado") updates.last_contacted_at = new Date().toISOString();
    }

    // Si cambia algun dato de contacto, chequear duplicados de nuevo (contra
    // OTRO prospecto, no contra si mismo).
    const contactChanged = ["instagramUsername", "website", "email", "phone", "whatsapp"].some((k) => body[k] !== undefined);
    if (contactChanged) {
      const merged = {
        name: "",
        instagramUsername: (updates.instagram_username as string | null) ?? current.instagram_username,
        website: (updates.website as string | null) ?? current.website,
        email: (updates.email as string | null) ?? current.email,
        phone: (updates.phone as string | null) ?? current.phone,
        whatsapp: (updates.whatsapp as string | null) ?? current.whatsapp,
      };
      const duplicate = await findDuplicate(admin, merged);
      if (duplicate && duplicate.id !== id) {
        return NextResponse.json({ error: `Ya existe "${duplicate.name}" con ${duplicate.reason}.`, duplicateId: duplicate.id }, { status: 409 });
      }
      Object.assign(updates, normalizedColumns(merged));
    }

    const { data, error } = await admin.from("prospects").update(updates).eq("id", id).is("deleted_at", null).select(PROSPECT_FIELDS).maybeSingle();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Esos datos de contacto ya los tiene otro prospecto." }, { status: 409 });
      console.error("SALES AGENT PROSPECTO PATCH:", error);
      return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el prospecto." }, { status: 404 });

    // Los datos que afectan el puntaje (eventos, seguidores, contacto) recien
    // se recalculan si cambiaron, para no pisar un puntaje ya investigado sin motivo.
    const scoreAffected = ["followers", "eventsPerMonth", "email", "phone", "whatsapp", "website", "instagramUsername"].some((k) => body[k] !== undefined);
    if (scoreAffected) await rescoreProspect(admin, id);

    const { data: refreshed } = await admin.from("prospects").select(PROSPECT_FIELDS).eq("id", id).maybeSingle();
    return NextResponse.json({ ok: true, prospect: refreshed ?? data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: soft-delete, recuperable desde /admin/papelera.
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Prospecto inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin.from("prospects").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id").maybeSingle();
    if (error) {
      console.error("SALES AGENT PROSPECTO DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el prospecto." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
