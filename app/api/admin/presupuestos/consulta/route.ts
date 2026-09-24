import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { verifyAdmin } from "../../../../../lib/quotes/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET: arma el borrador de un presupuesto de rental a partir de una
// consulta pública de la landing (?consulta= en /admin/presupuestos/nuevo).
// Extraído del antiguo nuevo/page.tsx server-side -- ahora esa página es un
// Client Component y necesita pedir esto por fetch.
export async function GET(request: NextRequest) {
  const verification = await verifyAdmin();
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ inquiry: null });

  const admin = createAdminClient();
  const { data: inquiry } = await admin
    .from("rental_inquiries")
    .select("id, business_name, contact_name, phone, email, terminal_quantity")
    .eq("id", id)
    .maybeSingle();

  if (!inquiry) return NextResponse.json({ inquiry: null });

  // terminal_quantity es texto libre de un formulario público (ej. "no sé
  // bien, quizás 2 o 3" o un teléfono pegado ahí sin querer). Tomar el
  // primer numero que aparezca sin tope podia precargar una cantidad
  // absurda (como un numero de telefono) sin que se note. Un tope
  // generoso pero razonable evita eso; fuera de rango se deja en 1 para
  // que el admin lo complete a mano.
  const rawQuantity = Number(String(inquiry.terminal_quantity ?? "").match(/\d+/)?.[0]);
  const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 && rawQuantity <= 500 ? rawQuantity : 1;

  return NextResponse.json({
    inquiry: {
      kind: "rental",
      client_name: inquiry.business_name,
      client_contact: inquiry.contact_name,
      client_phone: inquiry.phone,
      client_email: inquiry.email,
      title: "Alquiler de terminales de pago",
      items: [
        {
          description: "Alquiler de terminal de pago",
          quantity,
          unit: "mes",
          unit_price_minor: 0,
        },
      ],
      price_mode: "items",
      rental_inquiry_id: inquiry.id,
    },
  });
}
