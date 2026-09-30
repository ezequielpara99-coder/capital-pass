import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";

// Registra que el vendedor le dio al botón "Enviar por WhatsApp" para esta
// venta -- no hay forma de saber si el mensaje realmente llegó o se leyó
// (eso requiere la API paga de WhatsApp Business), pero esto alcanza para
// que el organizador vea en Notificaciones qué ventas todavía nadie mandó,
// en vez de enterarse solo cuando el comprador se queja. Se llama justo
// antes/después de abrir el link de wa.me, best-effort: nunca debe poder
// bloquear el envío en sí.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ saleId: string }> }
) {
  try {
    const { saleId } = await context.params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: sale } = await admin
      .from("sales")
      .select("id, seller_member_id, organization_id")
      .eq("id", saleId)
      .maybeSingle();

    if (!sale) {
      return NextResponse.json({ error: "No se encontró la venta." }, { status: 404 });
    }

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("id, organization_id, role")
      .eq("user_id", user.id)
      .eq("status", "active");

    const isSeller = (memberships ?? []).some((m) => m.id === sale.seller_member_id);
    const isOrganizer = (memberships ?? []).some(
      (m) => m.role === "organizer" && m.organization_id === sale.organization_id
    );

    if (!isSeller && !isOrganizer) {
      return NextResponse.json({ error: "No tenés acceso a esta venta." }, { status: 403 });
    }

    // Solo se guarda la PRIMERA vez -- si el vendedor manda de nuevo (ej.
    // reenvío porque no le llegó), la fecha del primer envío es la que
    // importa para saber si "nadie la mandó nunca". service_role no tiene
    // permiso de UPDATE directo sobre sales (todas las mutaciones pasan
    // por funciones security definer) -- un admin.from("sales").update(...)
    // aca fallaba siempre con "permission denied" sin que el codigo lo
    // chequeara: la marca nunca se guardaba de verdad, dejando rota la
    // seccion "Entradas sin enviar" de Notificaciones.
    await admin.rpc("claim_whatsapp_sent", { p_sale_id: saleId });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("ERROR API WHATSAPP ENVIADO:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
