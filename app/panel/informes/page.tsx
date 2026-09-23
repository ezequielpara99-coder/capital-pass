import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";

import InformesClient from "./informes-client";

type EventRow = {
  id: string;
  name: string;
  slug: string;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  city: string | null;
  status: string;
};

type SaleRow = {
  id: string;
  event_id: string;
  buyer_id: string;
  seller_member_id: string;
  total_minor: number;
  channel: string;
  status: string;
  created_at: string;
};

type SaleItemRow = {
  id: string;
  sale_id: string;
  event_id: string;
  ticket_type_id: string;
  quantity: number;
  unit_price_minor: number;
  subtotal_minor: number | null;
};

type TicketRow = {
  id: string;
  event_id: string;
  sale_id: string;
  ticket_type_id: string;
  status: string;
  issued_at: string;
  used_at: string | null;
};

type TicketTypeRow = {
  id: string;
  event_id: string;
  name: string;
  capacity: number;
  status: string;
  active: boolean;
};

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  status: string;
};

type ProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
};

type StaffRow = {
  id: string;
  event_id: string;
  organization_member_id: string;
  staff_role: string;
  active: boolean;
  commission_percentage: number;
};

type CommissionPaymentRow = {
  id: string;
  organization_id: string;
  event_id: string;
  event_staff_id: string;
  organization_member_id: string;
  amount_minor: number;
  currency: string;
  paid_at: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

type ReturnRow = {
  id: string;
  event_id: string;
  sale_id: string;
  ticket_id: string;
  refund_status: string;
  refund_amount_minor: number | null;
  returned_at: string;
  refunded_at: string | null;
};

export default async function InformesPage() {
  const supabase = await createClient();

  // =====================================================
  // USUARIO
  // =====================================================

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // =====================================================
  // ORGANIZADOR
  // =====================================================

  const { data: membership } = await supabase
    .from("organization_members")
    .select(`
      id,
      organization_id
    `)
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return null;
  }

  const admin =
    createAdminClient();

  // =====================================================
  // PERFIL
  // =====================================================

  const { data: profile } = await supabase
    .from("profiles")
    .select(`
      first_name,
      last_name
    `)
    .eq("id", user.id)
    .maybeSingle();

  const firstName =
    profile?.first_name?.trim() ||
    "Organizador";

  const lastName =
    profile?.last_name?.trim() || "";

  const organizerName =
    `${firstName} ${lastName}`.trim();

  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`
      .toUpperCase()
      .trim() || "OP";

  // =====================================================
  // ORGANIZACIÓN
  // =====================================================

  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq(
      "id",
      membership.organization_id
    )
    .maybeSingle();

  const organizationName =
    organization?.name ??
    "Organización";

  // =====================================================
  // TODOS LOS EVENTOS HISTÓRICOS
  // =====================================================

  const { data: eventData } = await supabase
    .from("events")
    .select(`
      id,
      name,
      slug,
      starts_at,
      ends_at,
      venue_name,
      city,
      status
    `)
    .eq(
      "organization_id",
      membership.organization_id
    )
    .order("starts_at", {
      ascending: false,
    });

  const events =
    (eventData ?? []) as EventRow[];

  const eventIds =
    events.map((event) => event.id);

  // =====================================================
  // SI NO HAY EVENTOS
  // =====================================================

  if (eventIds.length === 0) {
    return (
      <InformesClient
        organizationName={organizationName}
        organizerName={organizerName}
        initials={initials}
        reports={[]}
      />
    );
  }

  // =====================================================
  // VENTAS
  // =====================================================

  const { data: salesData } = await supabase
    .from("sales")
    .select(`
      id,
      event_id,
      buyer_id,
      seller_member_id,
      total_minor,
      channel,
      status,
      created_at
    `)
    .in("event_id", eventIds)
    .eq("status", "confirmed");

  const sales =
    (salesData ?? []) as SaleRow[];

  const saleIds =
    sales.map((sale) => sale.id);

  // =====================================================
  // ITEMS DE VENTA
  // =====================================================

  let saleItems: SaleItemRow[] = [];

  if (saleIds.length > 0) {
    const { data } = await supabase
      .from("sale_items")
      .select(`
        id,
        sale_id,
        event_id,
        ticket_type_id,
        quantity,
        unit_price_minor,
        subtotal_minor
      `)
      .in("sale_id", saleIds);

    saleItems =
      (data ?? []) as SaleItemRow[];
  }

  // =====================================================
  // TICKETS
  // =====================================================

  const { data: ticketsData } = await supabase
    .from("tickets")
    .select(`
      id,
      event_id,
      sale_id,
      ticket_type_id,
      status,
      issued_at,
      used_at
    `)
    .in("event_id", eventIds);

  const tickets =
    (ticketsData ?? []) as TicketRow[];

  // =====================================================
  // TANDAS
  // =====================================================

  const { data: ticketTypesData } =
    await supabase
      .from("ticket_types")
      .select(`
        id,
        event_id,
        name,
        capacity,
        status,
        active
      `)
      .in("event_id", eventIds);

  const ticketTypes =
    (ticketTypesData ??
      []) as TicketTypeRow[];

  // =====================================================
  // DEVOLUCIONES / REINTEGROS
  // =====================================================

  const {
    data: returnsData,
  } = await admin
    .from("ticket_returns")
    .select(`
      id,
      event_id,
      sale_id,
      ticket_id,
      refund_status,
      refund_amount_minor,
      returned_at,
      refunded_at
    `)
    .eq(
      "organization_id",
      membership.organization_id
    )
    .in(
      "event_id",
      eventIds
    );

  const returns =
    (returnsData ??
      []) as ReturnRow[];

  // =====================================================
  // MIEMBROS DE LA ORGANIZACIÓN
  // =====================================================

  const { data: membersData } = await supabase
    .from("organization_members")
    .select(`
      id,
      user_id,
      role,
      status
    `)
    .eq(
      "organization_id",
      membership.organization_id
    );

  const members =
    (membersData ?? []) as MemberRow[];

  const memberUserIds =
    members
      .map((member) => member.user_id)
      .filter(Boolean);

  // =====================================================
  // PERFILES DEL EQUIPO
  // =====================================================

  let profiles: ProfileRow[] = [];

  if (memberUserIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select(`
        id,
        first_name,
        last_name
      `)
      .in("id", memberUserIds);

    profiles =
      (data ?? []) as ProfileRow[];
  }

  const profileMap = new Map(
    profiles.map((item) => [
      item.id,
      item,
    ])
  );

  const memberMap = new Map(
    members.map((member) => [
      member.id,
      member,
    ])
  );

  // =====================================================
  // PERSONAL ASIGNADO A EVENTOS
  // =====================================================

  const { data: staffData } = await supabase
    .from("event_staff")
    .select(`
      id,
      event_id,
      organization_member_id,
      staff_role,
      active,
      commission_percentage
    `)
    .in("event_id", eventIds);

  const staff =
    (staffData ?? []) as StaffRow[];

  // =====================================================
  // PAGOS DE COMISIONES RRPP
  // =====================================================

  const {
    data: commissionPaymentsData,
  } = await admin
    .from(
      "rrpp_commission_payments"
    )
    .select(`
      id,
      organization_id,
      event_id,
      event_staff_id,
      organization_member_id,
      amount_minor,
      currency,
      paid_at,
      note,
      created_by,
      created_at
    `)
    .eq(
      "organization_id",
      membership.organization_id
    )
    .in(
      "event_id",
      eventIds
    );

  const commissionPayments =
    (commissionPaymentsData ??
      []) as CommissionPaymentRow[];

  // =====================================================
  // INFORME POR EVENTO
  // =====================================================

  const reports = events.map((event) => {
    const eventSales =
      sales.filter(
        (sale) =>
          sale.event_id === event.id
      );

    const eventSaleIds =
      new Set(
        eventSales.map(
          (sale) => sale.id
        )
      );

    const eventItems =
      saleItems.filter((item) =>
        eventSaleIds.has(item.sale_id)
      );

    const eventTickets =
      tickets.filter(
        (ticket) =>
          ticket.event_id === event.id
      );

    const validTickets =
      eventTickets.filter(
        (ticket) =>
          ticket.status !== "cancelled"
      );

    const cancelledTickets =
      eventTickets.filter(
        (ticket) =>
          ticket.status === "cancelled"
      );

    const usedTickets =
      eventTickets.filter(
        (ticket) =>
          ticket.status === "used"
      );

    const eventReturns =
      returns.filter(
        (item) =>
          item.event_id ===
          event.id
      );

    const totalRevenue =
      eventSales.reduce(
        (total, sale) =>
          total +
          Number(sale.total_minor),
        0
      );

    const returnAmount =
      eventReturns.reduce(
        (total, item) =>
          total +
          Number(
            item.refund_amount_minor ??
              0
          ),
        0
      );

    const refundedAmount =
      eventReturns
        .filter(
          (item) =>
            item.refund_status ===
            "refunded"
        )
        .reduce(
          (total, item) =>
            total +
            Number(
              item.refund_amount_minor ??
                0
            ),
          0
        );

    const pendingRefundAmount =
      eventReturns
        .filter(
          (item) =>
            item.refund_status ===
            "pending"
        )
        .reduce(
          (total, item) =>
            total +
            Number(
              item.refund_amount_minor ??
                0
            ),
          0
        );

    const netRevenue =
      Math.max(
        0,
        totalRevenue -
          refundedAmount
      );

    const rrppRevenue =
      eventSales
        .filter(
          (sale) =>
            sale.channel === "rrpp"
        )
        .reduce(
          (total, sale) =>
            total +
            Number(sale.total_minor),
          0
        );

    const doorRevenue =
      eventSales
        .filter(
          (sale) =>
            sale.channel === "door"
        )
        .reduce(
          (total, sale) =>
            total +
            Number(sale.total_minor),
          0
        );

    const organizerRevenue =
      eventSales
        .filter(
          (sale) =>
            sale.channel ===
            "organizer"
        )
        .reduce(
          (total, sale) =>
            total +
            Number(sale.total_minor),
          0
        );

    // "Venta bruta"/"Venta neta" suman TODOS los canales (rrpp, puerta,
    // organizador, online y mesa), pero el desglose de mas abajo solo
    // mostraba rrpp/puerta/organizador -- la suma de esas filas nunca
    // coincidia con la venta bruta, sin ninguna aclaracion. Se agregan
    // online y mesa para que el desglose sea completo.
    const onlineRevenue =
      eventSales
        .filter(
          (sale) =>
            sale.channel ===
            "online"
        )
        .reduce(
          (total, sale) =>
            total +
            Number(sale.total_minor),
          0
        );

    const mesaRevenue =
      eventSales
        .filter(
          (sale) =>
            sale.channel ===
            "mesa"
        )
        .reduce(
          (total, sale) =>
            total +
            Number(sale.total_minor),
          0
        );

    const eventSaleMap =
      new Map(
        eventSales.map(
          (sale) => [
            sale.id,
            sale,
          ]
        )
      );

    const refundedByChannel = (
      channel: string
    ) =>
      eventReturns
        .filter(
          (item) =>
            item.refund_status ===
              "refunded" &&
            eventSaleMap.get(
              item.sale_id
            )?.channel ===
              channel
        )
        .reduce(
          (total, item) =>
            total +
            Number(
              item.refund_amount_minor ??
                0
            ),
          0
        );

    const rrppRefunded =
      refundedByChannel("rrpp");

    const doorRefunded =
      refundedByChannel("door");

    const organizerRefunded =
      refundedByChannel(
        "organizer"
      );

    const onlineRefunded =
      refundedByChannel(
        "online"
      );

    const mesaRefunded =
      refundedByChannel(
        "mesa"
      );

    const rrppNetRevenue =
      Math.max(
        0,
        rrppRevenue -
          rrppRefunded
      );

    const doorNetRevenue =
      Math.max(
        0,
        doorRevenue -
          doorRefunded
      );

    const organizerNetRevenue =
      Math.max(
        0,
        organizerRevenue -
          organizerRefunded
      );

    const onlineNetRevenue =
      Math.max(
        0,
        onlineRevenue -
          onlineRefunded
      );

    const mesaNetRevenue =
      Math.max(
        0,
        mesaRevenue -
          mesaRefunded
      );

    const rrppSales =
      eventSales.filter(
        (sale) =>
          sale.channel === "rrpp"
      ).length;

    const doorSales =
      eventSales.filter(
        (sale) =>
          sale.channel === "door"
      ).length;

    const organizerSales =
      eventSales.filter(
        (sale) =>
          sale.channel ===
          "organizer"
      ).length;

    const onlineSales =
      eventSales.filter(
        (sale) =>
          sale.channel ===
          "online"
      ).length;

    const mesaSales =
      eventSales.filter(
        (sale) =>
          sale.channel ===
          "mesa"
      ).length;

    const buyerCount =
      new Set(
        eventSales.map(
          (sale) => sale.buyer_id
        )
      ).size;

    const pendingTickets =
      Math.max(
        0,
        validTickets.length -
          usedTickets.length
      );

    const attendancePercentage =
      validTickets.length > 0
        ? Math.round(
            (usedTickets.length /
              validTickets.length) *
              100
          )
        : 0;

    // -------------------------------------------------
    // PRIMER / ÚLTIMO INGRESO
    // -------------------------------------------------

    const entryDates =
      usedTickets
        .map(
          (ticket) =>
            ticket.used_at
        )
        .filter(
          (
            value
          ): value is string =>
            Boolean(value)
        )
        .sort(
          (a, b) =>
            new Date(a).getTime() -
            new Date(b).getTime()
        );

    const firstEntry =
      entryDates[0] ?? null;

    const lastEntry =
      entryDates[
        entryDates.length - 1
      ] ?? null;

    // -------------------------------------------------
    // TANDAS
    // -------------------------------------------------

    const eventTicketTypes =
      ticketTypes.filter(
        (type) =>
          type.event_id === event.id
      );

    const ticketTypeReports =
      eventTicketTypes.map(
        (type) => {
          const typeTickets =
            eventTickets.filter(
              (ticket) =>
                ticket.ticket_type_id ===
                  type.id &&
                ticket.status !==
                  "cancelled"
            );

          const typeUsed =
            typeTickets.filter(
              (ticket) =>
                ticket.status === "used"
            ).length;

          const typeItems =
            eventItems.filter(
              (item) =>
                item.ticket_type_id ===
                type.id
            );

          const revenue =
            typeItems.reduce(
              (total, item) =>
                total +
                Number(
                  item.subtotal_minor ??
                    Number(
                      item.unit_price_minor
                    ) *
                      Number(
                        item.quantity
                      )
                ),
              0
            );

          const typeTicketIds =
            new Set(
              eventTickets
                .filter(
                  (ticket) =>
                    ticket.ticket_type_id ===
                    type.id
                )
                .map(
                  (ticket) =>
                    ticket.id
                )
            );

          const typeReturns =
            eventReturns.filter(
              (item) =>
                typeTicketIds.has(
                  item.ticket_id
                )
            );

          const typeRefunded =
            typeReturns
              .filter(
                (item) =>
                  item.refund_status ===
                  "refunded"
              )
              .reduce(
                (total, item) =>
                  total +
                  Number(
                    item.refund_amount_minor ??
                      0
                  ),
                0
              );

          return {
            id: type.id,
            name: type.name,
            capacity: Number(
              type.capacity
            ),
            sold:
              typeTickets.length,
            used: typeUsed,
            returned:
              typeReturns.length,
            revenue,
            refunded:
              typeRefunded,
            netRevenue:
              Math.max(
                0,
                revenue -
                  typeRefunded
              ),
            status: type.status,
          };
        }
      );

    // -------------------------------------------------
    // COMISIONES RRPP DEL EVENTO
    // -------------------------------------------------

    const eventRrppStaff =
      staff.filter(
        (row) =>
          row.event_id ===
            event.id &&
          row.staff_role ===
            "rrpp"
      );

    const rrppStaffByMember =
      new Map(
        eventRrppStaff.map(
          (row) => [
            row.organization_member_id,
            row,
          ]
        )
      );

    const eventCommissionPayments =
      commissionPayments.filter(
        (payment) =>
          payment.event_id ===
          event.id
      );

    const paymentsByStaffId =
      new Map<string, number>();

    for (
      const payment of
      eventCommissionPayments
    ) {
      const current =
        paymentsByStaffId.get(
          payment.event_staff_id
        ) ?? 0;

      paymentsByStaffId.set(
        payment.event_staff_id,
        current +
          Number(
            payment.amount_minor
          )
      );
    }

    // -------------------------------------------------
    // VENDEDORES / RRPP / PUERTA
    // -------------------------------------------------

    const sellerIds = [
      ...new Set(
        eventSales
          .map(
            (sale) =>
              sale.seller_member_id
          )
          .filter(Boolean)
      ),
    ];

    const sellerReports =
      sellerIds
        .map((sellerId) => {
          const member =
            memberMap.get(
              sellerId
            );

          const profile =
            member
              ? profileMap.get(
                  member.user_id
                )
              : undefined;

          const sellerSales =
            eventSales.filter(
              (sale) =>
                sale.seller_member_id ===
                sellerId
            );

          const sellerSaleIds =
            new Set(
              sellerSales.map(
                (sale) => sale.id
              )
            );

          const sellerItems =
            eventItems.filter(
              (item) =>
                sellerSaleIds.has(
                  item.sale_id
                )
            );

          const soldTickets =
            sellerItems.reduce(
              (total, item) =>
                total +
                Number(
                  item.quantity
                ),
              0
            );

          const revenue =
            sellerSales.reduce(
              (total, sale) =>
                total +
                Number(
                  sale.total_minor
                ),
              0
            );

          const sellerReturns =
            eventReturns.filter(
              (item) =>
                sellerSaleIds.has(
                  item.sale_id
                )
            );

          const sellerRefunded =
            sellerReturns
              .filter(
                (item) =>
                  item.refund_status ===
                  "refunded"
              )
              .reduce(
                (total, item) =>
                  total +
                  Number(
                    item.refund_amount_minor ??
                      0
                  ),
                0
              );

          const channel =
            sellerSales[0]
              ?.channel ??
            "organizer";

          // La comision se calcula SOLO sobre las ventas de este vendedor
          // que fueron por canal "rrpp" -- antes se decidia con el canal
          // de la primera venta (sellerSales[0], sin orden garantizado),
          // asi que un RRPP que tambien vendio una mesa podia perder toda
          // su comision (si la mesa quedaba primera) o cobrar comision
          // sobre plata de mesa/barra que no le corresponde (si quedaba
          // despues). "rrppStaff" no depende del canal de ninguna venta:
          // es la asignacion real de ese miembro como RRPP del evento.
          const rrppSales =
            sellerSales.filter(
              (sale) =>
                sale.channel ===
                "rrpp"
            );

          const rrppSaleIds =
            new Set(
              rrppSales.map(
                (sale) => sale.id
              )
            );

          const rrppRevenue =
            rrppSales.reduce(
              (total, sale) =>
                total +
                Number(
                  sale.total_minor
                ),
              0
            );

          const rrppStaff =
            rrppStaffByMember.get(
              sellerId
            );

          const commissionPercentage =
            rrppStaff
              ? Number(
                  rrppStaff.commission_percentage ??
                    0
                )
              : 0;

          const rrppReturnAmount =
            sellerReturns
              .filter(
                (item) =>
                  rrppSaleIds.has(
                    item.sale_id
                  )
              )
              .reduce(
                (total, item) =>
                  total +
                  Number(
                    item.refund_amount_minor ??
                      0
                  ),
                0
              );

          const commissionBase =
            rrppStaff
              ? Math.max(
                  0,
                  rrppRevenue -
                    rrppReturnAmount
                )
              : 0;

          const commissionGenerated =
            rrppStaff
              ? Math.round(
                  (commissionBase *
                    commissionPercentage) /
                    100
                )
              : 0;

          const commissionPaid =
            rrppStaff
              ? paymentsByStaffId.get(
                  rrppStaff.id
                ) ?? 0
              : 0;

          const commissionPending =
            Math.max(
              0,
              commissionGenerated -
                commissionPaid
            );

          return {
            memberId:
              sellerId,

            name:
              profile
                ? `${profile.first_name} ${profile.last_name}`.trim()
                : channel === "rrpp"
                  ? "RRPP"
                  : channel === "door"
                    ? "Venta en puerta"
                    : "Organizador",

            role:
              member?.role ??
              channel,

            channel,

            sales:
              sellerSales.length,

            tickets:
              soldTickets,

            returnedTickets:
              sellerReturns.length,

            revenue,

            refunded:
              sellerRefunded,

            netRevenue:
              Math.max(
                0,
                revenue -
                  sellerRefunded
              ),

            commissionPercentage,

            commissionBase,

            commissionGenerated,

            commissionPaid,

            commissionPending,
          };
        })
        .sort(
          (a, b) =>
            b.revenue -
            a.revenue
        );

    const rrppSellerReports =
      sellerReports.filter(
        (seller) =>
          seller.channel === "rrpp"
      );

    const rrppCommissionGenerated =
      rrppSellerReports.reduce(
        (total, seller) =>
          total +
          seller.commissionGenerated,
        0
      );

    const rrppCommissionPaid =
      eventCommissionPayments.reduce(
        (total, payment) =>
          total +
          Number(
            payment.amount_minor
          ),
        0
      );

    const rrppCommissionPending =
      rrppSellerReports.reduce(
        (total, seller) =>
          total +
          seller.commissionPending,
        0
      );

    // -------------------------------------------------
    // CONTROLADORES
    // -------------------------------------------------

    const eventControllers =
      staff
        .filter(
          (row) =>
            row.event_id ===
              event.id &&
            row.staff_role ===
              "controller"
        )
        .map((row) => {
          const member =
            memberMap.get(
              row.organization_member_id
            );

          const controllerProfile =
            member
              ? profileMap.get(
                  member.user_id
                )
              : undefined;

          return {
            memberId:
              row.organization_member_id,

            name:
              controllerProfile
                ? `${controllerProfile.first_name} ${controllerProfile.last_name}`.trim()
                : "Controlador",

            active:
              row.active &&
              member?.status ===
                "active",
          };
        });

    return {
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        venueName:
          event.venue_name,
        city: event.city,
        status: event.status,
      },

      metrics: {
        sales:
          eventSales.length,

        ticketsSold:
          validTickets.length,

        ticketsIssued:
          eventTickets.length,

        returnedTickets:
          eventReturns.length,

        cancelledTickets:
          cancelledTickets.length,

        totalRevenue,

        grossRevenue:
          totalRevenue,

        returnAmount,

        refundedAmount,

        pendingRefundAmount,

        netRevenue,

        rrppRevenue,

        rrppRefunded,

        rrppNetRevenue,

        doorRevenue,

        doorRefunded,

        doorNetRevenue,

        organizerRevenue,

        organizerRefunded,

        organizerNetRevenue,

        onlineRevenue,

        onlineRefunded,

        onlineNetRevenue,

        mesaRevenue,

        mesaRefunded,

        mesaNetRevenue,

        rrppCommissionGenerated,

        rrppCommissionPaid,

        rrppCommissionPending,

        rrppSales,

        doorSales,

        organizerSales,

        onlineSales,

        mesaSales,

        usedTickets:
          usedTickets.length,

        pendingTickets,

        attendancePercentage,

        buyers:
          buyerCount,

        firstEntry,

        lastEntry,
      },

      ticketTypes:
        ticketTypeReports,

      sellers:
        sellerReports,

      controllers:
        eventControllers,
    };
  });

  return (
    <InformesClient
      organizationName={
        organizationName
      }
      organizerName={
        organizerName
      }
      initials={initials}
      reports={reports}
    />
  );
}
