import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import AdministrarButton from "./administrar-button";

type EventRow = {
  id: string;
  name: string;
  slug: string | null;
  starts_at: string | null;
  venue_name: string | null;
  city: string | null;
  status: string;
  banner_square_path: string | null;
  banner_horizontal_path: string | null;
};

export default async function EventosPage() {
  const supabase =
    await createClient();

  // =========================================================
  // USUARIO
  // =========================================================

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // =========================================================
  // ORGANIZACIÓN
  // =========================================================

  const {
    data: membership,
  } = await supabase
    .from("organization_members")
    .select(`
      organization_id
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
    redirect("/login");
  }

  // =========================================================
  // EVENTOS
  // =========================================================

  const {
    data,
    error,
  } = await supabase
    .from("events")
    .select(`
      id,
      name,
      slug,
      starts_at,
      venue_name,
      city,
      status,
      banner_square_path,
      banner_horizontal_path
    `)
    .eq(
      "organization_id",
      membership.organization_id
    )
    .order(
      "starts_at",
      {
        ascending: false,
      }
    );

  const events =
    (data ?? []) as EventRow[];

  // =========================================================
  // INTERFAZ
  // =========================================================

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-[#f7f3ed]">

      {/* =====================================================
          FONDO
      ===================================================== */}

      <div className="pointer-events-none fixed inset-0">

        <div className="absolute -left-[250px] -top-[240px] h-[620px] w-[620px] rounded-full bg-[#ff2a1a]/10 blur-[180px]" />

        <div className="absolute -right-[240px] top-[25%] h-[600px] w-[600px] rounded-full bg-[#ff5a2a]/[0.08] blur-[190px]" />

        <div className="absolute bottom-[-300px] left-[30%] h-[500px] w-[500px] rounded-full bg-[#ff3b24]/[0.05] blur-[180px]" />

      </div>

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="relative z-10 border-b border-white/[0.07] bg-black/70 backdrop-blur-2xl">

        <div className="mx-auto flex min-h-[82px] max-w-[1400px] items-center justify-between gap-5 px-5 py-4 md:px-8">

          <div className="flex items-center gap-4">

            <Link
              href="/panel"
              className="flex h-11 w-11 items-center justify-center border border-white/[0.09] bg-white/[0.025] text-lg text-white/45 transition hover:border-[#ff5a2a]/40 hover:bg-[#ff2a1a]/[0.07] hover:text-white"
            >
              ←
            </Link>

            <div>

              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff6b4a]">
                Capital Pass
              </p>

              <h1 className="mt-1 text-xl font-black uppercase tracking-[-0.03em]">
                Mis eventos
              </h1>

            </div>

          </div>

          <div className="border border-white/[0.08] bg-white/[0.025] px-4 py-2.5">

            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-white/35">
              {events.length}{" "}
              {events.length === 1
                ? "evento"
                : "eventos"}
            </p>

          </div>

        </div>

      </header>

      {/* =====================================================
          CONTENIDO
      ===================================================== */}

      <div className="relative z-10 mx-auto max-w-[1400px] px-5 py-10 md:px-8 md:py-14">

        {/* CABECERA */}

        <div className="mb-10 flex flex-col justify-between gap-7 lg:flex-row lg:items-end">

          <div className="max-w-[820px]">

            <p className="text-[10px] font-black uppercase tracking-[0.23em] text-[#ff6040]">
              Event manager
            </p>

            <h2 className="mt-4 text-[44px] font-black uppercase leading-[0.86] tracking-[-0.065em] sm:text-[64px] lg:text-[78px]">

              Todos tus

              <span className="block bg-gradient-to-r from-[#fff5ef] via-[#ff9c7f] to-[#ff3b24] bg-clip-text text-transparent">
                eventos.
              </span>

            </h2>

            <p className="mt-6 max-w-xl text-sm leading-6 text-white/35">
              Administrá cada evento de manera independiente desde un solo lugar.
            </p>

          </div>

          <Link
            href="/panel/eventos/nuevo"
            className="flex h-13 items-center justify-center gap-3 bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-6 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-[0_12px_45px_rgba(255,42,26,.20)] transition hover:brightness-110"
          >
            <span className="text-base">
              +
            </span>

            Crear evento
          </Link>

        </div>

        {/* ERROR */}

        {error && (

          <div className="border border-red-500/30 bg-red-500/[0.06] p-5 text-sm text-red-200">
            No se pudieron cargar los eventos.
          </div>

        )}

        {/* SIN EVENTOS */}

        {!error &&
          events.length === 0 && (

          <div className="border border-white/[0.08] bg-[#0a0908] p-10">

            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff6040]">
              Capital Pass
            </p>

            <h3 className="mt-4 text-3xl font-black uppercase tracking-[-0.04em]">
              Todavía no creaste eventos.
            </h3>

            <p className="mt-3 text-sm text-white/35">
              Creá tu primer evento para comenzar a configurar entradas, RRPP y ventas.
            </p>

            <Link
              href="/panel/eventos/nuevo"
              className="mt-7 inline-flex bg-[#ff3b24] px-6 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#ff5a2a]"
            >
              + Crear evento
            </Link>

          </div>

        )}

        {/* =================================================
            GRID EVENTOS
        ================================================= */}

        {!error &&
          events.length > 0 && (

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

            {events.map(
              (
                event,
                index
              ) => {

                const imagePath =
                  event.banner_square_path ??
                  event.banner_horizontal_path;

                const imageUrl =
                  imagePath
                    ? supabase.storage
                        .from(
                          "event-assets"
                        )
                        .getPublicUrl(
                          imagePath
                        )
                        .data
                        .publicUrl
                    : null;

                return (

                  <article
                    key={
                      event.id
                    }
                    className="group relative overflow-hidden border border-white/[0.09] bg-[#0a0908] transition duration-300 hover:border-[#ff5a2a]/25"
                  >

                    {/* IMAGEN */}

                    <div className="relative aspect-[16/9] overflow-hidden border-b border-white/[0.07] bg-[#120806]">

                      {imageUrl ? (

                        <img
                          src={
                            imageUrl
                          }
                          alt={
                            event.name
                          }
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
                        />

                      ) : (

                        <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_75%_20%,rgba(255,90,42,.20),transparent_32%),linear-gradient(135deg,#160806,#070707_70%)]">

                          <div className="text-center">

                            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#ff6040]/70">
                              Capital Pass
                            </p>

                            <p className="mt-2 text-2xl font-black uppercase tracking-[-0.04em] text-white/20">
                              {
                                event.name
                              }
                            </p>

                          </div>

                        </div>

                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                      {/* NÚMERO */}

                      <div className="absolute bottom-4 left-4">

                        <span className="text-[10px] font-black tracking-[0.2em] text-[#ff7051]">
                          {String(
                            index + 1
                          ).padStart(
                            2,
                            "0"
                          )}
                        </span>

                      </div>

                      {/* ESTADO */}

                      <div
                        className={`absolute right-4 top-4 border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] backdrop-blur-xl ${statusStyle(
                          event.status
                        )}`}
                      >
                        {
                          statusLabel(
                            event.status
                          )
                        }
                      </div>

                    </div>

                    {/* INFORMACIÓN */}

                    <div className="p-5">

                      <h3 className="text-2xl font-black uppercase leading-[0.95] tracking-[-0.04em]">
                        {
                          event.name
                        }
                      </h3>

                      <div className="mt-5 space-y-2 border-l border-[#ff3b24]/30 pl-4">

                        <p className="text-xs font-semibold text-white/55">
                          {
                            formatDate(
                              event.starts_at
                            )
                          }
                        </p>

                        <p className="text-xs text-white/30">

                          {
                            [
                              event.venue_name,
                              event.city,
                            ]
                              .filter(
                                Boolean
                              )
                              .join(
                                " · "
                              ) ||
                            "Ubicación sin definir"
                          }

                        </p>

                      </div>

                      {/* ACCIONES */}

                      <div className="mt-7 grid gap-2 sm:grid-cols-3">

                        <AdministrarButton eventId={event.id} />

                        <Link
                          href={`/panel/evento?eventId=${event.id}`}
                          className="flex h-11 items-center justify-between border border-white/[0.09] bg-white/[0.02] px-4 text-[9px] font-black uppercase tracking-[0.13em] text-white/45 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                        >

                          <span>
                            Configurar
                          </span>

                          <span className="text-sm">
                            →
                          </span>

                        </Link>

                        {event.slug ? (

                          <Link
                            href={`/e/${event.slug}`}
                            target="_blank"
                            className="flex h-11 items-center justify-between border border-white/[0.09] bg-white/[0.02] px-4 text-[9px] font-black uppercase tracking-[0.13em] text-white/45 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                          >

                            <span>
                              Ver público
                            </span>

                            <span className="text-sm">
                              ↗
                            </span>

                          </Link>

                        ) : (

                          <div className="flex h-11 items-center border border-white/[0.06] px-4 text-[9px] font-bold uppercase tracking-[0.12em] text-white/15">
                            Sin página pública
                          </div>

                        )}

                      </div>

                    </div>

                  </article>

                );
              }
            )}

          </div>

        )}

      </div>

    </main>
  );
}

// =========================================================
// ESTADO
// =========================================================

function statusLabel(
  status: string
) {
  switch (
    status
  ) {
    case "draft":
      return "Borrador";

    case "upcoming":
      return "Próximo";

    case "active":
      return "Activo";

    case "finished":
      return "Finalizado";

    case "cancelled":
      return "Cancelado";

    default:
      return status;
  }
}

function statusStyle(
  status: string
) {
  switch (
    status
  ) {
    case "active":
      return "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200";

    case "upcoming":
      return "border-[#ff5a2a]/30 bg-[#ff5a2a]/[0.08] text-[#ff9b7f]";

    case "finished":
      return "border-white/[0.10] bg-black/50 text-white/40";

    case "cancelled":
      return "border-red-400/25 bg-red-400/[0.08] text-red-300";

    default:
      return "border-white/[0.10] bg-black/50 text-white/40";
  }
}

// =========================================================
// FECHA
// =========================================================

function formatDate(
  value: string | null
) {
  if (!value) {
    return "Fecha sin definir";
  }

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      weekday:
        "short",

      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric",

      hour:
        "2-digit",

      minute:
        "2-digit",

      timeZone:
        "America/Argentina/Buenos_Aires",
    }
  ).format(
    new Date(
      value
    )
  );
}