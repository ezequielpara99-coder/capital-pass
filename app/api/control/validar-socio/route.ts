import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyMemberSignature } from "../../../../lib/members/signature";
import { verifyControllerForEvent } from "../../../../lib/control/auth";

// Reconoce el QR de un carnet de socio premium en la puerta. No es una
// entrada: no bloquea ni "usa" nada, solo identifica -- por eso no reusa
// validate_ticket_manual ni entry_scans. Igual deja un registro (best-effort)
// en premium_member_scans para poder ver despues quien vino a que evento.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventId = String(body.eventId ?? "").trim();
    const qrPayload = String(body.qrPayload ?? "").trim();
    if (!eventId || !qrPayload) return NextResponse.json({ error: "Faltan datos." }, { status: 400 });

    const verification = await verifyControllerForEvent(eventId);
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const parts = qrPayload.split(":");
    if (parts.length !== 3 || parts[0] !== "CPM1" || !parts[1] || !parts[2]) {
      return NextResponse.json({ status: "not_found" });
    }
    const [, memberId, signature] = parts;

    if (!verifyMemberSignature(memberId, signature)) {
      return NextResponse.json({ status: "not_found" });
    }

    const admin = createAdminClient();
    const { data: event } = await admin.from("events").select("organization_id").eq("id", eventId).maybeSingle();
    if (!event) return NextResponse.json({ error: "El evento no existe." }, { status: 404 });

    const { data: member, error } = await admin
      .from("premium_members")
      .select("id, organization_id, first_name, last_name, member_code, status, expires_at")
      .eq("id", memberId)
      .maybeSingle();

    if (error) {
      console.error("VALIDAR SOCIO:", error);
      return NextResponse.json({ error: "No se pudo verificar el carnet." }, { status: 500 });
    }

    if (!member) return NextResponse.json({ status: "not_found" });

    if (member.organization_id !== event.organization_id) {
      return NextResponse.json({ status: "other_org" });
    }

    await admin.from("premium_member_scans").insert({
      member_id: member.id,
      event_id: eventId,
      scanned_by: verification.memberId,
      method: "qr",
    });

    return NextResponse.json({
      status: member.status,
      firstName: member.first_name,
      lastName: member.last_name,
      memberCode: member.member_code,
      expiresAt: member.expires_at,
    });
  } catch (error) {
    console.error("VALIDAR SOCIO:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
