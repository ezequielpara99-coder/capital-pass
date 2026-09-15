import { NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";

// ============================================================
// GEOREF ARGENTINA
// ============================================================

const GEOREF_BASE_URL =
  "https://apis.datos.gob.ar/georef/api/v2.0";

// ============================================================
// TYPES
// ============================================================

type GeorefProvince = {
  id?: string;
  nombre?: string;

  centroide?: {
    lat?: number;
    lon?: number;
  };
};

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

// ============================================================
// AUTH ORGANIZADOR
// ============================================================

async function getOrganizer() {
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

  return {
    user,
    admin,
    membership,
  } as const;
}

// ============================================================
// NORMALIZAR TEXTO PARA EL BUSCADOR
//
// "Córdoba" → "cordoba"
// "ROSARIO" → "rosario"
// ============================================================

function normalizeText(
  value: string
) {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLocaleLowerCase(
      "es-AR"
    )
    .trim();
}

// ============================================================
// FETCH GEOREF
// ============================================================

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
        Accept:
          "application/json",
      },

      /*
       * Provincias y localidades
       * no necesitan consultarse
       * nuevamente en cada tecla.
       *
       * Next puede reutilizar
       * el resultado durante 24 h.
       */
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

// ============================================================
// GET
//
// PROVINCIAS:
//
// /api/ubicaciones?tipo=provincias
//
//
// LOCALIDADES:
//
// /api/ubicaciones
// ?tipo=localidades
// &provinciaId=82
// &q=ros
// ============================================================

export async function GET(
  request: Request
) {
  try {
    // --------------------------------------------------------
    // SEGURIDAD
    // --------------------------------------------------------

    const context =
      await getOrganizer();

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

    // --------------------------------------------------------
    // PARAMETROS
    // --------------------------------------------------------

    const { searchParams } =
      new URL(
        request.url
      );

    const tipo =
      searchParams
        .get("tipo")
        ?.trim()
        .toLowerCase();

    // ========================================================
    // PROVINCIAS
    // ========================================================

    if (
      tipo ===
      "provincias"
    ) {
      const params =
        new URLSearchParams({
          max: "50",
          orden:
            "nombre",
        });

      const data =
        (await georefFetch(
          "provincias",
          params
        )) as {
          provincias?:
            GeorefProvince[];
        };

      const provinces =
        (
          data.provincias ??
          []
        )
          .filter(
            (
              province
            ) =>
              Boolean(
                province.id &&
                  province.nombre
              )
          )
          .map(
            (
              province
            ) => ({
              id:
                province.id as string,

              name:
                province.nombre as string,

              lat:
                typeof province
                  .centroide
                  ?.lat ===
                "number"
                  ? province
                      .centroide
                      .lat
                  : null,

              lng:
                typeof province
                  .centroide
                  ?.lon ===
                "number"
                  ? province
                      .centroide
                      .lon
                  : null,
            })
          )
          .sort(
            (
              a,
              b
            ) =>
              a.name.localeCompare(
                b.name,
                "es"
              )
          );

      return NextResponse.json({
        ok: true,
        provinces,
      });
    }

    // ========================================================
    // LOCALIDADES
    // ========================================================

    if (
      tipo ===
      "localidades"
    ) {
      const provinceId =
        searchParams
          .get(
            "provinciaId"
          )
          ?.trim();

      const q =
        searchParams
          .get("q")
          ?.trim() ??
        "";

      // ------------------------------------------------------
      // PROVINCIA OBLIGATORIA
      // ------------------------------------------------------

      if (!provinceId) {
        return NextResponse.json(
          {
            error:
              "Primero seleccioná una provincia.",
          },
          {
            status: 400,
          }
        );
      }

      // ------------------------------------------------------
      // ESPERAMOS 2 LETRAS
      // ------------------------------------------------------

      if (
        q.length < 2
      ) {
        return NextResponse.json({
          ok: true,
          localities: [],
        });
      }

      // ------------------------------------------------------
      // CARGAMOS TODAS LAS LOCALIDADES
      // DE LA PROVINCIA.
      //
      // GeoRef recomienda justamente
      // filtrar localidades mediante
      // el parámetro provincia.
      // ------------------------------------------------------

      const params =
        new URLSearchParams({
          provincia:
            provinceId,

          max:
            "5000",
        });

      const data =
        (await georefFetch(
          "localidades",
          params
        )) as {
          localidades?:
            GeorefLocality[];
        };

      const normalizedQuery =
        normalizeText(q);

      // ------------------------------------------------------
      // FILTRO TIPO LUPA / AUTOCOMPLETE
      // ------------------------------------------------------

      const localities =
        (
          data.localidades ??
          []
        )
          .filter(
            (
              locality
            ) => {
              if (
                !locality.id ||
                !locality.nombre
              ) {
                return false;
              }

              const normalizedName =
                normalizeText(
                  locality.nombre
                );

              return normalizedName.includes(
                normalizedQuery
              );
            }
          )
          // Primero mostramos
          // las que empiezan
          // exactamente con lo escrito.
          .sort(
            (
              a,
              b
            ) => {
              const aName =
                normalizeText(
                  a.nombre ??
                    ""
                );

              const bName =
                normalizeText(
                  b.nombre ??
                    ""
                );

              const aStarts =
                aName.startsWith(
                  normalizedQuery
                );

              const bStarts =
                bName.startsWith(
                  normalizedQuery
                );

              if (
                aStarts &&
                !bStarts
              ) {
                return -1;
              }

              if (
                !aStarts &&
                bStarts
              ) {
                return 1;
              }

              return (
                a.nombre ??
                ""
              ).localeCompare(
                b.nombre ??
                  "",
                "es"
              );
            }
          )
          .slice(
            0,
            12
          )
          .map(
            (
              locality
            ) => ({
              id:
                locality.id as string,

              name:
                locality.nombre as string,

              provinceId:
                locality
                  .provincia
                  ?.id ??
                provinceId,

              provinceName:
                locality
                  .provincia
                  ?.nombre ??
                null,

              lat:
                typeof locality
                  .centroide
                  ?.lat ===
                "number"
                  ? locality
                      .centroide
                      .lat
                  : null,

              lng:
                typeof locality
                  .centroide
                  ?.lon ===
                "number"
                  ? locality
                      .centroide
                      .lon
                  : null,
            })
          );

      return NextResponse.json({
        ok: true,

        localities,
      });
    }

    // ========================================================
    // TIPO INCORRECTO
    // ========================================================

    return NextResponse.json(
      {
        error:
          "Tipo de consulta inválido.",
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    console.error(
      "GET /api/ubicaciones",
      error
    );

    return NextResponse.json(
      {
        error:
          "No se pudieron cargar las ubicaciones.",
      },
      {
        status: 500,
      }
    );
  }
}