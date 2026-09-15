import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";

type CreateDoorSellerBody = {
  eventId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
};

type UpdateDoorSellerBody = {
  eventId?: string;
  memberId?: string;
  active?: boolean;
};

async function verifyOrganizer(eventId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      status: 401,
      error: "No hay una sesión válida.",
    };
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select(`
      id,
      organization_id
    `)
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    return {
      ok: false as const,
      status: 404,
      error: "No se encontró el evento.",
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", event.organization_id)
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return {
      ok: false as const,
      status: 403,
      error: "No tenés permiso para administrar este evento.",
    };
  }

  return {
    ok: true as const,
    organizationId: event.organization_id,
  };
}

// =====================================================
// CREAR VENDEDOR DE PUERTA
// =====================================================

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateDoorSellerBody;

    const eventId = body.eventId?.trim();
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim() || null;
    const password = body.password ?? "";

    if (
      !eventId ||
      !firstName ||
      !lastName ||
      !email ||
      !password
    ) {
      return NextResponse.json(
        {
          error:
            "Completá nombre, apellido, email y contraseña.",
        },
        {
          status: 400,
        }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        {
          error:
            "La contraseña debe tener al menos 8 caracteres.",
        },
        {
          status: 400,
        }
      );
    }

    const verification = await verifyOrganizer(eventId);

    if (!verification.ok) {
      return NextResponse.json(
        {
          error: verification.error,
        },
        {
          status: verification.status,
        }
      );
    }

    const admin = createAdminClient();

    // -------------------------------------------------
    // USUARIO AUTH
    // -------------------------------------------------

    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,

        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          role: "door_seller",
        },
      });

    if (authError || !authData.user) {
      console.error(
        "ERROR AUTH VENDEDOR PUERTA:",
        authError
      );

      return NextResponse.json(
        {
          error: authError?.message
            ?.toLowerCase()
            .includes("already")
            ? "Ya existe una cuenta con ese email."
            : "No se pudo crear la cuenta.",
        },
        {
          status: 400,
        }
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

    // -------------------------------------------------
    // PERFIL
    // -------------------------------------------------

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(
        {
          id: newUser.id,
          first_name: firstName,
          last_name: lastName,
          phone,
          active: true,
        },
        {
          onConflict: "id",
        }
      );

    if (profileError) {
      console.error(
        "ERROR PROFILE PUERTA:",
        profileError
      );

      await rollbackUser();

      return NextResponse.json(
        {
          error:
            "No se pudo crear el perfil del vendedor.",
        },
        {
          status: 500,
        }
      );
    }

    // -------------------------------------------------
    // MEMBER
    // -------------------------------------------------

    const { data: member, error: memberError } = await admin
      .from("organization_members")
      .insert({
        organization_id: verification.organizationId,
        user_id: newUser.id,
        role: "door_seller",
        status: "active",
      })
      .select("id")
      .single();

    if (memberError || !member) {
      console.error(
        "ERROR MEMBER PUERTA:",
        memberError
      );

      await rollbackUser();

      return NextResponse.json(
        {
          error:
            "No se pudo agregar el vendedor a la organización.",
        },
        {
          status: 500,
        }
      );
    }

    // -------------------------------------------------
    // ASIGNACIÓN AL EVENTO
    // -------------------------------------------------

    const { error: staffError } = await admin
      .from("event_staff")
      .insert({
        event_id: eventId,
        organization_member_id: member.id,
        staff_role: "door_seller",
        active: true,
      });

    if (staffError) {
      console.error(
        "ERROR STAFF PUERTA:",
        staffError
      );

      await admin
        .from("organization_members")
        .delete()
        .eq("id", member.id);

      await rollbackUser();

      return NextResponse.json(
        {
          error:
            "No se pudo asignar el vendedor al evento.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,

        seller: {
          memberId: member.id,
          firstName,
          lastName,
          email,
          active: true,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "ERROR POST VENDEDOR PUERTA:",
      error
    );

    return NextResponse.json(
      {
        error: "Ocurrió un error inesperado.",
      },
      {
        status: 500,
      }
    );
  }
}

// =====================================================
// ACTIVAR / PAUSAR VENDEDOR
// =====================================================

export async function PATCH(request: NextRequest) {
  try {
    const body =
      (await request.json()) as UpdateDoorSellerBody;

    const eventId = body.eventId?.trim();
    const memberId = body.memberId?.trim();
    const active = body.active;

    if (
      !eventId ||
      !memberId ||
      typeof active !== "boolean"
    ) {
      return NextResponse.json(
        {
          error:
            "Faltan datos para actualizar el vendedor.",
        },
        {
          status: 400,
        }
      );
    }

    const verification =
      await verifyOrganizer(eventId);

    if (!verification.ok) {
      return NextResponse.json(
        {
          error: verification.error,
        },
        {
          status: verification.status,
        }
      );
    }

    const admin = createAdminClient();

    // -------------------------------------------------
    // VERIFICAR QUE SEA DOOR SELLER DE LA ORG
    // -------------------------------------------------

    const { data: member, error: memberError } =
      await admin
        .from("organization_members")
        .select(`
          id,
          organization_id,
          role
        `)
        .eq("id", memberId)
        .eq(
          "organization_id",
          verification.organizationId
        )
        .eq("role", "door_seller")
        .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json(
        {
          error:
            "No se encontró el vendedor de puerta.",
        },
        {
          status: 404,
        }
      );
    }

    // -------------------------------------------------
    // ASIGNACIÓN
    // -------------------------------------------------

    const {
      data: assignment,
      error: assignmentError,
    } = await admin
      .from("event_staff")
      .select("id")
      .eq("event_id", eventId)
      .eq(
        "organization_member_id",
        memberId
      )
      .eq(
        "staff_role",
        "door_seller"
      )
      .limit(1)
      .maybeSingle();

    if (assignmentError) {
      console.error(
        "ERROR BUSCANDO STAFF PUERTA:",
        assignmentError
      );

      return NextResponse.json(
        {
          error:
            "No se pudo consultar la asignación.",
        },
        {
          status: 500,
        }
      );
    }

    if (assignment) {
      const { error: updateError } = await admin
        .from("event_staff")
        .update({
          active,
        })
        .eq("id", assignment.id);

      if (updateError) {
        console.error(
          "ERROR UPDATE PUERTA:",
          updateError
        );

        return NextResponse.json(
          {
            error:
              "No se pudo actualizar el vendedor.",
          },
          {
            status: 500,
          }
        );
      }
    } else if (active) {
      const { error: insertError } = await admin
        .from("event_staff")
        .insert({
          event_id: eventId,
          organization_member_id: memberId,
          staff_role: "door_seller",
          active: true,
        });

      if (insertError) {
        console.error(
          "ERROR INSERT PUERTA:",
          insertError
        );

        return NextResponse.json(
          {
            error:
              "No se pudo asignar el vendedor.",
          },
          {
            status: 500,
          }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      active,
    });
  } catch (error) {
    console.error(
      "ERROR PATCH VENDEDOR PUERTA:",
      error
    );

    return NextResponse.json(
      {
        error: "Ocurrió un error inesperado.",
      },
      {
        status: 500,
      }
    );
  }
}