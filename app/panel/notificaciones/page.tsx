import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { pickSelectedEvent } from "../../../lib/panel/selected-event";

import EventSwitcher from "../event-switcher";
import RefundActionButton from "./refund-action-button";
import DeliveryResolveButton from "./delivery-resolve-button";

// ============================================================
// TYPES
// ============================================================

type ReturnRow = {
  id: string;
  event_id: string;
  sale_id: string;
  ticket_id: string;
  reason: string | null;
  refund_status: string;
  refund_amount_minor: number | string;
  returned_at: string;
  refunded_at: string | null;
};

type DeliveryRow = {
  id: string;
  event_id: string;
  sale_id: string;
  ticket_id: string;
  status: string;
  recipient_phone: string | null;
  failure_reason: string | null;
  failed_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

type TicketRow = {
  id: string;
  display_number:
    | number
    | string
    | null;

  sale_id: string;
  ticket_type_id: string;
  status: string;
};

type SaleRow = {
  id: string;
  buyer_id: string;

  seller_member_id:
    | string
    | null;

  channel: string;
};

type BuyerRow = {
  id: string;
  first_name: string;
  last_name: string;

  dni:
    | string
    | null;

  phone:
    | string
    | null;
};

type TicketTypeRow = {
  id: string;
  name: string;
};

type MemberRow = {
  id: string;
  user_id: string;
};

type ProfileRow = {
  id: string;

  first_name:
    | string
    | null;

  last_name:
    | string
    | null;
};

// ============================================================
// PAGE
// ============================================================

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const { eventId: requestedEventId } = await searchParams;
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin =
    createAdminClient();

  // ==========================================================
  // ORGANIZADOR
  // ==========================================================

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
    redirect("/login");
  }

  // ==========================================================
  // PERFIL + ORGANIZACIÓN
  // ==========================================================

  const [
    profileResult,
    organizationResult,
  ] =
    await Promise.all([
      admin
        .from("profiles")
        .select(`
          first_name,
          last_name
        `)
        .eq(
          "id",
          user.id
        )
        .maybeSingle(),

      admin
        .from(
          "organizations"
        )
        .select("name")
        .eq(
          "id",
          membership.organization_id
        )
        .maybeSingle(),
    ]);

  const profile =
    profileResult.data;

  const organization =
    organizationResult.data;

  const firstName =
    profile?.first_name?.trim() ||
    "Organizador";

  const lastName =
    profile?.last_name?.trim() ||
    "";

  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`
      .toUpperCase()
      .trim() ||
    "OP";

  // ==========================================================
  // EVENTO ACTUAL
  // ==========================================================

  const {
    data: events,
  } = await admin
    .from("events")
    .select(`
      id,
      name,
      starts_at,
      city,
      venue_name,
      status
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
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  const event =
    await pickSelectedEvent(
      events ?? [],
      requestedEventId
    );

  // ==========================================================
  // SIN EVENTO
  // ==========================================================

  if (!event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080706] px-5 text-white">

        <div className="max-w-md rounded-[28px] border border-orange-400/15 bg-white/[0.035] p-8 text-center">

          <p className="text-xs uppercase tracking-[0.18em] text-orange-300">
            Notificaciones
          </p>

          <h1 className="mt-3 text-2xl font-semibold">
            No hay eventos
          </h1>

          <p className="mt-3 text-sm text-white/40">
            Creá un evento para comenzar a recibir notificaciones.
          </p>

          <Link
            href="/panel"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-xl border border-orange-400/20 bg-orange-400/[0.08] px-5 text-sm font-semibold text-orange-200"
          >
            Volver al inicio
          </Link>

        </div>

      </main>
    );
  }

  // ==========================================================
  // DEVOLUCIONES
  // ==========================================================

  const {
    data: returnData,
  } = await admin
    .from(
      "ticket_returns"
    )
    .select(`
      id,
      event_id,
      sale_id,
      ticket_id,
      reason,
      refund_status,
      refund_amount_minor,
      returned_at,
      refunded_at
    `)
    .eq(
      "organization_id",
      membership.organization_id
    )
    .eq(
      "event_id",
      event.id
    )
    .order(
      "returned_at",
      {
        ascending: false,
      }
    );

  const returns =
    (returnData ??
      []) as ReturnRow[];

  // ==========================================================
  // ENTREGAS FALLIDAS
  //
  // Todavía no tenemos WhatsApp Business API.
  // En el MVP esta sección se usará con marcado manual.
  // ==========================================================

  const {
    data: deliveryData,
  } = await admin
    .from(
      "ticket_delivery_attempts"
    )
    .select(`
      id,
      event_id,
      sale_id,
      ticket_id,
      status,
      recipient_phone,
      failure_reason,
      failed_at,
      resolved_at,
      created_at
    `)
    .eq(
      "organization_id",
      membership.organization_id
    )
    .eq(
      "event_id",
      event.id
    )
    .eq(
      "status",
      "failed"
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  const failedDeliveries =
    (deliveryData ??
      []) as DeliveryRow[];

  // ==========================================================
  // IDS
  // ==========================================================

  const ticketIds = [
    ...new Set([
      ...returns.map(
        (item) =>
          item.ticket_id
      ),

      ...failedDeliveries.map(
        (item) =>
          item.ticket_id
      ),
    ]),
  ];

  const saleIds = [
    ...new Set([
      ...returns.map(
        (item) =>
          item.sale_id
      ),

      ...failedDeliveries.map(
        (item) =>
          item.sale_id
      ),
    ]),
  ];

  // ==========================================================
  // TICKETS
  // ==========================================================

  let tickets: TicketRow[] =
    [];

  if (
    ticketIds.length >
    0
  ) {
    const {
      data,
    } = await admin
      .from("tickets")
      .select(`
        id,
        display_number,
        sale_id,
        ticket_type_id,
        status
      `)
      .in(
        "id",
        ticketIds
      );

    tickets =
      (data ??
        []) as TicketRow[];
  }

  const ticketMap =
    new Map(
      tickets.map(
        (ticket) => [
          ticket.id,
          ticket,
        ]
      )
    );

  // ==========================================================
  // TIPOS DE ENTRADA
  // ==========================================================

  const ticketTypeIds = [
    ...new Set(
      tickets
        .map(
          (ticket) =>
            ticket.ticket_type_id
        )
        .filter(Boolean)
    ),
  ];

  let ticketTypes: TicketTypeRow[] =
    [];

  if (
    ticketTypeIds.length >
    0
  ) {
    const {
      data,
    } = await admin
      .from(
        "ticket_types"
      )
      .select(`
        id,
        name
      `)
      .in(
        "id",
        ticketTypeIds
      );

    ticketTypes =
      (data ??
        []) as TicketTypeRow[];
  }

  const ticketTypeMap =
    new Map(
      ticketTypes.map(
        (type) => [
          type.id,
          type.name,
        ]
      )
    );

  // ==========================================================
  // VENTAS
  // ==========================================================

  let sales: SaleRow[] =
    [];

  if (
    saleIds.length >
    0
  ) {
    const {
      data,
    } = await admin
      .from("sales")
      .select(`
        id,
        buyer_id,
        seller_member_id,
        channel
      `)
      .in(
        "id",
        saleIds
      );

    sales =
      (data ??
        []) as SaleRow[];
  }

  const saleMap =
    new Map(
      sales.map(
        (sale) => [
          sale.id,
          sale,
        ]
      )
    );

  // ==========================================================
  // COMPRADORES
  // ==========================================================

  const buyerIds = [
    ...new Set(
      sales
        .map(
          (sale) =>
            sale.buyer_id
        )
        .filter(Boolean)
    ),
  ];

  let buyers: BuyerRow[] =
    [];

  if (
    buyerIds.length >
    0
  ) {
    const {
      data,
    } = await admin
      .from("buyers")
      .select(`
        id,
        first_name,
        last_name,
        dni,
        phone
      `)
      .in(
        "id",
        buyerIds
      );

    buyers =
      (data ??
        []) as BuyerRow[];
  }

  const buyerMap =
    new Map(
      buyers.map(
        (buyer) => [
          buyer.id,
          buyer,
        ]
      )
    );

  // ==========================================================
  // VENDEDORES
  // ==========================================================

  const memberIds = [
    ...new Set(
      sales
        .map(
          (sale) =>
            sale.seller_member_id
        )
        .filter(
          (
            value
          ): value is string =>
            Boolean(
              value
            )
        )
    ),
  ];

  let members: MemberRow[] =
    [];

  if (
    memberIds.length >
    0
  ) {
    const {
      data,
    } = await admin
      .from(
        "organization_members"
      )
      .select(`
        id,
        user_id
      `)
      .in(
        "id",
        memberIds
      );

    members =
      (data ??
        []) as MemberRow[];
  }

  const profileIds =
    members.map(
      (member) =>
        member.user_id
    );

  let sellerProfiles: ProfileRow[] =
    [];

  if (
    profileIds.length >
    0
  ) {
    const {
      data,
    } = await admin
      .from("profiles")
      .select(`
        id,
        first_name,
        last_name
      `)
      .in(
        "id",
        profileIds
      );

    sellerProfiles =
      (data ??
        []) as ProfileRow[];
  }

  const sellerProfileMap =
    new Map(
      sellerProfiles.map(
        (seller) => [
          seller.id,
          seller,
        ]
      )
    );

  const memberMap =
    new Map(
      members.map(
        (member) => [
          member.id,
          member,
        ]
      )
    );

  // ==========================================================
  // DEVOLUCIONES ARMADAS
  // ==========================================================

  const returnedNotifications =
    returns.map(
      (item) => {
        const ticket =
          ticketMap.get(
            item.ticket_id
          );

        const sale =
          saleMap.get(
            item.sale_id
          );

        const buyer =
          sale
            ? buyerMap.get(
                sale.buyer_id
              )
            : undefined;

        let sellerName =
          "Organizador";

        if (
          sale
            ?.seller_member_id
        ) {
          const member =
            memberMap.get(
              sale.seller_member_id
            );

          const seller =
            member
              ? sellerProfileMap.get(
                  member.user_id
                )
              : undefined;

          if (seller) {
            sellerName =
              `${seller.first_name ?? ""} ${seller.last_name ?? ""}`
                .trim() ||
              "Vendedor";
          }
        }

        return {
          id:
            item.id,

          ticketId:
            item.ticket_id,

          ticketNumber:
            ticket
              ?.display_number ??
            null,

          ticketType:
            ticket
              ? ticketTypeMap.get(
                  ticket.ticket_type_id
                ) ??
                "Entrada"
              : "Entrada",

          buyerName:
            buyer
              ? `${buyer.first_name} ${buyer.last_name}`.trim()
              : "Comprador",

          buyerDni:
            buyer?.dni ??
            null,

          buyerPhone:
            buyer?.phone ??
            null,

          sellerName,

          channel:
            sale?.channel ??
            "organizer",

          reason:
            item.reason ??
            "Sin motivo",

          refundStatus:
            item.refund_status,

          refundAmount:
            Number(
              item.refund_amount_minor ??
                0
            ),

          returnedAt:
            item.returned_at,

          refundedAt:
            item.refunded_at,
        };
      }
    );

  // ==========================================================
  // ENTREGAS ARMADAS
  // ==========================================================

  const deliveryNotifications =
    failedDeliveries.map(
      (item) => {
        const ticket =
          ticketMap.get(
            item.ticket_id
          );

        const sale =
          saleMap.get(
            item.sale_id
          );

        const buyer =
          sale
            ? buyerMap.get(
                sale.buyer_id
              )
            : undefined;

        return {
          id:
            item.id,

          ticketId:
            item.ticket_id,

          ticketNumber:
            ticket
              ?.display_number ??
            null,

          ticketType:
            ticket
              ? ticketTypeMap.get(
                  ticket.ticket_type_id
                ) ??
                "Entrada"
              : "Entrada",

          buyerName:
            buyer
              ? `${buyer.first_name} ${buyer.last_name}`.trim()
              : "Comprador",

          phone:
            item.recipient_phone ??
            buyer?.phone ??
            null,

          reason:
            item.failure_reason ??
            "No se indicó el motivo.",

          failedAt:
            item.failed_at ??
            item.created_at,

          resolvedAt:
            item.resolved_at,
        };
      }
    );

  // ==========================================================
  // MÉTRICAS
  // ==========================================================

  const pendingRefunds =
    returnedNotifications.filter(
      (item) =>
        item.refundStatus ===
        "pending"
    );

  const refunded =
    returnedNotifications.filter(
      (item) =>
        item.refundStatus ===
        "refunded"
    );

  const pendingRefundAmount =
    pendingRefunds.reduce(
      (
        total,
        item
      ) =>
        total +
        item.refundAmount,
      0
    );

  const pendingDeliveryNotifications =
    deliveryNotifications.filter(
      (item) =>
        !item.resolvedAt
    );

  const resolvedDeliveryNotifications =
    deliveryNotifications.filter(
      (item) =>
        Boolean(
          item.resolvedAt
        )
    );

  const totalNotifications =
    returnedNotifications.length +
    deliveryNotifications.length;

  const requiringAttention =
    pendingRefunds.length +
    pendingDeliveryNotifications.length;

  // ==========================================================
  // STOCK BAJO (modulo de barra) -- seccion propia, independiente
  // de las devoluciones/entregas de arriba, para no tocar esos
  // calculos existentes.
  // ==========================================================

  const { data: eventProductsForStock } = await admin
    .from("event_products")
    .select("id, product_id, low_stock_threshold")
    .eq("event_id", event.id);

  const eventProductIdsForStock = (eventProductsForStock ?? []).map((ep) => ep.id);
  const stockProductIds = (eventProductsForStock ?? []).map((ep) => ep.product_id);

  const [{ data: barStockRows }, { data: barsForStock }, { data: productsForStock }] = await Promise.all([
    eventProductIdsForStock.length
      ? admin.from("bar_stock").select("bar_id, event_product_id, quantity").in("event_product_id", eventProductIdsForStock)
      : Promise.resolve({ data: [] as { bar_id: string; event_product_id: string; quantity: number }[] }),
    admin.from("bars").select("id, name").eq("event_id", event.id),
    stockProductIds.length
      ? admin.from("products").select("id, name").in("id", stockProductIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const eventProductByIdForStock = new Map((eventProductsForStock ?? []).map((ep) => [ep.id, ep]));
  const barNameByIdForStock = new Map((barsForStock ?? []).map((b) => [b.id, b.name]));
  const productNameByIdForStock = new Map((productsForStock ?? []).map((p) => [p.id, p.name]));

  const lowStockAlerts = (barStockRows ?? [])
    .map((row) => {
      const ep = eventProductByIdForStock.get(row.event_product_id);
      if (!ep || row.quantity > ep.low_stock_threshold) return null;
      return {
        barName: barNameByIdForStock.get(row.bar_id) ?? "Barra",
        productName: productNameByIdForStock.get(ep.product_id) ?? "Producto",
        quantity: row.quantity,
        threshold: ep.low_stock_threshold,
      };
    })
    .filter((a): a is { barName: string; productName: string; quantity: number; threshold: number } => a !== null);

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-5 py-6 text-[#f7f3ed] selection:bg-[#ff3b24] selection:text-white md:px-8 xl:px-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[260px] -top-[280px] h-[680px] w-[680px] rounded-full bg-[#ff2a1a]/[0.11] blur-[185px]" />
        <div className="absolute -right-[280px] top-[15%] h-[700px] w-[700px] rounded-full bg-[#ff5a2a]/[0.08] blur-[190px]" />
        <div className="absolute bottom-[-350px] left-[25%] h-[650px] w-[820px] rounded-[50%] bg-[radial-gradient(ellipse_at_top,rgba(255,124,76,.18)_0%,rgba(255,59,36,.09)_25%,rgba(76,14,7,.06)_50%,transparent_72%)] blur-[40px]" />
        <div className="absolute inset-0 opacity-[0.033] [background-image:radial-gradient(rgba(255,255,255,.9)_0.6px,transparent_0.8px)] [background-size:5px_5px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1480px]">
        <header className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/panel"
              className="flex h-11 w-11 shrink-0 items-center justify-center border border-white/[0.10] bg-white/[0.03] text-lg text-[#f7f3ed]/65 transition hover:border-[#ff3b24]/45 hover:text-white"
              aria-label="Volver al panel"
            >
              ←
            </Link>

            <div className="relative h-11 w-11 shrink-0 border border-white/[0.10] bg-white/[0.03]">
              <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_22px_rgba(255,59,36,.2)]" />
              <div className="absolute inset-[8px] rounded-[45%_55%_65%_35%] bg-[radial-gradient(circle_at_28%_24%,rgba(255,255,255,.45),transparent_28%)]" />
            </div>

            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.38em] text-[#ff6a4f]">
                Alert Center
              </p>

              <h1 className="mt-1 truncate text-sm font-black uppercase tracking-[-0.03em] text-[#f7f3ed]">
                {event.name}
              </h1>
            </div>
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            <div className="border border-white/[0.09] bg-white/[0.03] px-4 py-3 text-right">
              <p className="max-w-[230px] truncate text-xs font-bold text-[#f7f3ed]">
                {organization?.name ?? "Organización"}
              </p>

              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#f7f3ed]/30">
                {initials}
              </p>
            </div>
          </div>
        </header>

        <EventSwitcher
          events={(events ?? []).map((item) => ({ id: item.id, name: item.name }))}
          currentEventId={event.id}
          className="mt-5 max-w-[420px]"
        />

        <section className="grid gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="inline-flex items-center border border-[#ff3b24]/35 bg-[#ff3b24]/[0.08] px-4 py-3">
              <span className="mr-3 h-2 w-2 rounded-full bg-[#ff3b24]" />
              <span className="text-[10px] font-black uppercase tracking-[0.38em] text-[#ffb29f]">
                Centro de notificaciones
              </span>
            </div>

            <h2 className="mt-8 max-w-[900px] bg-gradient-to-br from-[#fff2ea] via-[#ff8c69] to-[#ff2a1a] bg-clip-text text-[clamp(48px,7vw,96px)] font-black uppercase leading-[0.82] tracking-[-0.075em] text-transparent">
              Revisá alertas críticas.
            </h2>

            <p className="mt-7 max-w-[680px] text-sm leading-7 text-[#f7f3ed]/45 md:text-base md:leading-8">
              Entradas devueltas, reintegros pendientes y problemas de entrega
              del evento actual en un solo lugar.
            </p>
          </div>

          <div className="border border-[#ff3b24]/20 bg-[#ff3b24]/[0.07] p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#ffb29f]">
              Requieren atención
            </p>

            <p className="mt-5 text-6xl font-black leading-none tracking-[-0.07em] text-[#f7f3ed]">
              {requiringAttention}
            </p>

            <p className="mt-4 text-sm leading-6 text-[#f7f3ed]/45">
              {pendingRefunds.length} reintegros pendientes ·{" "}
              {pendingDeliveryNotifications.length} entregas por resolver
            </p>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricBlock
            index="01"
            label="Notificaciones"
            value={String(totalNotifications)}
            detail="alertas del evento"
          />

          <MetricBlock
            index="02"
            label="Devueltas"
            value={String(returnedNotifications.length)}
            detail="tickets anulados"
            tone="danger"
          />

          <MetricBlock
            index="03"
            label="Pendiente"
            value={formatMoney(pendingRefundAmount)}
            detail={pendingRefunds.length + " reintegros"}
            tone="warning"
          />

          <MetricBlock
            index="04"
            label="No entregadas"
            value={String(pendingDeliveryNotifications.length)}
            detail="problemas activos"
            tone="accent"
          />
        </section>

        <section className="mt-6 border border-white/[0.09] bg-[#080706]/88">
          <SectionTitle
            eyebrow="Devoluciones"
            title="Entradas devueltas"
            count={returnedNotifications.length}
            tone="danger"
          />

          {returnedNotifications.length === 0 ? (
            <EmptyState
              title="No hay entradas devueltas"
              detail="Cuando una entrada se anule o quede pendiente de reintegro, va a aparecer acá."
            />
          ) : (
            <div className="divide-y divide-white/[0.08]">
              {returnedNotifications.map((item) => (
                <article
                  key={item.id}
                  className="grid gap-6 px-5 py-6 transition hover:bg-white/[0.025] md:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(220px,.75fr)_minmax(170px,.55fr)]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-black uppercase tracking-[-0.04em] text-[#f7f3ed]">
                        {item.buyerName}
                      </h3>

                      <StatusPill tone="danger">
                        Devuelta
                      </StatusPill>

                      {item.refundStatus === "pending" && (
                        <StatusPill tone="warning">
                          Requiere acción
                        </StatusPill>
                      )}
                    </div>

                    <p className="mt-3 text-sm font-semibold text-[#f7f3ed]/55">
                      {formatTicketNumber(item.ticketNumber)} · {item.ticketType}
                    </p>

                    <p className="mt-2 text-xs leading-5 text-[#f7f3ed]/35">
                      DNI {item.buyerDni ?? "—"} · {item.sellerName} ·{" "}
                      {formatChannel(item.channel)}
                    </p>

                    <div className="mt-5 border border-white/[0.08] bg-white/[0.025] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#f7f3ed]/30">
                        Motivo
                      </p>

                      <p className="mt-2 text-sm leading-6 text-[#f7f3ed]/70">
                        {item.reason}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#f7f3ed]/30">
                      Reintegro
                    </p>

                    <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#f7f3ed]">
                      {formatMoney(item.refundAmount)}
                    </p>

                    <div className="mt-4">
                      <RefundBadge status={item.refundStatus} />
                    </div>

                    {item.refundStatus === "pending" && (
                      <RefundActionButton
                        returnId={item.id}
                        amount={item.refundAmount}
                      />
                    )}

                    {item.refundStatus === "refunded" && item.refundedAt && (
                      <div className="mt-4 border border-emerald-400/15 bg-emerald-400/[0.045] px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200/55">
                          Reintegrado el
                        </p>

                        <p className="mt-1 text-xs font-bold text-emerald-100/80">
                          {formatDate(item.refundedAt)}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="lg:text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#f7f3ed]/30">
                      Devuelta
                    </p>

                    <p className="mt-3 text-sm font-semibold text-[#f7f3ed]/60">
                      {formatDate(item.returnedAt)}
                    </p>

                    <Link
                      href="/panel?section=ventas"
                      className="mt-5 inline-flex h-10 items-center justify-center border border-[#ff3b24]/25 bg-[#ff3b24]/[0.07] px-4 text-[10px] font-black uppercase tracking-[0.18em] text-[#ffb29f] transition hover:bg-[#ff3b24]/[0.12]"
                    >
                      Ver ventas
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {refunded.length > 0 && (
          <ResolvedSummary
            text={refunded.length + " reintegro" + (refunded.length !== 1 ? "s" : "") + " registrado" + (refunded.length !== 1 ? "s" : "")}
            detail="Permanecen en el historial del evento."
          />
        )}

        <section className="mt-6 border border-white/[0.09] bg-[#080706]/88">
          <SectionTitle
            eyebrow="Entrega"
            title="Entradas no entregadas"
            count={pendingDeliveryNotifications.length}
            tone="accent"
          />

          {deliveryNotifications.length === 0 ? (
            <EmptyState
              title="Todo en orden"
              detail="No hay problemas de entrega pendientes. Más adelante, con WhatsApp Business/API, Capital Pass podrá recibir estados automáticamente."
              success
            />
          ) : (
            <div className="divide-y divide-white/[0.08]">
              {deliveryNotifications.map((item) => (
                <article
                  key={item.id}
                  className="grid gap-6 px-5 py-6 transition hover:bg-white/[0.025] md:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.9fr)]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-black uppercase tracking-[-0.04em] text-[#f7f3ed]">
                        {item.buyerName}
                      </h3>

                      {item.resolvedAt ? (
                        <StatusPill tone="success">
                          Resuelta
                        </StatusPill>
                      ) : (
                        <>
                          <StatusPill tone="accent">
                            No entregada
                          </StatusPill>

                          <StatusPill tone="warning">
                            Requiere acción
                          </StatusPill>
                        </>
                      )}
                    </div>

                    <p className="mt-3 text-sm font-semibold text-[#f7f3ed]/55">
                      {formatTicketNumber(item.ticketNumber)} · {item.ticketType}
                    </p>

                    <p className="mt-2 text-xs text-[#f7f3ed]/35">
                      WhatsApp: {item.phone ?? "—"}
                    </p>

                    <div className="mt-5 border border-white/[0.08] bg-white/[0.025] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#f7f3ed]/30">
                        Motivo
                      </p>

                      <p className="mt-2 text-sm leading-6 text-[#f7f3ed]/70">
                        {item.reason}
                      </p>
                    </div>
                  </div>

                  <div className="lg:text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#f7f3ed]/30">
                      Reportada
                    </p>

                    <p className="mt-3 text-sm font-semibold text-[#f7f3ed]/55">
                      {formatDate(item.failedAt)}
                    </p>

                    {item.resolvedAt ? (
                      <div className="mt-5 border border-emerald-400/15 bg-emerald-400/[0.045] px-3 py-2 text-left lg:text-right">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200/55">
                          Resuelta el
                        </p>

                        <p className="mt-1 text-xs font-bold text-emerald-100/80">
                          {formatDate(item.resolvedAt)}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-5 flex flex-wrap gap-2 lg:justify-end">
                        {item.phone && (
                          <a
                            href={buildWhatsAppUrl({
                              phone: item.phone,
                              buyerName: item.buyerName,
                              eventName: event.name,
                              ticketNumber: item.ticketNumber,
                            })}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-10 items-center justify-center border border-emerald-400/20 bg-emerald-400/[0.07] px-4 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200 transition hover:bg-emerald-400/[0.12]"
                          >
                            Reenviar
                          </a>
                        )}

                        <Link
                          href="/panel?section=ventas"
                          className="inline-flex h-10 items-center justify-center border border-[#ff3b24]/25 bg-[#ff3b24]/[0.07] px-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#ffb29f] transition hover:bg-[#ff3b24]/[0.12]"
                        >
                          Ver venta
                        </Link>

                        <DeliveryResolveButton attemptId={item.id} />
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {resolvedDeliveryNotifications.length > 0 && (
          <ResolvedSummary
            text={resolvedDeliveryNotifications.length + " problema" + (resolvedDeliveryNotifications.length !== 1 ? "s" : "") + " de entrega resuelto" + (resolvedDeliveryNotifications.length !== 1 ? "s" : "")}
            detail="Permanecen en el historial del evento."
          />
        )}

        <section className="mt-6 border border-white/[0.09] bg-[#080706]/88">
          <SectionTitle
            eyebrow="Stock"
            title="Bebidas con stock bajo"
            count={lowStockAlerts.length}
            tone="accent"
          />

          {lowStockAlerts.length === 0 ? (
            <EmptyState
              title="Todo en orden"
              detail="Ninguna bebida está por debajo del umbral de alerta que configuraste en Stock general."
              success
            />
          ) : (
            <div className="divide-y divide-white/[0.08]">
              {lowStockAlerts.map((alert, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-5 py-4 md:px-6">
                  <div>
                    <p className="text-sm font-black text-[#f7f3ed]">{alert.productName}</p>
                    <p className="mt-1 text-xs text-[#f7f3ed]/40">{alert.barName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-[#ffb29f]">{alert.quantity}</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#f7f3ed]/30">de {alert.threshold}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

// ============================================================
// UI HELPERS
// ============================================================

function MetricBlock({
  index,
  label,
  value,
  detail,
  tone = "default",
}: {
  index: string;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "danger" | "warning" | "accent";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-400/20 bg-red-400/[0.035]"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/[0.035]"
        : tone === "accent"
          ? "border-[#ff3b24]/20 bg-[#ff3b24]/[0.045]"
          : "border-white/[0.09] bg-white/[0.025]";

  return (
    <div className={"border p-5 transition hover:-translate-y-[2px] " + toneClass}>
      <p className="text-[11px] font-black text-[#ff3b24]">
        {index}
      </p>

      <p className="mt-6 text-[10px] font-black uppercase tracking-[0.24em] text-[#f7f3ed]/35">
        {label}
      </p>

      <p className="mt-3 text-3xl font-black tracking-[-0.055em] text-[#f7f3ed]">
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-[#f7f3ed]/35">
        {detail}
      </p>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  count,
  tone,
}: {
  eyebrow: string;
  title: string;
  count: number;
  tone: "danger" | "accent";
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-5 md:px-6">
      <div>
        <p className={tone === "danger" ? "text-[10px] font-black uppercase tracking-[0.28em] text-red-200" : "text-[10px] font-black uppercase tracking-[0.28em] text-[#ffb29f]"}>
          {eyebrow}
        </p>

        <h3 className="mt-2 text-2xl font-black uppercase tracking-[-0.045em] text-[#f7f3ed]">
          {title}
        </h3>
      </div>

      <span className={tone === "danger" ? "border border-red-400/20 bg-red-400/[0.07] px-3 py-2 text-xs font-black text-red-100" : "border border-[#ff3b24]/25 bg-[#ff3b24]/[0.08] px-3 py-2 text-xs font-black text-[#ffb29f]"}>
        {count}
      </span>
    </div>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "danger" | "warning" | "success" | "accent";
}) {
  const className =
    tone === "danger"
      ? "border-red-400/20 bg-red-400/[0.07] text-red-100"
      : tone === "warning"
        ? "border-amber-400/20 bg-amber-400/[0.08] text-amber-100"
        : tone === "success"
          ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-100"
          : "border-[#ff3b24]/25 bg-[#ff3b24]/[0.08] text-[#ffb29f]";

  return (
    <span className={"inline-flex border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] " + className}>
      {children}
    </span>
  );
}

function EmptyState({
  title,
  detail,
  success = false,
}: {
  title: string;
  detail: string;
  success?: boolean;
}) {
  return (
    <div className="p-8">
      <div className={success ? "flex h-11 w-11 items-center justify-center border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200" : "flex h-11 w-11 items-center justify-center border border-[#ff3b24]/25 bg-[#ff3b24]/[0.08] text-[#ffb29f]"}>
        {success ? "✓" : "!"}
      </div>

      <p className="mt-5 text-lg font-black uppercase tracking-[-0.035em] text-[#f7f3ed]">
        {title}
      </p>

      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#f7f3ed]/40">
        {detail}
      </p>
    </div>
  );
}

function ResolvedSummary({
  text,
  detail,
}: {
  text: string;
  detail: string;
}) {
  return (
    <div className="mt-4 flex items-center gap-3 border border-emerald-400/15 bg-emerald-400/[0.035] px-5 py-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200">
        ✓
      </div>

      <div>
        <p className="text-sm font-bold text-emerald-100">
          {text}
        </p>

        <p className="mt-1 text-xs text-[#f7f3ed]/32">
          {detail}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// REFUND BADGE
// ============================================================

function RefundBadge({
  status,
}: {
  status: string;
}) {
  if (status === "refunded") {
    return (
      <span className="inline-flex border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1.5 text-xs font-black text-emerald-100">
        ✓ Reintegrado
      </span>
    );
  }

  if (status === "no_refund") {
    return (
      <span className="inline-flex border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-black text-[#f7f3ed]/50">
        Sin reintegro
      </span>
    );
  }

  return (
    <span className="inline-flex border border-amber-400/20 bg-amber-400/[0.08] px-3 py-1.5 text-xs font-black text-amber-100">
      Reintegro pendiente
    </span>
  );
}

// ============================================================
// HELPERS
// ============================================================

function formatMoney(
  value: number
) {
  return new Intl.NumberFormat(
    "es-AR",
    {
      style:
        "currency",

      currency:
        "ARS",

      maximumFractionDigits:
        0,
    }
  ).format(
    value
  );
}

function formatTicketNumber(
  value:
    | number
    | string
    | null
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "Entrada";
  }

  return `#${String(
    value
  ).padStart(
    7,
    "0"
  )}`;
}

function formatDate(
  value: string
) {
  return new Intl.DateTimeFormat(
    "es-AR",
    {
      day:
        "2-digit",

      month:
        "2-digit",

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

function buildWhatsAppUrl({
  phone,
  buyerName,
  eventName,
  ticketNumber,
}: {
  phone: string;
  buyerName: string;
  eventName: string;
  ticketNumber:
    | number
    | string
    | null;
}) {
  const cleanPhone =
    phone.replace(
      /\D/g,
      ""
    );

  const message =
    [
      `Hola ${buyerName},`,
      "",
      `te contacto desde Capital Pass por tu entrada ${formatTicketNumber(
        ticketNumber
      )} para ${eventName}.`,
      "",
      "Me avisaste que no la recibiste correctamente por WhatsApp. Te la reenvío por este medio.",
    ].join("\n");

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
    message
  )}`;
}

function formatChannel(
  value: string
) {
  if (
    value ===
    "rrpp"
  ) {
    return "RRPP";
  }

  if (
    value ===
    "door"
  ) {
    return "Puerta";
  }

  return "Organizador";
}
