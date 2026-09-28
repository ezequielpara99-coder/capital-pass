import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../../../lib/quotes/auth";
import { createAdminClient } from "../../../../../../../lib/supabase/admin";

const UUID = /^[0-9a-f-]{36}$/i;

// POST { organizationId?, planLabel?, monthlyValue? }: marca el prospecto
// como cliente. Vincular con una organizacion real de Capital Pass es
// opcional (el admin puede crearla aparte, como ya hace hoy, y despues
// volver a vincularla editando este registro).
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Prospecto inválido." }, { status: 400 });

    const body = await request.json();
    const admin = createAdminClient();
    const { data: prospect } = await admin.from("prospects").select("id, campaign_id, status").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!prospect) return NextResponse.json({ error: "No se encontró el prospecto." }, { status: 404 });
    if (prospect.status === "cliente") {
      return NextResponse.json({ error: "Este prospecto ya está convertido en cliente." }, { status: 409 });
    }

    const organizationId = UUID.test(String(body.organizationId ?? "")) ? body.organizationId : null;
    const monthlyValue = body.monthlyValue !== undefined && body.monthlyValue !== "" ? Math.round(Number(body.monthlyValue) * 100) : null;

    const { data, error } = await admin
      .from("prospect_conversions")
      .insert({
        prospect_id: id,
        campaign_id: prospect.campaign_id,
        organization_id: organizationId,
        plan_label: String(body.planLabel ?? "").trim().slice(0, 100) || null,
        monthly_value_minor: monthlyValue !== null && Number.isFinite(monthlyValue) ? monthlyValue : null,
        notes: String(body.notes ?? "").trim().slice(0, 500) || null,
      })
      .select("id, converted_at")
      .single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Este prospecto ya está convertido en cliente." }, { status: 409 });
      console.error("SALES AGENT CONVERTIR:", error);
      return NextResponse.json({ error: "No se pudo registrar la conversión." }, { status: 500 });
    }

    await admin.from("prospects").update({ status: "cliente", updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true, conversion: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
