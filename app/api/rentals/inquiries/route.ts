import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { sendRentalInquiryNotification } from "../../../../lib/email/rental-inquiry";

const FALLBACK_ADMIN_EMAILS = ["ezequiel.para99@gmail.com"];

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "No hay una sesión válida." };

  const admin = createAdminClient();
  const { data: adminAccess } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  const isFallbackAdmin = Boolean(user.email && FALLBACK_ADMIN_EMAILS.includes(user.email.toLowerCase()));

  if (!adminAccess && !isFallbackAdmin) return { ok: false as const, status: 403, error: "No tenés permiso." };
  return { ok: true as const };
}

// Formulario publico de Capital Rentals (sin login). Guarda la consulta
// siempre, y de forma best-effort le manda un mail a Capital Pass -- si el
// mail falla no rompemos la respuesta al visitante, la consulta ya quedo
// guardada y se puede ver desde /admin/rentals.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const businessName = String(body.businessName ?? "").trim();
    const contactName = String(body.contactName ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const email = body.email ? String(body.email).trim() : null;
    const city = body.city ? String(body.city).trim() : null;
    const terminalQuantity = body.terminalQuantity ? String(body.terminalQuantity).trim() : null;
    const message = body.message ? String(body.message).trim() : null;

    if (!businessName) return NextResponse.json({ error: "Falta el nombre del negocio." }, { status: 400 });
    if (!contactName) return NextResponse.json({ error: "Falta el nombre de contacto." }, { status: 400 });
    if (!phone) return NextResponse.json({ error: "Falta un teléfono de contacto." }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from("rental_inquiries").insert({
      business_name: businessName,
      contact_name: contactName,
      phone,
      email,
      city,
      terminal_quantity: terminalQuantity,
      message,
    });

    if (error) {
      console.error("RENTAL INQUIRIES POST:", error);
      return NextResponse.json({ error: "No se pudo enviar la consulta." }, { status: 500 });
    }

    const emailResult = await sendRentalInquiryNotification({
      businessName,
      contactName,
      phone,
      email,
      city,
      terminalQuantity,
      message,
    });
    if (!emailResult.ok && !emailResult.skipped) {
      console.error("RENTAL INQUIRIES email:", emailResult.error);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: el admin marca una consulta como contactada/cerrada.
export async function PATCH(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const inquiryId = String(body.inquiryId ?? "").trim();
    const status = String(body.status ?? "").trim();
    if (!inquiryId) return NextResponse.json({ error: "Falta la consulta." }, { status: 400 });
    if (!["nuevo", "contactado", "cerrado"].includes(status)) {
      return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from("rental_inquiries").update({ status }).eq("id", inquiryId);
    if (error) return NextResponse.json({ error: "No se pudo actualizar la consulta." }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
