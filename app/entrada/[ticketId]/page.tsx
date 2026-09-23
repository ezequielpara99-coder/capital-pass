import QRCode from "qrcode";
import { notFound } from "next/navigation";

import { createAdminClient } from "../../../lib/supabase/admin";
import {
  createTicketQRPayload,
  verifyTicketSignature,
} from "../../../lib/tickets/signature";
import { normalizeAccent } from "../../../lib/tickets/design";
import TicketPoster from "../ticket-poster";

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

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
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

  // El color se pide aparte: si todavia no existe la columna en la base, la
  // entrada igual se muestra con el color de Capital Pass.
  const { data: accentRow } = await admin
    .from("events")
    .select("ticket_accent_color")
    .eq("id", ticket.event_id)
    .maybeSingle();

  const accent = normalizeAccent(
    (accentRow as { ticket_accent_color?: string | null } | null)?.ticket_accent_color
  );

  const customTicketBackgroundUrl =
    event.ticket_design_mode === "custom" &&
    event.ticket_background_path
      ? admin.storage
          .from("event-assets")
          .getPublicUrl(
            event.ticket_background_path
          ).data.publicUrl
      : null;

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
      margin: 1,
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

  const status = isCancelled
    ? "cancelled"
    : isUsed
      ? "used"
      : null;

  const eventMeta = [
    formatShortDate(event.starts_at),
    event.city,
    event.venue_name,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050308] px-4 py-8 text-white sm:px-6">
      <div className="relative z-10 mx-auto max-w-[460px]">
        <article className="overflow-hidden rounded-[28px] border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,.55)]">
          <TicketPoster
            accent={accent}
            backgroundUrl={customTicketBackgroundUrl}
            eventName={event.name}
            eventMeta={eventMeta}
            buyerName={`${buyer.first_name} ${buyer.last_name}`.trim()}
            dni={formatDni(buyer.dni)}
            ticketTypeName={ticketType.name}
            manualCode={ticket.manual_code}
            number={formatTicketNumber(ticket.display_number)}
            status={status}
            qr={
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="Código QR de la entrada"
                className="h-full w-full object-contain"
              />
            }
          />
        </article>

        {/* ESTADO FUERA DEL DISEÑO */}
        {isUsed && !isCancelled && (
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

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.25em] text-white/60">
          Si el QR no puede escanearse, mostrale el código manual al personal de ingreso
        </p>

        <footer className="mt-4 text-center">
          <p className="text-[9px] uppercase tracking-[0.3em] text-white/20">
            Capital Pass · Acceso digital
          </p>
        </footer>
      </div>
    </main>
  );
}
