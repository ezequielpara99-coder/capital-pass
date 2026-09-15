import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";

type CreateControllerBody = {
  eventId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
};

type UpdateControllerBody = {
  eventId?: string;
  memberId?: string;
  active?: boolean;
};

async function verifyOrganizer(
  eventId: string
) {
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

  const {
    data: event,
    error: eventError,
  } = await supabase
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

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("organization_members")
    .select("id")
    .eq(
      "organization_id",
      event.organization_id
    )
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    return {
      ok: false as const,
      status: 403,
      error:
        "No tenés permiso para administrar este evento.",
    };
  }

  return {
    ok: true as const,
    user,
    organizationId:
      event.organization_id,
    organizerMemberId:
      membership.id,
  };
}

// =====================================================
// CREAR CONTROLADOR
// =====================================================

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      (await request.json()) as CreateControllerBody;

    const eventId =
      body.eventId?.trim();

    const firstName =
      body.firstName?.trim();

    const lastName =
      body.lastName?.trim();

    const email =
      body.email
        ?.trim()
        .toLowerCase();

    const phone =
      body.phone?.trim() || null;

    const password =
      body.password ?? "";

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

    const verification =
      await verifyOrganizer(eventId);

    if (!verification.ok) {
      return NextResponse.json(
        {
          error:
            verification.error,
        },
        {
          status:
            verification.status,
        }
      );
    }

    const admin =
      createAdminClient();

    // -------------------------------------------------
    // AUTH USER
    // -------------------------------------------------

    const {
      data: authData,
      error: authError,
    } =
      await admin.auth.admin.createUser(
        {
          email,
          password,
          email_confirm: true,

          user_metadata: {
            first_name:
              firstName,

            last_name:
              lastName,

            role: "controller",
          },
        }
      );

    if (
      authError ||
      !authData.user
    ) {
      console.error(
        "ERROR CREANDO AUTH CONTROLLER:",
        authError
      );

      return NextResponse.json(
        {
          error:
            authError?.message?.toLowerCase().includes(
              "already"
            )
              ? "Ya existe una cuenta con ese email."
              : "No se pudo crear la cuenta del controlador.",
        },
        {
          status: 400,
        }
      );
    }

    const newUser =
      authData.user;

    async function rollbackUser() {
      try {
        await admin.auth.admin.deleteUser(
          newUser.id
        );
      } catch {
        // nada
      }
    }

    // -------------------------------------------------
    // PROFILE
    // -------------------------------------------------

    const {
      error: profileError,
    } = await admin
      .from("profiles")
      .upsert(
        {
          id: newUser.id,

          first_name:
            firstName,

          last_name:
            lastName,

          phone,

          active: true,
        },
        {
          onConflict: "id",
        }
      );

    if (profileError) {
      console.error(
        "ERROR PROFILE CONTROLLER:",
        profileError
      );

      await rollbackUser();

      return NextResponse.json(
        {
          error:
            "No se pudo crear el perfil del controlador.",
        },
        {
          status: 500,
        }
      );
    }

    // -------------------------------------------------
    // ORGANIZATION MEMBER
    // -------------------------------------------------

    const {
      data: member,
      error: memberError,
    } = await admin
      .from(
        "organization_members"
      )
      .insert({
        organization_id:
          verification.organizationId,

        user_id:
          newUser.id,

        role: "controller",

        status: "active",
      })
      .select("id")
      .single();

    if (
      memberError ||
      !member
    ) {
      console.error(
        "ERROR MEMBER CONTROLLER:",
        memberError
      );

      await rollbackUser();

      return NextResponse.json(
        {
          error:
            "No se pudo agregar el controlador a la organización.",
        },
        {
          status: 500,
        }
      );
    }

    // -------------------------------------------------
    // ASIGNAR AL EVENTO
    // -------------------------------------------------

    const {
      error: staffError,
    } = await admin
      .from("event_staff")
      .insert({
        event_id: eventId,

        organization_member_id:
          member.id,

        staff_role:
          "controller",

        active: true,
      });

    if (staffError) {
      console.error(
        "ERROR STAFF CONTROLLER:",
        staffError
      );

      await admin
        .from(
          "organization_members"
        )
        .delete()
        .eq("id", member.id);

      await rollbackUser();

      return NextResponse.json(
        {
          error:
            "No se pudo asignar el controlador al evento.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,

        controller: {
          memberId:
            member.id,

          userId:
            newUser.id,

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
      "ERROR POST CONTROLADOR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Ocurrió un error inesperado.",
      },
      {
        status: 500,
      }
    );
  }
}

// =====================================================
// ACTIVAR / PAUSAR CONTROLADOR EN EVENTO
// =====================================================

export async function PATCH(
  request: NextRequest
) {
  try {
    const body =
      (await request.json()) as UpdateControllerBody;

    const eventId =
      body.eventId?.trim();

    const memberId =
      body.memberId?.trim();

    const active =
      body.active;

    if (
      !eventId ||
      !memberId ||
      typeof active !==
        "boolean"
    ) {
      return NextResponse.json(
        {
          error:
            "Faltan datos para actualizar el controlador.",
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
          error:
            verification.error,
        },
        {
          status:
            verification.status,
        }
      );
    }

    const admin =
      createAdminClient();

    // -------------------------------------------------
    // VERIFICAR QUE EL CONTROLADOR PERTENEZCA
    // A LA ORGANIZACIÓN
    // -------------------------------------------------

    const {
      data: member,
      error: memberError,
    } = await admin
      .from(
        "organization_members"
      )
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
      .eq(
        "role",
        "controller"
      )
      .maybeSingle();

    if (
      memberError ||
      !member
    ) {
      return NextResponse.json(
        {
          error:
            "No se encontró el controlador.",
        },
        {
          status: 404,
        }
      );
    }

    // -------------------------------------------------
    // BUSCAR ASIGNACIÓN
    // -------------------------------------------------

    const {
      data: assignment,
      error: assignmentError,
    } = await admin
      .from("event_staff")
      .select("id")
      .eq(
        "event_id",
        eventId
      )
      .eq(
        "organization_member_id",
        memberId
      )
      .eq(
        "staff_role",
        "controller"
      )
      .limit(1)
      .maybeSingle();

    if (assignmentError) {
      console.error(
        "ERROR BUSCANDO STAFF:",
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
      const {
        error: updateError,
      } = await admin
        .from("event_staff")
        .update({
          active,
        })
        .eq(
          "id",
          assignment.id
        );

      if (updateError) {
        console.error(
          "ERROR UPDATE STAFF:",
          updateError
        );

        return NextResponse.json(
          {
            error:
              "No se pudo actualizar el controlador.",
          },
          {
            status: 500,
          }
        );
      }
    } else if (active) {
      const {
        error: insertError,
      } = await admin
        .from("event_staff")
        .insert({
          event_id:
            eventId,

          organization_member_id:
            memberId,

          staff_role:
            "controller",

          active: true,
        });

      if (insertError) {
        console.error(
          "ERROR INSERT STAFF:",
          insertError
        );

        return NextResponse.json(
          {
            error:
              "No se pudo asignar el controlador.",
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
      "ERROR PATCH CONTROLADOR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Ocurrió un error inesperado.",
      },
      {
        status: 500,
      }
    );
  }
}