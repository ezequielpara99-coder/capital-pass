import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, isMissingTable } from "../../../../../lib/quotes/auth";
import { createAdminClient } from "../../../../../lib/supabase/admin";

const FIELDS = "id, name, city, province, categories, min_score, target_count, channel, message_style, status, notes, created_at";

export async function GET() {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();
    const { data, error } = await admin.from("prospect_campaigns").select(FIELDS).is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (Capital Sales Agent, 20260990)." }, { status: 503 });
      console.error("SALES AGENT CAMPAÑAS GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar las campañas." }, { status: 500 });
    }

    // Contadores por campaña (prospectos y calificados), en una sola pasada.
    const ids = (data ?? []).map((c) => c.id as string);
    const counts = new Map<string, { total: number; calificados: number }>();
    if (ids.length > 0) {
      const { data: rows } = await admin.from("prospects").select("campaign_id, score").in("campaign_id", ids).is("deleted_at", null);
      for (const row of rows ?? []) {
        const entry = counts.get(row.campaign_id as string) ?? { total: 0, calificados: 0 };
        entry.total++;
        if (Number(row.score) >= 61) entry.calificados++;
        counts.set(row.campaign_id as string, entry);
      }
    }

    return NextResponse.json({
      ok: true,
      campaigns: (data ?? []).map((c) => ({ ...c, prospects: counts.get(c.id as string)?.total ?? 0, qualified: counts.get(c.id as string)?.calificados ?? 0 })),
    });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const name = String(body.name ?? "").trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: "Ingresá un nombre para la campaña." }, { status: 400 });

    const categories = Array.isArray(body.categories) ? body.categories.map((c: unknown) => String(c).trim()).filter(Boolean).slice(0, 20) : [];
    const minScore = Math.max(0, Math.min(100, Math.round(Number(body.minScore ?? 0))));
    const channel = ["whatsapp", "instagram", "email"].includes(body.channel) ? body.channel : "whatsapp";
    const messageStyle = ["directo", "natural", "profesional"].includes(body.messageStyle) ? body.messageStyle : "natural";
    const targetCount = body.targetCount ? Math.max(1, Math.round(Number(body.targetCount))) : null;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("prospect_campaigns")
      .insert({
        name,
        city: String(body.city ?? "").trim().slice(0, 100) || null,
        province: String(body.province ?? "").trim().slice(0, 100) || null,
        categories,
        min_score: minScore,
        target_count: targetCount,
        channel,
        message_style: messageStyle,
        notes: String(body.notes ?? "").trim().slice(0, 500) || null,
        created_by: verification.userId,
      })
      .select(FIELDS)
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (Capital Sales Agent, 20260990)." }, { status: 503 });
      console.error("SALES AGENT CAMPAÑAS POST:", error);
      return NextResponse.json({ error: "No se pudo crear la campaña." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, campaign: { ...data, prospects: 0, qualified: 0 } });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH { id, status }: activa/pausa/cierra una campaña.
export async function PATCH(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["activa", "pausada", "cerrada"].includes(status)) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.from("prospect_campaigns").update({ status, updated_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select(FIELDS).maybeSingle();
    if (error) {
      console.error("SALES AGENT CAMPAÑAS PATCH:", error);
      return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró la campaña." }, { status: 404 });
    return NextResponse.json({ ok: true, campaign: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
