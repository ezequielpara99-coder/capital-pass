import QRCode from "qrcode";
import { notFound } from "next/navigation";

import { createAdminClient } from "../../../lib/supabase/admin";
import {
  createTicketQRPayload,
  verifyTicketSignature,
} from "../../../lib/tickets/signature";

type PageProps = {
  params: Promise<{
    ticketId: string;
  }>;

  searchParams: Promise<{
    s?: string | string[];
  }>;
};

function formatTicketNumber(value: number | string) {
  return String(value).padStart(7, "0");
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDni(value: string | null) {
  if (!value) return "No informado";

  const onlyNumbers = value.replace(/\D/g, "");

  if (onlyNumbers.length < 7) {
    return value;
  }

  return new Intl.NumberFormat("es-AR").format(
    Number(onlyNumbers)
  );
}

export default async function EntradaPage({
  params,
  searchParams,
}: PageProps) {
  const { ticketId } = await params;
  const query = await searchParams;

  const signature =
    typeof query.s === "string"
      ? query.s
      : "";

  // =====================================================
  // 1. VALIDAR FIRMA DEL LINK
  // =====================================================

  if (
    !ticketId ||
    !signature ||
    !verifyTicketSignature(ticketId, signature)
  ) {
    notFound();
  }

  const admin = createAdminClient();

  // =====================================================
  // 2. BUSCAR TICKET
  // =====================================================

  const {
    data: ticket,
    error: ticketError,
  } = await admin
    .from("tickets")
    .select(
      `
        id,
        display_number,
        sale_id,
        event_id,
        ticket_type_id,
        manual_code,
        status,
        issued_at,
        used_at
      `
    )
    .eq("id", ticketId)
    .maybeSingle();

  if (ticketError || !ticket) {
    notFound();
  }

  // =====================================================
  // 3. VENTA → COMPRADOR
  // =====================================================

  const {
    data: sale,
    error: saleError,
  } = await admin
    .from("sales")
    .select("buyer_id")
    .eq("id", ticket.sale_id)
    .maybeSingle();

  if (saleError || !sale) {
    notFound();
  }

  const {
    data: buyer,
    error: buyerError,
  } = await admin
    .from("buyers")
    .select(
      "first_name, last_name, dni, phone"
    )
    .eq("id", sale.buyer_id)
    .maybeSingle();

  if (buyerError || !buyer) {
    notFound();
  }

  // =====================================================
  // 4. EVENTO
  // =====================================================

  const {
    data: event,
    error: eventError,
  } = await admin
    .from("events")
    .select(
      `
        name,
        starts_at,
        venue_name,
        city,
        ticket_design_mode,
        ticket_background_path
      `
    )
    .eq("id", ticket.event_id)
    .maybeSingle();

  if (eventError || !event) {
    notFound();
  }

  const customTicketBackgroundUrl =
    event.ticket_design_mode === "custom" &&
    event.ticket_background_path
      ? admin.storage
          .from("event-assets")
          .getPublicUrl(
            event.ticket_background_path
          ).data.publicUrl
      : null;

  const useCustomTicket =
    Boolean(customTicketBackgroundUrl);

  // =====================================================
  // 5. TIPO DE ENTRADA
  // =====================================================

  const {
    data: ticketType,
    error: ticketTypeError,
  } = await admin
    .from("ticket_types")
    .select("name")
    .eq("id", ticket.ticket_type_id)
    .maybeSingle();

  if (ticketTypeError || !ticketType) {
    notFound();
  }

  // =====================================================
  // 6. QR SEGURO
  // =====================================================

  const qrPayload =
    createTicketQRPayload(ticket.id);

  const qrDataUrl = await QRCode.toDataURL(
    qrPayload,
    {
      width: 900,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#050505",
        light: "#ffffff",
      },
    }
  );

  const isUsed =
    ticket.status === "used" ||
    Boolean(ticket.used_at);

  const isCancelled =
    ticket.status === "cancelled";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050308] px-4 py-8 text-white sm:px-6">
      {/* FONDO */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-48 -top-44 h-[600px] w-[600px] rounded-full bg-[#ff2a1a]/[0.14] blur-[150px]" />

        <div className="absolute -right-40 top-[20%] h-[550px] w-[550px] rounded-full bg-[#ff5a2a]/[0.12] blur-[150px]" />

        <div className="absolute bottom-[-250px] left-[20%] h-[650px] w-[650px] rounded-full bg-[#ff3b24]/[0.10] blur-[160px]" />

        <div className="absolute left-1/2 top-[35%] h-[900px] w-[420px] -translate-x-1/2 rotate-[20deg] bg-gradient-to-b from-[#ff2a1a]/10 via-[#ff5a2a]/10 to-transparent blur-[90px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[620px]">
        {/* LOGO */}
        <header className="mb-7 flex items-center justify-center gap-4">
          <div className="relative h-16 w-16 overflow-hidden">
            <div className="absolute inset-[7px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_35px_rgba(255,59,36,.3)]" />
            <div className="absolute inset-[11px] rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.6),transparent_35%)]" />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Capital Pass
            </h1>

            <p className="mt-1 text-xs uppercase tracking-[0.24em] text-white/40">
              Acceso digital
            </p>
          </div>
        </header>

        {/* EVENTO SUPERIOR */}
        <div className="relative z-20 mx-auto -mb-7 w-[88%] rounded-full border border-[#ff5a2a]/30 bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] px-6 py-4 text-center shadow-[0_0_45px_rgba(255,59,36,.3)]">
          <p className="text-lg font-black uppercase tracking-wide">
            {event.name}
          </p>

          <p className="mt-1 text-[10px] uppercase tracking-[0.28em] text-white/75">
            {[event.city, event.venue_name]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {/* TICKET */}
        {useCustomTicket ? (
          <>
            <article className="overflow-hidden rounded-[34px] border border-[#ff5a2a]/25 bg-black shadow-[0_0_80px_rgba(255,59,36,.22)]">
              <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
                <img
                  src={customTicketBackgroundUrl!}
                  alt={`Entrada de ${event.name}`}
                  className="absolute inset-0 h-full w-full object-cover"
                />

                {/* =================================================
                    ZONA RESERVADA DE DATOS
                    Coincide con la plantilla 1080 x 1920
                ================================================= */}
                <div className="absolute inset-x-0 bottom-0 min-h-[28.2%] border-t border-white/10 bg-black/[0.86] px-[5.5%] py-[4.5%] backdrop-blur-md">
                  <div className="grid grid-cols-[1fr_30%] gap-[5%]">
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40 sm:text-[10px]">
                        Nombre y apellido
                      </p>

                      <p className="mt-1 truncate text-base font-black uppercase tracking-tight sm:text-lg">
                        {buyer.first_name} {buyer.last_name}
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/35 sm:text-[9px]">
                            DNI
                          </p>

                          <p className="mt-1 text-xs font-bold sm:text-sm">
                            {formatDni(buyer.dni)}
                          </p>
                        </div>

                        <div>
                          <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/35 sm:text-[9px]">
                            Entrada
                          </p>

                          <p className="mt-1 truncate text-xs font-bold text-[#ff9b82] sm:text-sm">
                            {ticketType.name}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 border-t border-white/10 pt-3">
                        <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/35 sm:text-[9px]">
                          Código manual
                        </p>

                        <p className="mt-1 font-mono text-sm font-black tracking-[0.08em] sm:text-base">
                          {ticket.manual_code}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center">
                      <div className="w-full rounded-[14px] bg-white p-[7%] shadow-[0_0_35px_rgba(255,59,36,.14)]">
                        <img
                          src={qrDataUrl}
                          alt="Código QR de la entrada"
                          className="h-auto w-full"
                        />
                      </div>

                      <p className="mt-2 text-center text-[7px] font-semibold uppercase tracking-[0.14em] text-white/35 sm:text-[8px]">
                        QR de acceso
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </article>

            {/* ESTADO FUERA DEL DISEÑO */}
            {isUsed && (
              <div className="mt-5 rounded-2xl border border-orange-400/25 bg-orange-500/10 px-5 py-4 text-center">
                <p className="text-sm font-bold text-orange-200">
                  ESTA ENTRADA YA FUE UTILIZADA
                </p>

                {ticket.used_at && (
                  <p className="mt-1 text-xs text-white/40">
                    Ingreso registrado el{" "}
                    {formatEventDate(ticket.used_at)}
                  </p>
                )}
              </div>
            )}

            {isCancelled && (
              <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 px-5 py-4 text-center">
                <p className="text-sm font-bold text-red-300">
                  ENTRADA ANULADA
                </p>
              </div>
            )}

            <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.035] px-5 py-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
                    Fecha y hora
                  </p>

                  <p className="mt-2 text-sm font-semibold">
                    {formatEventDate(
                      event.starts_at
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
                    Entrada Nº
                  </p>

                  <p className="mt-2 text-sm font-semibold">
                    #
                    {formatTicketNumber(
                      ticket.display_number
                    )}
                  </p>
                </div>
              </div>
            </div>

            <footer className="mt-6 text-center">
              <p className="text-[9px] uppercase tracking-[0.3em] text-white/25">
                Capital Pass · Acceso digital
              </p>
            </footer>
          </>
        ) : (
          <article className="rounded-[38px] border border-[#ff5a2a]/30 bg-[#0e0806]/90 px-5 pb-7 pt-14 shadow-[0_0_80px_rgba(255,59,36,.20)] backdrop-blur-2xl sm:px-8">
            <section className="text-center">
              <h2 className="text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-5xl">
                Escaneá
                <br />
                este QR
              </h2>

              <div className="mx-auto mt-5 inline-flex rounded-full border border-[#ff5a2a]/60 px-6 py-2 text-xs font-medium uppercase tracking-[0.16em] text-white/75">
                Para acceder al evento
              </div>
            </section>

            {/* QR */}
            <div className="mx-auto mt-7 max-w-[430px] rounded-[30px] bg-white p-5 shadow-[0_0_55px_rgba(255,59,36,.18)]">
              <img
                src={qrDataUrl}
                alt="Código QR de la entrada"
                className="h-auto w-full"
              />
            </div>

            {/* ESTADO */}
            {isUsed && (
              <div className="mt-5 rounded-2xl border border-orange-400/25 bg-orange-500/10 px-5 py-4 text-center">
                <p className="text-sm font-bold text-orange-200">
                  ESTA ENTRADA YA FUE UTILIZADA
                </p>

                {ticket.used_at && (
                  <p className="mt-1 text-xs text-white/40">
                    Ingreso registrado el{" "}
                    {formatEventDate(ticket.used_at)}
                  </p>
                )}
              </div>
            )}

            {isCancelled && (
              <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 px-5 py-4 text-center">
                <p className="text-sm font-bold text-red-300">
                  ENTRADA ANULADA
                </p>
              </div>
            )}

            {/* DATOS DEL COMPRADOR */}
            <section className="mt-6 overflow-hidden rounded-[26px] border border-[#ff5a2a]/25 bg-black/20 px-5 py-2">
              <DataRow
                icon="♙"
                label="Nombre"
                value={`${buyer.first_name} ${buyer.last_name}`}
              />

              <DataRow
                icon="▣"
                label="DNI"
                value={formatDni(buyer.dni)}
              />

              <DataRow
                icon="☎"
                label="Teléfono"
                value={
                  buyer.phone ||
                  "No informado"
                }
              />

              <DataRow
                icon="◇"
                label="Entrada"
                value={ticketType.name}
                last
              />
            </section>

            {/* DATOS EVENTO */}
            <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.035] px-5 py-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
                    Fecha y hora
                  </p>

                  <p className="mt-2 text-sm font-semibold">
                    {formatEventDate(
                      event.starts_at
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
                    Entrada Nº
                  </p>

                  <p className="mt-2 text-sm font-semibold">
                    #
                    {formatTicketNumber(
                      ticket.display_number
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* CÓDIGO MANUAL */}
            <section className="mt-5 rounded-[26px] border border-[#ff5a2a]/30 bg-gradient-to-r from-[#ff3b24]/[0.10] to-[#ff5a2a]/[0.08] px-5 py-5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#ff9b82]">
                Código de validación
              </p>

              <p className="mt-3 font-mono text-2xl font-black tracking-[0.12em] text-white sm:text-3xl">
                {ticket.manual_code}
              </p>

              <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-white/35">
                Si el QR no puede escanearse, mostrale
                este código al personal de ingreso.
              </p>
            </section>

            <footer className="mt-7 text-center">
              <p className="text-sm font-medium uppercase tracking-[0.26em] text-white/75">
                Nos vemos en {event.name}
              </p>

              <p className="mt-2 text-[9px] uppercase tracking-[0.32em] text-white/25">
                Capital Pass · Acceso digital
              </p>
            </footer>
          </article>
        )}

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.25em] text-white/20">
          Presentá esta entrada al ingresar
        </p>
      </div>
    </main>
  );
}

function DataRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: string;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[34px_90px_1fr] items-center gap-2 py-4 ${
        last
          ? ""
          : "border-b border-[#ff5a2a]/20"
      }`}
    >
      <div className="text-xl text-[#ff6f4d]">
        {icon}
      </div>

      <p className="text-sm text-white/45">
        {label}:
      </p>

      <p className="text-right text-sm font-bold sm:text-base">
        {value}
      </p>
    </div>
  );
}