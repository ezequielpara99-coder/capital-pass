import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { verifyOrganizerForEvent } from "../../../lib/stock/auth";

type CreateBartenderBody = {
  eventId?: string;
  barId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
};

type UpdateBartenderBody = {
  eventId?: string;
  memberId?: string;
  active?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBartenderBody;

    const eventId = body.eventId?.trim();
    const barId = body.barId?.trim();
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim() || null;
    const password = body.password ?? "";

    if (!eventId || !barId || !firstName || !lastName || !email || !password) {
      return NextResponse.json({ error: "Completá nombre, apellido, barra, email y contraseña." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
    }

    const verification = await verifyOrganizerForEvent(eventId);
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();

    const { data: bar } = await admin.from("bars").select("id").eq("id", barId).eq("event_id", eventId).maybeSingle();
    if (!bar) return NextResponse.json({ error: "Esa barra no existe para este evento." }, { status: 404 });

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role: "bartender" },
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message?.toLowerCase().includes("already") ? "Ya existe una cuenta con ese email." : "No se pudo crear la cuenta." },
        { status: 400 }
      );
    }

    const newUser = authData.user;
    async function rollbackUser() {
      try {
        await admin.auth.admin.deleteUser(newUser.id);
      } catch {
        // nada
      }
    }

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({ id: newUser.id, first_name: firstName, last_name: lastName, phone, active: true }, { onConflict: "id" });

    if (profileError) {
      await rollbackUser();
      return NextResponse.json({ error: "No se pudo crear el perfil del bartender." }, { status: 500 });
    }

    const { data: member, error: memberError } = await admin
      .from("organization_members")
      .insert({ organization_id: verification.organizationId, user_id: newUser.id, role: "bartender", status: "active" })
      .select("id")
      .single();

    if (memberError || !member) {
      await rollbackUser();
      return NextResponse.json({ error: "No se pudo agregar el bartender a la organización." }, { status: 500 });
    }

    const { error: staffError } = await admin
      .from("event_staff")
      .insert({ event_id: eventId, organization_member_id: member.id, staff_role: "bartender", active: true, bar_id: barId });

    if (staffError) {
      await admin.from("organization_members").delete().eq("id", member.id);
      await rollbackUser();
      return NextResponse.json({ error: "No se pudo asignar el bartender a la barra." }, { status: 500 });
    }

    return NextResponse.json(
      { ok: true, bartender: { memberId: member.id, firstName, lastName, email, active: true, barId } },
      { status: 201 }
    );
  } catch (error) {
    console.error("ERROR POST BARTENDER:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as UpdateBartenderBody;
    const eventId = body.eventId?.trim();
    const memberId = body.memberId?.trim();
    const active = body.active;

    if (!eventId || !memberId || typeof active !== "boolean") {
      return NextResponse.json({ error: "Faltan datos para actualizar el bartender." }, { status: 400 });
    }

    const verification = await verifyOrganizerForEvent(eventId);
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();

    const { data: member } = await admin
      .from("organization_members")
      .select("id")
      .eq("id", memberId)
      .eq("organization_id", verification.organizationId)
      .eq("role", "bartender")
      .maybeSingle();

    if (!member) return NextResponse.json({ error: "No se encontró el bartender." }, { status: 404 });

    const { error: updateError } = await admin
      .from("event_staff")
      .update({ active })
      .eq("event_id", eventId)
      .eq("organization_member_id", memberId)
      .eq("staff_role", "bartender");

    if (updateError) {
      return NextResponse.json({ error: "No se pudo actualizar el bartender." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, active });
  } catch (error) {
    console.error("ERROR PATCH BARTENDER:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
