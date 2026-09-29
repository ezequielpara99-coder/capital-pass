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

const BUSINESS_ERRORS = /ya está reservado|no puede ser anterior|no existe|Ingresá/i;

// POST: crea una reserva -- rechaza si se superpone con otra del MISMO
// equipo. El chequeo de solapamiento y el insert pasan por una sola
// funcion (rental_create_booking) que se serializa con un advisory lock
// por equipo: dos POST casi simultaneos para el mismo equipo ya no pueden
// pasar el chequeo juntos y reservarlo dos veces.
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

    const quoteId = String(body.quoteId ?? "").trim();
    if (quoteId && !UUID.test(quoteId)) return NextResponse.json({ error: "Presupuesto inválido." }, { status: 400 });

    const admin = createAdminClient();

    const { data, error } = await admin.rpc("rental_create_booking", {
      p_asset_id: assetId,
      p_client_name: clientName.slice(0, 200),
      p_starts_on: startsOn,
      p_ends_on: endsOn,
      p_quote_id: quoteId || null,
      p_notes: String(body.notes ?? "").trim().slice(0, 2000) || null,
      p_created_by: verification.userId,
    });

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (calendario de rental)." }, { status: 503 });
      const message = error.message ?? "";
      if (BUSINESS_ERRORS.test(message)) return NextResponse.json({ error: message }, { status: 409 });
      console.error("RENTAL BOOKINGS POST:", error);
      return NextResponse.json({ error: "No se pudo crear la reserva." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, booking: data?.[0] });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH { id, clientName, startsOn, endsOn, quoteId?, notes? }: edita una
// reserva existente (mover fechas, corregir el cliente) en una sola
// operacion atomica -- antes la unica forma de "moverla" era cancelarla y
// crear una nueva por separado, y si el segundo paso fallaba la reserva
// original ya se habia perdido.
export async function PATCH(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return NextResponse.json({ error: "Reserva inválida." }, { status: 400 });

    const clientName = String(body.clientName ?? "").trim();
    if (!clientName) return NextResponse.json({ error: "Ingresá el cliente." }, { status: 400 });

    const startsOn = String(body.startsOn ?? "");
    const endsOn = String(body.endsOn ?? "");
    if (!DATE.test(startsOn) || !DATE.test(endsOn)) return NextResponse.json({ error: "Ingresá fechas válidas." }, { status: 400 });

    const quoteId = String(body.quoteId ?? "").trim();
    if (quoteId && !UUID.test(quoteId)) return NextResponse.json({ error: "Presupuesto inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rental_update_booking", {
      p_booking_id: id,
      p_client_name: clientName.slice(0, 200),
      p_starts_on: startsOn,
      p_ends_on: endsOn,
      p_quote_id: quoteId || null,
      p_notes: String(body.notes ?? "").trim().slice(0, 2000) || null,
    });

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (calendario de rental)." }, { status: 503 });
      const message = error.message ?? "";
      if (BUSINESS_ERRORS.test(message)) return NextResponse.json({ error: message }, { status: 409 });
      console.error("RENTAL BOOKINGS PATCH:", error);
      return NextResponse.json({ error: "No se pudo actualizar la reserva." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, booking: data?.[0] });
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
