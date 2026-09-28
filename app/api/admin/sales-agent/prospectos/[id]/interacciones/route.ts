import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../../../lib/quotes/auth";
import { createAdminClient } from "../../../../../../../lib/supabase/admin";

const UUID = /^[0-9a-f-]{36}$/i;

// POST { type, content, channel? }: registra una nota o una respuesta que
// llego por fuera del sistema (el admin la pega a mano). type "respuesta"
// tambien mueve el estado a "respondio" si el prospecto todavia no llego mas lejos.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Prospecto inválido." }, { status: 400 });

    const body = await request.json();
    const type = ["nota", "respuesta", "llamada", "reunion", "otro"].includes(body.type) ? body.type : "nota";
    const content = String(body.content ?? "").trim().slice(0, 4000);
    if (!content) return NextResponse.json({ error: "Escribí algo antes de guardar." }, { status: 400 });

    const admin = createAdminClient();
    const { data: prospect } = await admin.from("prospects").select("id, status").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!prospect) return NextResponse.json({ error: "No se encontró el prospecto." }, { status: 404 });

    const { data, error } = await admin
      .from("prospect_interactions")
      .insert({ prospect_id: id, channel: String(body.channel ?? "").trim().slice(0, 40) || null, type, content, created_by: verification.userId })
      .select("id, channel, type, content, created_at")
      .single();
    if (error) {
      console.error("SALES AGENT INTERACCION:", error);
      return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
    }

    if (type === "respuesta" && ["contactado"].includes(prospect.status)) {
      await admin.from("prospects").update({ status: "respondio", updated_at: new Date().toISOString() }).eq("id", id);
    }

    return NextResponse.json({ ok: true, interaction: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
