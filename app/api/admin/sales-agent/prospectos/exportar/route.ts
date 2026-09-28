import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../../lib/quotes/auth";
import { createAdminClient } from "../../../../../../lib/supabase/admin";

function csvCell(value: unknown) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET: exporta los prospectos (con los mismos filtros que la lista) a CSV.
export async function GET(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const params = request.nextUrl.searchParams;
    const admin = createAdminClient();
    let query = admin
      .from("prospects")
      .select("name, instagram_username, city, province, category, score, potential, status, email, phone, whatsapp, ticketing_provider, last_contacted_at, created_at")
      .is("deleted_at", null)
      .order("score", { ascending: false })
      .limit(2000);

    const status = params.get("status");
    if (status) query = query.eq("status", status);
    const campaignId = params.get("campaignId");
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const minScore = params.get("minScore");
    if (minScore) query = query.gte("score", Number(minScore));

    const { data, error } = await query;
    if (error) {
      console.error("SALES AGENT EXPORTAR:", error);
      return NextResponse.json({ error: "No se pudo exportar." }, { status: 500 });
    }

    const header = ["Nombre", "Instagram", "Ciudad", "Provincia", "Categoría", "Score", "Potencial", "Estado", "Email", "Teléfono", "WhatsApp", "Sistema de tickets", "Último contacto", "Creado"];
    const lines = [header.map(csvCell).join(",")];
    for (const p of data ?? []) {
      lines.push([p.name, p.instagram_username, p.city, p.province, p.category, p.score, p.potential, p.status, p.email, p.phone, p.whatsapp, p.ticketing_provider, p.last_contacted_at, p.created_at].map(csvCell).join(","));
    }

    return new NextResponse(`﻿${lines.join("\r\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="prospectos-capital-pass.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
