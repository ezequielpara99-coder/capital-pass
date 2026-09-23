import { NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";

// ============================================================
// GEOREF ARGENTINA
// ============================================================

const GEOREF_BASE_URL =
  "https://apis.datos.gob.ar/georef/api/v2.0";

type GeorefLocality = {
  id?: string;
  nombre?: string;

  provincia?: {
    id?: string;
    nombre?: string;
  };

  centroide?: {
    lat?: number;
    lon?: number;
  };
};

async function georefFetch(
  path: string,
  params: URLSearchParams
) {
  const url =
    `${GEOREF_BASE_URL}/${path}?${params.toString()}`;

  const response =
    await fetch(url, {
      method: "GET",

      headers: {
        Accept: "application/json",
      },

      next: {
        revalidate:
          60 * 60 * 24,
      },
    });

  if (!response.ok) {
    throw new Error(
      `GeoRef respondió ${response.status}`
    );
  }

  return response.json();
}

async function resolveGeoRefLocality({
  provinceId,
  localityId,
}: {
  provinceId: string | null;
  localityId: string | null;
}) {
  if (
    !provinceId ||
    !localityId
  ) {
    return null;
  }

  try {
    const data =
      (await georefFetch(
        "localidades",
        new URLSearchParams({
          provincia:
            provinceId,

          max:
            "5000",
        })
      )) as {
        localidades?:
          GeorefLocality[];
      };

    const locality =
      (data.localidades ?? [])
        .find(
          (item) =>
            item.id === localityId
        );

    if (!locality) {
      return null;
    }

    return {
      city:
        locality.nombre ??
        null,

      province:
        locality
          .provincia
          ?.nombre ??
        null,

      lat:
        typeof locality
          .centroide
          ?.lat === "number"
          ? locality
              .centroide
              .lat
          : null,

      lng:
        typeof locality
          .centroide
          ?.lon === "number"
          ? locality
              .centroide
              .lon
          : null,
    };
  } catch (error) {
    console.error(
      "No se pudo resolver GeoRef locality:",
      error
    );

    return null;
  }
}

// ============================================================
// HELPERS
// ============================================================

function cleanText(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  return cleaned.length > 0
    ? cleaned
    : null;
}

function getCommission(
  value: unknown
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return 0;
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0 ||
    number > 100
  ) {
    return null;
  }

  return (
    Math.round(number * 100) /
    100
  );
}

function getCoordinate(
  value: unknown
): number | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function normalizeLocationPart(
  value: string | null
) {
  return (
    value
      ?.trim()
      .toLocaleLowerCase(
        "es-AR"
      ) ?? ""
  );
}

// ============================================================
// UBICACIÓN
//
// GeoRef nos da la localidad oficial y su centroide.
// Si además existe una zona/barrio, intentamos ubicarla
// de forma más precisa.
//
// Si esa búsqueda falla, conservamos las coordenadas
// oficiales de la localidad.
// ============================================================

async function resolveLocation({
  province,
  provinceId,
  city,
  localityId,
  zone,
  fallbackLat,
  fallbackLng,
}: {
  province: string | null;
  provinceId: string | null;
  city: string | null;
  localityId: string | null;
  zone: string | null;
  fallbackLat: number | null;
  fallbackLng: number | null;
}) {
  const georef =
    await resolveGeoRefLocality({
      provinceId,
      localityId,
    });

  const resolvedCity =
    city ??
    georef?.city ??
    null;

  const resolvedProvince =
    province ??
    georef?.province ??
    null;

  const lat =
    fallbackLat ??
    georef?.lat ??
    null;

  const lng =
    fallbackLng ??
    georef?.lng ??
    null;

  const label =
    [
      zone,
      resolvedCity,
      resolvedProvince,
    ]
      .filter(Boolean)
      .join(" · ") ||
    null;

  return {
    lat,
    lng,
    label,
  };
}

// ============================================================
// ORGANIZADOR + EVENTO
// ============================================================

async function getOrganizerContext(
  eventId: string
) {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    return {
      error:
        "No autorizado.",
      status: 401,
    } as const;
  }

  const admin =
    createAdminClient();

  const {
    data: membership,
  } = await admin
    .from(
      "organization_members"
    )
    .select(`
      id,
      organization_id,
      role,
      status
    `)
    .eq(
      "user_id",
      user.id
    )
    .eq(
      "role",
      "organizer"
    )
    .eq(
      "status",
      "active"
    )
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return {
      error:
        "No tenés permisos de organizador.",
      status: 403,
    } as const;
  }

  // Crear/pausar/reactivar RRPPs, cambiarles la comision o registrarles un
  // pago siempre usaba el cliente de service_role directo (sin pasar por
  // ninguna RPC), asi que nunca se validaba la suscripcion -- a diferencia
  // de vender entradas o tragos, que si la chequean (create_sale,
  // create_bartender_sale, etc.) y quedan bloqueados con la suscripcion
  // vencida. Una organizacion vencida podia seguir gestionando RRPPs
  // reales (crear usuarios, cambiar comisiones) indefinidamente.
  const {
    data: hasService,
    error: serviceError,
  } = await admin.rpc(
    "cp_org_has_service",
    {
      p_organization_id:
        membership.organization_id,
    }
  );

  if (serviceError) {
    console.error(
      "RRPPs - cp_org_has_service:",
      serviceError
    );

    return {
      error:
        "No se pudo verificar la suscripción.",
      status: 500,
    } as const;
  }

  if (!hasService) {
    return {
      error:
        "La organización necesita una suscripción activa.",
      status: 402,
    } as const;
  }

  const {
    data: event,
  } = await admin
    .from("events")
    .select(`
      id,
      organization_id,
      name
    `)
    .eq(
      "id",
      eventId
    )
    .eq(
      "organization_id",
      membership.organization_id
    )
    .maybeSingle();

  if (!event) {
    return {
      error:
        "El evento no pertenece a tu organización.",
      status: 404,
    } as const;
  }

  return {
    user,
    admin,
    membership,
    event,
  } as const;
}

// ============================================================
// POST
// CREAR RRPP
// ============================================================

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const eventId =
      cleanText(
        body.eventId
      );

    const firstName =
      cleanText(
        body.firstName
      );

    const lastName =
      cleanText(
        body.lastName
      );

    const email =
      cleanText(
        body.email
      )?.toLowerCase();

    const phone =
      cleanText(
        body.phone
      );

    const password =
      cleanText(
        body.password
      );

    // ========================================================
    // UBICACIÓN OFICIAL
    // ========================================================

    const assignedProvince =
      cleanText(
        body.assignedProvince
      );

    const assignedProvinceId =
      cleanText(
        body.assignedProvinceId
      );

    const assignedCity =
      cleanText(
        body.assignedCity
      );

    const assignedLocalityId =
      cleanText(
        body.assignedLocalityId
      );

    const assignedZone =
      cleanText(
        body.assignedZone
      );

    const selectedLat =
      getCoordinate(
        body.assignedLat
      );

    const selectedLng =
      getCoordinate(
        body.assignedLng
      );

    const commissionPercentage =
      getCommission(
        body.commissionPercentage
      );

    // ========================================================
    // VALIDACIONES
    // ========================================================

    if (!eventId) {
      return NextResponse.json(
        {
          error:
            "Falta el evento.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !firstName ||
      !lastName
    ) {
      return NextResponse.json(
        {
          error:
            "Nombre y apellido son obligatorios.",
        },
        {
          status: 400,
        }
      );
    }

    if (!email) {
      return NextResponse.json(
        {
          error:
            "El email es obligatorio.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !password ||
      password.length < 6
    ) {
      return NextResponse.json(
        {
          error:
            "La contraseña debe tener al menos 6 caracteres.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      commissionPercentage ===
      null
    ) {
      return NextResponse.json(
        {
          error:
            "La comisión debe estar entre 0% y 100%.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      assignedProvince &&
      !assignedProvinceId
    ) {
      return NextResponse.json(
        {
          error:
            "Seleccioná la provincia desde la lista.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      assignedCity &&
      !assignedLocalityId
    ) {
      return NextResponse.json(
        {
          error:
            "Seleccioná la ciudad o localidad desde la lista.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // ORGANIZADOR
    // ========================================================

    const context =
      await getOrganizerContext(
        eventId
      );

    if (
      "error" in context
    ) {
      return NextResponse.json(
        {
          error:
            context.error,
        },
        {
          status:
            context.status,
        }
      );
    }

    const {
      admin,
      membership,
    } = context;

    // ========================================================
    // RESOLVER UBICACIÓN
    // ========================================================

    const location =
      await resolveLocation({
        province:
          assignedProvince,

        provinceId:
          assignedProvinceId,

        city:
          assignedCity,

        localityId:
          assignedLocalityId,

        zone:
          assignedZone,

        fallbackLat:
          selectedLat,

        fallbackLng:
          selectedLng,
      });

    // ========================================================
    // USUARIO AUTH
    // ========================================================

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

            phone:
              phone ?? "",
          },
        }
      );

    if (
      authError ||
      !authData.user
    ) {
      return NextResponse.json(
        {
          error:
            authError?.message ??
            "No se pudo crear el usuario RRPP.",
        },
        {
          status: 400,
        }
      );
    }

    const rrppUser =
      authData.user;

    // ========================================================
    // PERFIL
    // ========================================================

    const {
      error: profileError,
    } = await admin
      .from("profiles")
      .upsert(
        {
          id:
            rrppUser.id,

          first_name:
            firstName,

          last_name:
            lastName,
        },
        {
          onConflict:
            "id",
        }
      );

    if (profileError) {
      await admin.auth.admin.deleteUser(
        rrppUser.id
      );

      return NextResponse.json(
        {
          error:
            "No se pudo crear el perfil del RRPP.",
        },
        {
          status: 500,
        }
      );
    }

    // ========================================================
    // MIEMBRO
    // ========================================================

    const {
      data: member,
      error: memberError,
    } = await admin
      .from(
        "organization_members"
      )
      .insert({
        organization_id:
          membership.organization_id,

        user_id:
          rrppUser.id,

        role:
          "rrpp",

        status:
          "active",
      })
      .select(`
        id,
        organization_id,
        user_id,
        role,
        status
      `)
      .single();

    if (
      memberError ||
      !member
    ) {
      await admin
        .from("profiles")
        .delete()
        .eq(
          "id",
          rrppUser.id
        );

      await admin.auth.admin.deleteUser(
        rrppUser.id
      );

      return NextResponse.json(
        {
          error:
            memberError?.message ??
            "No se pudo agregar el RRPP a la organización.",
        },
        {
          status: 500,
        }
      );
    }

    // ========================================================
    // ASIGNACIÓN
    // ========================================================

    const {
      data: staff,
      error: staffError,
    } = await admin
      .from("event_staff")
      .insert({
        event_id:
          eventId,

        organization_member_id:
          member.id,

        staff_role:
          "rrpp",

        active:
          true,

        assigned_province:
          assignedProvince,

        assigned_province_id:
          assignedProvinceId,

        assigned_city:
          assignedCity,

        assigned_locality_id:
          assignedLocalityId,

        assigned_zone:
          assignedZone,

        assigned_lat:
          location.lat,

        assigned_lng:
          location.lng,

        location_label:
          location.label,

        commission_percentage:
          commissionPercentage,
      })
      .select(`
        id,
        event_id,
        organization_member_id,
        staff_role,
        active,
        assigned_province,
        assigned_province_id,
        assigned_city,
        assigned_locality_id,
        assigned_zone,
        assigned_lat,
        assigned_lng,
        location_label,
        commission_percentage
      `)
      .single();

    if (
      staffError ||
      !staff
    ) {
      await admin
        .from(
          "organization_members"
        )
        .delete()
        .eq(
          "id",
          member.id
        );

      await admin
        .from("profiles")
        .delete()
        .eq(
          "id",
          rrppUser.id
        );

      await admin.auth.admin.deleteUser(
        rrppUser.id
      );

      return NextResponse.json(
        {
          error:
            staffError?.message ??
            "No se pudo asignar el RRPP al evento.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,

        rrpp: {
          userId:
            rrppUser.id,

          memberId:
            member.id,

          eventStaffId:
            staff.id,

          firstName,
          lastName,
          email,
          phone,

          assignedProvince:
            staff.assigned_province,

          assignedProvinceId:
            staff.assigned_province_id,

          assignedCity:
            staff.assigned_city,

          assignedLocalityId:
            staff.assigned_locality_id,

          assignedZone:
            staff.assigned_zone,

          assignedLat:
            staff.assigned_lat,

          assignedLng:
            staff.assigned_lng,

          locationLabel:
            staff.location_label,

          commissionPercentage:
            Number(
              staff.commission_percentage ??
                0
            ),

          active:
            staff.active,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "POST /api/rrpps",
      error
    );

    return NextResponse.json(
      {
        error:
          "Error interno al crear el RRPP.",
      },
      {
        status: 500,
      }
    );
  }
}

// ============================================================
// PATCH
//
// 1. PAUSAR / ACTIVAR
// 2. UBICACIÓN + COMISIÓN
// 3. REGISTRAR PAGO
// ============================================================

export async function PATCH(
  request: Request
) {
  try {
    const body =
      await request.json();

    const eventId =
      cleanText(
        body.eventId
      );

    const memberId =
      cleanText(
        body.memberId
      );

    if (
      !eventId ||
      !memberId
    ) {
      return NextResponse.json(
        {
          error:
            "Faltan datos del RRPP o del evento.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // ORGANIZADOR
    // ========================================================

    const context =
      await getOrganizerContext(
        eventId
      );

    if (
      "error" in context
    ) {
      return NextResponse.json(
        {
          error:
            context.error,
        },
        {
          status:
            context.status,
        }
      );
    }

    const {
      admin,
      membership,
      user,
    } = context;

    // ========================================================
    // RRPP
    // ========================================================

    const {
      data: member,
    } = await admin
      .from(
        "organization_members"
      )
      .select(`
        id,
        organization_id,
        user_id,
        role,
        status
      `)
      .eq(
        "id",
        memberId
      )
      .eq(
        "organization_id",
        membership.organization_id
      )
      .eq(
        "role",
        "rrpp"
      )
      .maybeSingle();

    if (!member) {
      return NextResponse.json(
        {
          error:
            "RRPP no encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // STAFF
    // ========================================================

    const {
      data: staff,
    } = await admin
      .from("event_staff")
      .select(`
        id,
        event_id,
        organization_member_id,
        staff_role,
        active,
        assigned_province,
        assigned_province_id,
        assigned_city,
        assigned_locality_id,
        assigned_zone,
        assigned_lat,
        assigned_lng,
        location_label,
        commission_percentage
      `)
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
        "rrpp"
      )
      .maybeSingle();

    if (!staff) {
      return NextResponse.json(
        {
          error:
            "Este RRPP no está asignado al evento.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // PAGO
    // ========================================================

    if (
      body.action ===
      "payment"
    ) {
      const amountMinor =
        Number(
          body.amountMinor
        );

      const note =
        cleanText(
          body.note
        );

      if (
        !Number.isFinite(
          amountMinor
        ) ||
        amountMinor <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "El importe debe ser mayor a cero.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data: payment,
        error: paymentError,
      } = await admin
        .from(
          "rrpp_commission_payments"
        )
        .insert({
          organization_id:
            membership.organization_id,

          event_id:
            eventId,

          event_staff_id:
            staff.id,

          organization_member_id:
            memberId,

          amount_minor:
            Math.round(
              amountMinor
            ),

          currency:
            "ARS",

          note,

          created_by:
            user.id,
        })
        .select(`
          id,
          amount_minor,
          currency,
          paid_at,
          note
        `)
        .single();

      if (
        paymentError ||
        !payment
      ) {
        return NextResponse.json(
          {
            error:
              paymentError?.message ??
              "No se pudo registrar el pago.",
          },
          {
            status: 500,
          }
        );
      }

      return NextResponse.json({
        ok: true,
        payment,
      });
    }

    // ========================================================
    // UPDATES
    // ========================================================

    const updates: {
      active?: boolean;

      assigned_province?:
        | string
        | null;

      assigned_province_id?:
        | string
        | null;

      assigned_city?:
        | string
        | null;

      assigned_locality_id?:
        | string
        | null;

      assigned_zone?:
        | string
        | null;

      assigned_lat?:
        | number
        | null;

      assigned_lng?:
        | number
        | null;

      location_label?:
        | string
        | null;

      commission_percentage?: number;
    } = {};

    // ========================================================
    // PAUSAR / ACTIVAR
    // ========================================================

    if (
      typeof body.active ===
      "boolean"
    ) {
      updates.active =
        body.active;
    }

    // ========================================================
    // UBICACIÓN
    // ========================================================

    const provinceWasProvided =
      Object.prototype.hasOwnProperty.call(
        body,
        "assignedProvince"
      );

    const provinceIdWasProvided =
      Object.prototype.hasOwnProperty.call(
        body,
        "assignedProvinceId"
      );

    const cityWasProvided =
      Object.prototype.hasOwnProperty.call(
        body,
        "assignedCity"
      );

    const localityIdWasProvided =
      Object.prototype.hasOwnProperty.call(
        body,
        "assignedLocalityId"
      );

    const zoneWasProvided =
      Object.prototype.hasOwnProperty.call(
        body,
        "assignedZone"
      );

    const latWasProvided =
      Object.prototype.hasOwnProperty.call(
        body,
        "assignedLat"
      );

    const lngWasProvided =
      Object.prototype.hasOwnProperty.call(
        body,
        "assignedLng"
      );

    const nextProvince =
      provinceWasProvided
        ? cleanText(
            body.assignedProvince
          )
        : staff.assigned_province;

    const nextProvinceId =
      provinceIdWasProvided
        ? cleanText(
            body.assignedProvinceId
          )
        : staff.assigned_province_id;

    const nextCity =
      cityWasProvided
        ? cleanText(
            body.assignedCity
          )
        : staff.assigned_city;

    const nextLocalityId =
      localityIdWasProvided
        ? cleanText(
            body.assignedLocalityId
          )
        : staff.assigned_locality_id;

    const nextZone =
      zoneWasProvided
        ? cleanText(
            body.assignedZone
          )
        : staff.assigned_zone;

    const selectedLat =
      latWasProvided
        ? getCoordinate(
            body.assignedLat
          )
        : getCoordinate(
            staff.assigned_lat
          );

    const selectedLng =
      lngWasProvided
        ? getCoordinate(
            body.assignedLng
          )
        : getCoordinate(
            staff.assigned_lng
          );

    // --------------------------------------------------------
    // VALIDAR SELECCIÓN OFICIAL
    // --------------------------------------------------------

    if (
      nextProvince &&
      !nextProvinceId
    ) {
      return NextResponse.json(
        {
          error:
            "Seleccioná la provincia desde la lista.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      nextCity &&
      !nextLocalityId &&
      (
        cityWasProvided ||
        localityIdWasProvided
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Seleccioná la ciudad o localidad desde la lista.",
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------------
    // DETECTAR CAMBIO DE UBICACIÓN
    // --------------------------------------------------------

    const provinceChanged =
      normalizeLocationPart(
        nextProvince
      ) !==
      normalizeLocationPart(
        staff.assigned_province
      );

    const cityChanged =
      normalizeLocationPart(
        nextCity
      ) !==
      normalizeLocationPart(
        staff.assigned_city
      );

    const zoneChanged =
      normalizeLocationPart(
        nextZone
      ) !==
      normalizeLocationPart(
        staff.assigned_zone
      );

    const provinceIdChanged =
      (
        nextProvinceId ??
        ""
      ) !==
      (
        staff.assigned_province_id ??
        ""
      );

    const localityIdChanged =
      (
        nextLocalityId ??
        ""
      ) !==
      (
        staff.assigned_locality_id ??
        ""
      );

    const locationChanged =
      provinceChanged ||
      cityChanged ||
      zoneChanged ||
      provinceIdChanged ||
      localityIdChanged ||
      latWasProvided ||
      lngWasProvided;

    // --------------------------------------------------------
    // GUARDAR CAMPOS
    // --------------------------------------------------------

    if (provinceWasProvided) {
      updates.assigned_province =
        nextProvince;
    }

    if (
      provinceIdWasProvided
    ) {
      updates.assigned_province_id =
        nextProvinceId;
    }

    if (cityWasProvided) {
      updates.assigned_city =
        nextCity;
    }

    if (
      localityIdWasProvided
    ) {
      updates.assigned_locality_id =
        nextLocalityId;
    }

    if (zoneWasProvided) {
      updates.assigned_zone =
        nextZone;
    }

    // --------------------------------------------------------
    // RESOLVER COORDENADAS
    // --------------------------------------------------------

    if (locationChanged) {
      if (!nextCity) {
        updates.assigned_lat =
          null;

        updates.assigned_lng =
          null;

        updates.location_label =
          null;
      } else {
        const location =
          await resolveLocation({
            province:
              nextProvince,

            provinceId:
              nextProvinceId,

            city:
              nextCity,

            localityId:
              nextLocalityId,

            zone:
              nextZone,

            fallbackLat:
              selectedLat,

            fallbackLng:
              selectedLng,
          });

        updates.assigned_lat =
          location.lat;

        updates.assigned_lng =
          location.lng;

        updates.location_label =
          location.label;
      }
    }

    // ========================================================
    // COMISIÓN
    // ========================================================

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "commissionPercentage"
      )
    ) {
      const commission =
        getCommission(
          body.commissionPercentage
        );

      if (
        commission === null
      ) {
        return NextResponse.json(
          {
            error:
              "La comisión debe estar entre 0% y 100%.",
          },
          {
            status: 400,
          }
        );
      }

      updates.commission_percentage =
        commission;
    }

    // ========================================================
    // SIN CAMBIOS
    // ========================================================

    if (
      Object.keys(updates)
        .length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No hay cambios para guardar.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // GUARDAR
    // ========================================================

    const {
      data: updatedStaff,
      error: updateError,
    } = await admin
      .from("event_staff")
      .update(updates)
      .eq(
        "id",
        staff.id
      )
      .select(`
        id,
        event_id,
        organization_member_id,
        active,
        assigned_province,
        assigned_province_id,
        assigned_city,
        assigned_locality_id,
        assigned_zone,
        assigned_lat,
        assigned_lng,
        location_label,
        commission_percentage
      `)
      .single();

    if (
      updateError ||
      !updatedStaff
    ) {
      return NextResponse.json(
        {
          error:
            updateError?.message ??
            "No se pudo actualizar el RRPP.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ok: true,

      rrpp: {
        memberId,

        active:
          updatedStaff.active,

        assignedProvince:
          updatedStaff.assigned_province,

        assignedProvinceId:
          updatedStaff.assigned_province_id,

        assignedCity:
          updatedStaff.assigned_city,

        assignedLocalityId:
          updatedStaff.assigned_locality_id,

        assignedZone:
          updatedStaff.assigned_zone,

        assignedLat:
          updatedStaff.assigned_lat,

        assignedLng:
          updatedStaff.assigned_lng,

        locationLabel:
          updatedStaff.location_label,

        commissionPercentage:
          Number(
            updatedStaff.commission_percentage ??
              0
          ),
      },
    });
  } catch (error) {
    console.error(
      "PATCH /api/rrpps",
      error
    );

    return NextResponse.json(
      {
        error:
          "Error interno al actualizar el RRPP.",
      },
      {
        status: 500,
      }
    );
  }
}
