import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { createAdminClient } from "../../../lib/supabase/admin";
import { getAppBaseUrl } from "../../../lib/mercadopago/server";
import EventCheckout from "./event-checkout";
import FallbackImage from "./fallback-image";

// Esta pagina se comparte activamente por WhatsApp/Instagram (es el flujo
// de venta principal) -- sin esto, todos los eventos indexaban con el
// mismo titulo/descripcion generico de la landing, y pegar el link no
// generaba ninguna preview con el nombre/fecha/imagen del evento.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("name, description, starts_at, venue_name, city, banner_horizontal_path, banner_square_path")
    .eq("slug", slug)
    .maybeSingle();

  if (!event) {
    return { title: "Evento no encontrado · Capital Pass" };
  }

  const dateLabel = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(event.starts_at));

  const place = [event.venue_name, event.city].filter(Boolean).join(", ");
  const description =
    event.description?.trim() ||
    `${dateLabel}${place ? ` · ${place}` : ""}. Comprá tu entrada online con Capital Pass.`;

  const imagePath = event.banner_horizontal_path || event.banner_square_path;
  const imageUrl = imagePath ? admin.storage.from("event-assets").getPublicUrl(imagePath).data.publicUrl : null;
  const pageUrl = `${getAppBaseUrl()}/e/${slug}`;

  return {
    title: `${event.name} · Capital Pass`,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: event.name,
      description,
      url: pageUrl,
      siteName: "Capital Pass",
      type: "website",
      locale: "es_AR",
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: event.name,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;

  const admin =
    createAdminClient();

  const {
    data: event,
    error,
  } = await admin
    .from("events")
    .select(`
      id,
      organization_id,
      name,
      description,
      starts_at,
      venue_name,
      city,
      status,
      banner_horizontal_path,
      banner_square_path,
      banner_vertical_path
    `)
    .eq("slug", slug)
    .maybeSingle();

  if (error || !event) {
    notFound();
  }

  const { data: ticketTypes } =
    await admin
      .from("ticket_types")
      .select(`
        id,
        name,
        description,
        price_minor,
        status,
        active
      `)
      .eq("event_id", event.id)
      .eq("active", true)
      .order("created_at", {
        ascending: true,
      });

  const { data: packRows } = await admin
    .from("ticket_packs")
    .select(`
      id,
      name,
      quantity_per_pack,
      price_minor,
      active,
      ticket_type_id,
      ticket_types ( name, status, active )
    `)
    .eq("event_id", event.id)
    .eq("active", true)
    .order("price_minor", { ascending: true });

  const { data: mpAccount } = await admin
    .from("organization_mercadopago_accounts")
    .select("organization_id")
    .eq("organization_id", event.organization_id)
    .maybeSingle();

  const canBuyOnline = Boolean(mpAccount);

  const date =
    new Intl.DateTimeFormat(
      "es-AR",
      {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone:
          "America/Argentina/Buenos_Aires",
      }
    ).format(
      new Date(
        event.starts_at
      )
    );

  // ==========================================================
  // IDENTIDAD VISUAL
  // ==========================================================

  const bannerHorizontalUrl =
    getAssetPublicUrl(
      admin,
      event.banner_horizontal_path
    );

  const bannerSquareUrl =
    getAssetPublicUrl(
      admin,
      event.banner_square_path
    );

  const bannerVerticalUrl =
    getAssetPublicUrl(
      admin,
      event.banner_vertical_path
    );

  const mobileHeroUrl =
    bannerVerticalUrl ??
    bannerSquareUrl ??
    bannerHorizontalUrl;

  const desktopHeroUrl =
    bannerHorizontalUrl ??
    bannerSquareUrl ??
    bannerVerticalUrl;

  const hasVisualIdentity =
    Boolean(
      bannerHorizontalUrl ||
        bannerSquareUrl ||
        bannerVerticalUrl
    );

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">

      {/* ======================================================
          FONDO — luz arriba-izquierda, hereda el lenguaje de la marca
      ====================================================== */}

      <div className="pointer-events-none fixed inset-0">

        <div className="absolute left-[-280px] top-[-260px] h-[700px] w-[700px] rounded-full bg-[#ff2a1a]/[0.12] blur-[190px]" />

        <div className="absolute bottom-[-280px] right-[-220px] h-[650px] w-[650px] rounded-full bg-[#ff5a2a]/[0.08] blur-[180px]" />

        <div className="absolute left-1/2 top-[30%] h-[720px] w-[300px] -translate-x-1/2 rotate-[22deg] bg-gradient-to-b from-[#ff2a1a]/[0.045] via-[#ff5a2a]/[0.03] to-transparent blur-[100px]" />

      </div>

      <div className="relative z-10">

        {/* ====================================================
            NAV / MARCA
        ==================================================== */}

        <header className="border-b border-white/[0.07] bg-black/80 backdrop-blur-2xl">

          <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-5 md:px-8 xl:px-10">

            <div className="flex items-center gap-3">

              <div className="relative h-11 w-11 overflow-hidden">
                <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_24px_rgba(255,59,36,.25)]" />
                <div className="absolute inset-[7px] rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.6),transparent_35%)]" />
              </div>

              <div>

                <p className="font-semibold">
                  Capital Pass
                </p>

                <p className="text-xs text-white/30">
                  Evento oficial
                </p>

              </div>

            </div>

            <span className="rounded-full border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#ff9b82]">
              Ticketing oficial
            </span>

          </div>

        </header>

        {/* ====================================================
            HERO VISUAL
        ==================================================== */}

        <div className="mx-auto max-w-[1400px] px-5 pt-7 md:px-8 md:pt-10 xl:px-10">

          {hasVisualIdentity ? (

            <section className="relative overflow-hidden rounded-[30px] border border-[#ff5a2a]/[0.18] bg-[#0b0806] shadow-[0_35px_120px_rgba(255,42,26,.14),inset_0_1px_0_rgba(255,255,255,.05)]">

              {/* DESKTOP / TABLET */}
              {desktopHeroUrl && (

                <FallbackImage
                  src={
                    desktopHeroUrl
                  }
                  alt={`Banner de ${event.name}`}
                  className="hidden aspect-[8/3] w-full object-cover md:block"
                />

              )}

              {/* MOBILE */}
              {mobileHeroUrl && (

                <FallbackImage
                  src={
                    mobileHeroUrl
                  }
                  alt={`Portada de ${event.name}`}
                  className="aspect-[4/5] w-full object-cover md:hidden"
                />

              )}

              {/* CAPA GLOSSY */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-white/[0.035]" />

              <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

              <div className="absolute left-5 top-5 md:left-7 md:top-7">

                <span className="inline-flex rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-xl">
                  {formatStatus(
                    event.status
                  )}
                </span>

              </div>

            </section>

          ) : (

            <section className="relative overflow-hidden rounded-[30px] border border-[#ff5a2a]/[0.16] bg-gradient-to-br from-[#ff3b24]/[0.14] via-[#0b0806] to-[#ff5a2a]/[0.06] px-7 py-20 text-center shadow-[0_35px_120px_rgba(255,42,26,.12)] md:py-28">

              <div className="pointer-events-none absolute right-[-80px] top-[-120px] h-72 w-72 rounded-full bg-[#ff2a1a]/[0.16] blur-[90px]" />

              <div className="pointer-events-none absolute bottom-[-140px] left-[-80px] h-72 w-72 rounded-full bg-[#ff5a2a]/[0.10] blur-[110px]" />

              <p className="relative text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ff9b82]">
                Capital Pass
              </p>

              <h1 className="relative mt-4 text-4xl font-black uppercase tracking-tight md:text-6xl">
                {event.name}
              </h1>

            </section>

          )}

        </div>

        {/* ====================================================
            INFO PRINCIPAL
        ==================================================== */}

        <div className="mx-auto max-w-[1400px] px-5 pb-16 pt-7 md:px-8 md:pt-9 xl:px-10">

          <section className="grid gap-6 lg:grid-cols-[1fr_320px]">

            <div className="relative overflow-hidden rounded-[30px] border border-[#ff5a2a]/[0.15] bg-gradient-to-br from-[#ff3b24]/[0.08] via-[#09080a]/95 to-[#ff5a2a]/[0.035] p-6 shadow-[0_24px_90px_rgba(255,42,26,.10),inset_0_1px_0_rgba(255,255,255,.045)] backdrop-blur-2xl md:p-8">

              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.035] to-transparent" />

              <div className="relative">

                <div className="inline-flex rounded-full border border-[#ff5a2a]/25 bg-[#ff3b24]/[0.09] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#ff9b82]">
                  {formatStatus(
                    event.status
                  )}
                </div>

                <h1 className="mt-5 text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-6xl">
                  {event.name}
                </h1>

                <p className="mt-5 text-base capitalize text-white/55 md:text-lg">
                  {date}
                </p>

                <p className="mt-2 text-xs font-medium uppercase tracking-[0.13em] text-white/30">
                  {[
                    event.venue_name,
                    event.city,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>

                {event.description && (

                  <p className="mt-7 max-w-3xl text-sm leading-7 text-white/45 md:text-base">
                    {
                      event.description
                    }
                  </p>

                )}

              </div>

            </div>

            {/* PORTADA CUADRADA COMO IDENTIDAD SECUNDARIA */}
            <aside className="hidden lg:block">

              {bannerSquareUrl ? (

                <div className="overflow-hidden rounded-[30px] border border-[#ff5a2a]/[0.15] bg-[#0b0806] shadow-[0_24px_90px_rgba(255,42,26,.10)]">

                  <FallbackImage
                    src={
                      bannerSquareUrl
                    }
                    alt={`Portada de ${event.name}`}
                    className="aspect-square w-full object-cover"
                  />

                </div>

              ) : (

                <div className="flex aspect-square items-center justify-center rounded-[30px] border border-[#ff5a2a]/[0.13] bg-gradient-to-br from-[#ff3b24]/[0.09] via-[#0b0806] to-[#ff5a2a]/[0.04] p-8 text-center">

                  <div>

                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ff9b82]/70">
                      Capital Pass
                    </p>

                    <p className="mt-3 text-2xl font-black uppercase">
                      {
                        event.name
                      }
                    </p>

                  </div>

                </div>

              )}

            </aside>

          </section>

          {/* ==================================================
              ENTRADAS
          ================================================== */}

          <section className="mt-10">

            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">

              <div>

                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ff6f4d]">
                  Entradas
                </p>

                <h2 className="mt-2 text-2xl font-semibold">
                  Elegí tu entrada
                </h2>

              </div>

              <p className="text-xs text-white/25">
                Precios expresados en ARS
              </p>

            </div>

            <EventCheckout
              slug={slug}
              canBuyOnline={canBuyOnline}
              ticketTypes={(ticketTypes ?? []).map((ticket) => ({
                id: ticket.id,
                name: ticket.name,
                description: ticket.description,
                priceMinor: Number(ticket.price_minor),
                status: ticket.status,
                active: ticket.active,
              }))}
              packs={(packRows ?? []).map((pack) => {
                const ticketType = Array.isArray(pack.ticket_types) ? pack.ticket_types[0] : pack.ticket_types;
                return {
                  id: pack.id,
                  name: pack.name,
                  quantityPerPack: pack.quantity_per_pack,
                  priceMinor: Number(pack.price_minor),
                  ticketTypeId: pack.ticket_type_id,
                  ticketTypeName: ticketType?.name ?? "",
                  available: Boolean(ticketType?.active && ticketType?.status === "available"),
                };
              })}
            />

          </section>

          <footer className="mt-16 border-t border-white/[0.07] pt-7 text-center">

            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/20">
              Capital Pass · Acceso digital
            </p>

          </footer>

        </div>

      </div>

    </main>
  );
}

// ============================================================
// STORAGE
// ============================================================

function getAssetPublicUrl(
  admin: ReturnType<
    typeof createAdminClient
  >,
  path: string | null
) {
  if (!path) {
    return null;
  }

  return admin.storage
    .from("event-assets")
    .getPublicUrl(path)
    .data.publicUrl;
}

// ============================================================
// FORMATTERS
// ============================================================

function formatStatus(
  status: string
) {
  if (status === "active")
    return "Evento activo";

  if (status === "upcoming")
    return "Próximamente";

  if (status === "finished")
    return "Finalizado";

  if (status === "cancelled")
    return "Cancelado";

  return "Evento";
}
