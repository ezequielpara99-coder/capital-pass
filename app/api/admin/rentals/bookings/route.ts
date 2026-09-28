import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../lib/quotes/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIELDS = "id, asset_id, quote_id, client_name, starts_on, ends_on, notes, created_at";

// GET: reservas que caen dentro de un rango (?from=&to=, ambos YYYY-MM-DD)
// -- una reserva "cae dentro" si se superpone con el rango pedido, no solo
// si arranca ahi (si no, una reserva larga que empezo el mes pasado
// desaparecia del calendario del mes actual).
export async function GET(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const from = request.nextUrl.searchParams.get("from") ?? "";
    const to = request.nextUrl.searchParams.get("to") ?? "";
    if (!DATE.test(from) || !DATE.test(to)) return NextResponse.json({ error: "Rango de fechas inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("rental_bookings")
      .select(FIELDS)
      .lte("starts_on", to)
      .gte("ends_on", from)
      .order("starts_on", { ascending: true });

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (calendario de rental)." }, { status: 503 });
      console.error("RENTAL BOOKINGS GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar las reservas." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, bookings: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: crea una reserva -- rechaza si se superpone con otra del MISMO equipo.
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const assetId = String(body.assetId ?? "");
    if (!UUID.test(assetId)) return NextResponse.json({ error: "Elegí un equipo." }, { status: 400 });

    const clientName = String(body.clientName ?? "").trim();
    if (!clientName) return NextResponse.json({ error: "Ingresá el cliente." }, { status: 400 });

    const startsOn = String(body.startsOn ?? "");
    const endsOn = String(body.endsOn ?? "");
    if (!DATE.test(startsOn) || !DATE.test(endsOn)) return NextResponse.json({ error: "Ingresá fechas válidas." }, { status: 400 });
    if (endsOn < startsOn) return NextResponse.json({ error: "La fecha de fin no puede ser anterior a la de inicio." }, { status: 400 });

    const quoteId = String(body.quoteId ?? "").trim();
    if (quoteId && !UUID.test(quoteId)) return NextResponse.json({ error: "Presupuesto inválido." }, { status: 400 });

    const admin = createAdminClient();

    // Dos rangos de fecha se superponen si cada uno arranca antes de que
    // el otro termine -- es la condicion estandar de solapamiento.
    const { data: overlapping, error: overlapError } = await admin
      .from("rental_bookings")
      .select("id, client_name, starts_on, ends_on")
      .eq("asset_id", assetId)
      .lte("starts_on", endsOn)
      .gte("ends_on", startsOn)
      .limit(1);

    if (overlapError) {
      if (isMissingTable(overlapError)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (calendario de rental)." }, { status: 503 });
      console.error("RENTAL BOOKINGS OVERLAP:", overlapError);
      return NextResponse.json({ error: "No se pudo verificar disponibilidad." }, { status: 500 });
    }

    if (overlapping && overlapping.length > 0) {
      const clash = overlapping[0];
      return NextResponse.json(
        { error: `Ese equipo ya está reservado para ${clash.client_name} del ${clash.starts_on} al ${clash.ends_on}.` },
        { status: 409 }
      );
    }

    const { data, error } = await admin
      .from("rental_bookings")
      .insert({
        asset_id: assetId,
        quote_id: quoteId || null,
        client_name: clientName.slice(0, 200),
        starts_on: startsOn,
        ends_on: endsOn,
        notes: String(body.notes ?? "").trim().slice(0, 2000) || null,
        created_by: verification.userId,
      })
      .select(FIELDS)
      .single();

    if (error) {
      console.error("RENTAL BOOKINGS POST:", error);
      return NextResponse.json({ error: "No se pudo crear la reserva." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, booking: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: cancela una reserva (?id=).
export async function DELETE(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID.test(id)) return NextResponse.json({ error: "Reserva inválida." }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from("rental_bookings").delete().eq("id", id);
    if (error) {
      console.error("RENTAL BOOKINGS DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar la reserva." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
