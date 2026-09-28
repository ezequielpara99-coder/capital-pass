import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../../../lib/quotes/auth";
import { createAdminClient } from "../../../../../../../lib/supabase/admin";

const UUID = /^[0-9a-f-]{36}$/i;

// POST { scheduledAt, notes? }: programa un seguimiento manual.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Prospecto inválido." }, { status: 400 });

    const body = await request.json();
    const scheduledAt = new Date(String(body.scheduledAt ?? ""));
    if (Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });

    const admin = createAdminClient();
    const { data: prospect } = await admin.from("prospects").select("id, status").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!prospect) return NextResponse.json({ error: "No se encontró el prospecto." }, { status: 404 });
    if (prospect.status === "no_contactar" || prospect.status === "no_interesado") {
      return NextResponse.json({ error: "Este prospecto está marcado como no contactar." }, { status: 409 });
    }

    const { data, error } = await admin
      .from("prospect_followups")
      .insert({ prospect_id: id, scheduled_at: scheduledAt.toISOString(), notes: String(body.notes ?? "").trim().slice(0, 500) || null })
      .select("id, scheduled_at, status, notes")
      .single();
    if (error) {
      console.error("SALES AGENT SEGUIMIENTO POST:", error);
      return NextResponse.json({ error: "No se pudo programar." }, { status: 500 });
    }

    await admin.from("prospects").update({ next_followup_at: scheduledAt.toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true, followup: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH { followupId, status }: marca un seguimiento hecho u omitido.
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Prospecto inválido." }, { status: 400 });

    const body = await request.json();
    const followupId = String(body.followupId ?? "");
    const status = String(body.status ?? "");
    if (!UUID.test(followupId) || !["hecho", "omitido"].includes(status)) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin.from("prospect_followups").update({ status }).eq("id", followupId).eq("prospect_id", id).select("id, scheduled_at, status, notes").maybeSingle();
    if (error) {
      console.error("SALES AGENT SEGUIMIENTO PATCH:", error);
      return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el seguimiento." }, { status: 404 });

    // Recalcula el proximo seguimiento pendiente del prospecto.
    const { data: next } = await admin.from("prospect_followups").select("scheduled_at").eq("prospect_id", id).eq("status", "pendiente").order("scheduled_at", { ascending: true }).limit(1).maybeSingle();
    await admin.from("prospects").update({ next_followup_at: next?.scheduled_at ?? null, updated_at: new Date().toISOString() }).eq("id", id);

    return NextResponse.json({ ok: true, followup: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
