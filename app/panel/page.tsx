import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";
import { pickSelectedEvent } from "../../lib/panel/selected-event";
import OrganizerPanelClient from "./organizer-panel-client";
import IngresosPanel from "./ingresos-panel";
import VentasPanel from "./ventas-panel";

type SearchParams = Promise<{
  section?: string;
  eventId?: string;
}>;

export default async function OrganizerPanel({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();

  const params = await searchParams;

  const section =
    params.section ?? "inicio";

  const requestedEventId =
    params.eventId?.trim() ||
    null;

  if (section === "notificaciones") {
    redirect(
      requestedEventId
        ? `/panel/notificaciones?eventId=${encodeURIComponent(
            requestedEventId
          )}`
        : "/panel/notificaciones"
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();
  const fallbackAdminEmails = ["ezequiel.para99@gmail.com"];
  const isFallbackAdmin = Boolean(user.email && fallbackAdminEmails.includes(user.email.toLowerCase()));
  const { data: platformAdminRow } = isFallbackAdmin
    ? { data: null }
    : await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  const isAdmin = isFallbackAdmin || Boolean(platformAdminRow);

  const { data: profile } =
    await supabase
      .from("profiles")
      .select(`
        first_name,
        last_name
      `)
      .eq("id", user.id)
      .maybeSingle();

  const { data: membership } =
    await supabase
      .from("organization_members")
      .select(`
        id,
        organization_id,
        role,
        status
      `)
      .eq("user_id", user.id)
      .eq("role", "organizer")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

  if (!membership) {
    return null;
  }

  const { data: organization } =
    await supabase
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

  const firstName =
    profile?.first_name?.trim() ||
    "Organizador";

  const lastName =
    profile?.last_name?.trim() ||
    "";

  const organizerName =
    `${firstName} ${lastName}`.trim();

  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`
      .toUpperCase()
      .trim() || "OP";

  const eventSelect = `
    id,
    name,
    slug,
    starts_at,
    venue_name,
    city,
    status
  `;

  const { data: allEvents } =
    await supabase
      .from("events")
      .select(eventSelect)
      .eq(
        "organization_id",
        membership.organization_id
      )
      .order("starts_at", {
        ascending: false,
      })
      .order("created_at", {
        ascending: false,
      });

  const event =
    await pickSelectedEvent(
      allEvents ?? [],
      requestedEventId
    );

  const eventOptions =
    (allEvents ?? []).map(
      (item) => ({
        id: item.id,
        name: item.name,
      })
    );

  if (
    section === "ventas" &&
    event
  ) {
    const {
      data: salesData,
      error: salesError,
    } = await supabase
      .from("sales")
      .select(`
        id,
        buyer_id,
        seller_member_id,
        total_minor,
        channel,
        status,
        created_at
      `)
      .eq(
        "event_id",
        event.id
      )
      .eq(
        "status",
        "confirmed"
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (salesError) {
      console.error(
        "ERROR VENTAS:",
        salesError
      );
    }

    const saleRows =
      salesData ?? [];

    const saleIds =
      saleRows.map(
        (sale) => sale.id
      );

    const buyerIds = [
      ...new Set(
        saleRows
          .map(
            (sale) =>
              sale.buyer_id
          )
          .filter(Boolean)
      ),
    ];

    let buyerRows: {
      id: string;
      first_name: string;
      last_name: string;
      dni: string | null;
    }[] = [];

    if (
      buyerIds.length > 0
    ) {
      const {
        data: buyersData,
      } = await supabase
        .from("buyers")
        .select(`
          id,
          first_name,
          last_name,
          dni
        `)
        .in(
          "id",
          buyerIds
        );

      buyerRows =
        (buyersData ??
          []) as typeof buyerRows;
    }

    const buyerMap =
      new Map(
        buyerRows.map(
          (buyer) => [
            buyer.id,
            buyer,
          ]
        )
      );

    let saleItemRows: {
      id: string;
      sale_id: string;
      ticket_type_id: string;
      quantity: number;
    }[] = [];

    if (
      saleIds.length > 0
    ) {
      const {
        data: itemData,
        error: itemError,
      } = await supabase
        .from("sale_items")
        .select(`
          id,
          sale_id,
          ticket_type_id,
          quantity
        `)
        .in(
          "sale_id",
          saleIds
        );

      if (itemError) {
        console.error(
          "ERROR SALE ITEMS:",
          itemError
        );
      }

      saleItemRows =
        (itemData ??
          []) as typeof saleItemRows;
    }

    const typeIds = [
      ...new Set(
        saleItemRows
          .map(
            (item) =>
              item.ticket_type_id
          )
          .filter(Boolean)
      ),
    ];

    let typeRows: {
      id: string;
      name: string;
    }[] = [];

    if (
      typeIds.length > 0
    ) {
      const {
        data: typesData,
      } = await supabase
        .from("ticket_types")
        .select(`
          id,
          name
        `)
        .in(
          "id",
          typeIds
        );

      typeRows =
        (typesData ??
          []) as typeof typeRows;
    }

    const typeMap =
      new Map(
        typeRows.map(
          (type) => [
            type.id,
            type.name,
          ]
        )
      );

    const itemsBySale =
      new Map<
        string,
        typeof saleItemRows
      >();

    for (
      const item of saleItemRows
    ) {
      const existing =
        itemsBySale.get(
          item.sale_id
        ) ?? [];

      existing.push(item);

      itemsBySale.set(
        item.sale_id,
        existing
      );
    }

    const sellerMemberIds = [
      ...new Set(
        saleRows
          .map(
            (sale) =>
              sale.seller_member_id
          )
          .filter(Boolean)
      ),
    ];

    let sellerMembers: {
      id: string;
      user_id: string;
    }[] = [];

    if (
      sellerMemberIds.length > 0
    ) {
      const {
        data: memberData,
      } = await supabase
        .from(
          "organization_members"
        )
        .select(`
          id,
          user_id
        `)
        .in(
          "id",
          sellerMemberIds
        );

      sellerMembers =
        (memberData ??
          []) as typeof sellerMembers;
    }

    const sellerUserIds = [
      ...new Set(
        sellerMembers
          .map(
            (member) =>
              member.user_id
          )
          .filter(Boolean)
      ),
    ];

    let sellerProfiles: {
      id: string;
      first_name: string;
      last_name: string;
    }[] = [];

    if (
      sellerUserIds.length > 0
    ) {
      const {
        data: sellerProfileData,
      } = await supabase
        .from("profiles")
        .select(`
          id,
          first_name,
          last_name
        `)
        .in(
          "id",
          sellerUserIds
        );

      sellerProfiles =
        (sellerProfileData ??
          []) as typeof sellerProfiles;
    }

    const memberMap =
      new Map(
        sellerMembers.map(
          (member) => [
            member.id,
            member.user_id,
          ]
        )
      );

    const sellerProfileMap =
      new Map(
        sellerProfiles.map(
          (seller) => [
            seller.id,
            seller,
          ]
        )
      );

    const salesForPanel =
      saleRows.map(
        (sale) => {
          const buyer =
            buyerMap.get(
              sale.buyer_id
            );

          const items =
            itemsBySale.get(
              sale.id
            ) ?? [];

          const quantity =
            items.reduce(
              (
                total,
                item
              ) =>
                total +
                Number(
                  item.quantity
                ),
              0
            );

          const ticketNames = [
            ...new Set(
              items
                .map(
                  (item) =>
                    typeMap.get(
                      item.ticket_type_id
                    )
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

          let ticketType =
            "Entrada";

          if (
            ticketNames.length ===
            1
          ) {
            ticketType =
              ticketNames[0];
          }

          if (
            ticketNames.length >
            1
          ) {
            ticketType =
              ticketNames.join(
                " + "
              );
          }

          const sellerUserId =
            memberMap.get(
              sale.seller_member_id
            );

          const sellerProfile =
            sellerUserId
              ? sellerProfileMap.get(
                  sellerUserId
                )
              : undefined;

          let sellerName =
            organizerName;

          if (
            sellerProfile
          ) {
            sellerName =
              `${sellerProfile.first_name} ${sellerProfile.last_name}`.trim();
          } else if (
            sale.channel ===
            "rrpp"
          ) {
            sellerName =
              "RRPP";
          } else if (
            sale.channel ===
            "door"
          ) {
            sellerName =
              "Venta en puerta";
          }

          return {
            id: sale.id,

            buyerName:
              buyer
                ? `${buyer.first_name} ${buyer.last_name}`.trim()
                : "Comprador",

            buyerDni:
              buyer?.dni ??
              null,

            sellerName,

            channel:
              sale.channel,

            ticketType,

            quantity,

            total:
              Number(
                sale.total_minor
              ),

            status:
              sale.status,

            createdAt:
              sale.created_at,
          };
        }
      );

    const totalTickets =
      saleItemRows.reduce(
        (
          total,
          item
        ) =>
          total +
          Number(
            item.quantity
          ),
        0
      );

    const totalSold =
      saleRows.reduce(
        (
          total,
          sale
        ) =>
          total +
          Number(
            sale.total_minor
          ),
        0
      );

    const rrppSales =
      saleRows.filter(
        (sale) =>
          sale.channel ===
          "rrpp"
      ).length;

    return (
      <VentasPanel
        event={{
          id: event.id,
          name: event.name,
        }}
        organizationName={
          organizationName
        }
        initials={initials}
        metrics={{
          sales:
            saleRows.length,

          tickets:
            totalTickets,

          total:
            totalSold,

          rrppSales,
        }}
        sales={
          salesForPanel
        }
      />
    );
  }

  if (
    section === "ingresos" &&
    event
  ) {
    const admin =
      createAdminClient();

    const {
      data: controllerMembers,
    } = await admin
      .from(
        "organization_members"
      )
      .select(`
        id,
        user_id,
        status
      `)
      .eq(
        "organization_id",
        membership.organization_id
      )
      .eq(
        "role",
        "controller"
      );

    const members =
      controllerMembers ?? [];

    const memberIds =
      members.map(
        (member) =>
          member.id
      );

    const userIds =
      members.map(
        (member) =>
          member.user_id
      );

    let controllerProfiles: {
      id: string;
      first_name: string;
      last_name: string;
    }[] = [];

    if (
      userIds.length > 0
    ) {
      const {
        data: profileData,
      } = await admin
        .from("profiles")
        .select(`
          id,
          first_name,
          last_name
        `)
        .in(
          "id",
          userIds
        );

      controllerProfiles =
        (profileData ??
          []) as typeof controllerProfiles;
    }

    const profileMap =
      new Map(
        controllerProfiles.map(
          (item) => [
            item.id,
            item,
          ]
        )
      );

    let staffRows: {
      id: string;
      organization_member_id: string;
      active: boolean;
    }[] = [];

    if (
      memberIds.length > 0
    ) {
      const {
        data: staffData,
      } = await admin
        .from("event_staff")
        .select(`
          id,
          organization_member_id,
          active
        `)
        .eq(
          "event_id",
          event.id
        )
        .eq(
          "staff_role",
          "controller"
        )
        .in(
          "organization_member_id",
          memberIds
        );

      staffRows =
        (staffData ??
          []) as typeof staffRows;
    }

    const staffMap =
      new Map(
        staffRows.map(
          (row) => [
            row.organization_member_id,
            row,
          ]
        )
      );

    const controllers =
      members.map(
        (member) => {
          const profile =
            profileMap.get(
              member.user_id
            );

          const staff =
            staffMap.get(
              member.id
            );

          return {
            memberId:
              member.id,

            firstName:
              profile?.first_name ??
              "Control",

            lastName:
              profile?.last_name ??
              "Ingreso",

            active:
              member.status ===
                "active" &&
              Boolean(
                staff?.active
              ),
          };
        }
      );

    const {
      data: ticketData,
    } = await admin
      .from("tickets")
      .select(`
        id,
        display_number,
        sale_id,
        ticket_type_id,
        manual_code,
        status,
        used_at
      `)
      .eq(
        "event_id",
        event.id
      );

    const allTickets =
      ticketData ?? [];

    const sold =
      allTickets.filter(
        (ticket) =>
          ticket.status !==
          "cancelled"
      ).length;

    const usedTickets =
      allTickets
        .filter(
          (ticket) =>
            ticket.status ===
            "used"
        )
        .sort(
          (a, b) =>
            new Date(
              b.used_at ?? 0
            ).getTime() -
            new Date(
              a.used_at ?? 0
            ).getTime()
        );

    const used =
      usedTickets.length;

    const pending =
      Math.max(
        0,
        sold - used
      );

    const saleIds = [
      ...new Set(
        usedTickets
          .map(
            (ticket) =>
              ticket.sale_id
          )
          .filter(Boolean)
      ),
    ];

    let saleRows: {
      id: string;
      buyer_id: string;
    }[] = [];

    if (
      saleIds.length > 0
    ) {
      const {
        data: salesData,
      } = await admin
        .from("sales")
        .select(`
          id,
          buyer_id
        `)
        .in(
          "id",
          saleIds
        );

      saleRows =
        (salesData ??
          []) as typeof saleRows;
    }

    const saleMap =
      new Map(
        saleRows.map(
          (sale) => [
            sale.id,
            sale,
          ]
        )
      );

    const buyerIds = [
      ...new Set(
        saleRows
          .map(
            (sale) =>
              sale.buyer_id
          )
          .filter(Boolean)
      ),
    ];

    let buyerRows: {
      id: string;
      first_name: string;
      last_name: string;
      dni: string | null;
    }[] = [];

    if (
      buyerIds.length > 0
    ) {
      const {
        data: buyersData,
      } = await admin
        .from("buyers")
        .select(`
          id,
          first_name,
          last_name,
          dni
        `)
        .in(
          "id",
          buyerIds
        );

      buyerRows =
        (buyersData ??
          []) as typeof buyerRows;
    }

    const buyerMap =
      new Map(
        buyerRows.map(
          (buyer) => [
            buyer.id,
            buyer,
          ]
        )
      );

    const typeIds = [
      ...new Set(
        usedTickets
          .map(
            (ticket) =>
              ticket.ticket_type_id
          )
          .filter(Boolean)
      ),
    ];

    let typeRows: {
      id: string;
      name: string;
    }[] = [];

    if (
      typeIds.length > 0
    ) {
      const {
        data: typesData,
      } = await admin
        .from("ticket_types")
        .select(`
          id,
          name
        `)
        .in(
          "id",
          typeIds
        );

      typeRows =
        (typesData ??
          []) as typeof typeRows;
    }

    const typeMap =
      new Map(
        typeRows.map(
          (type) => [
            type.id,
            type.name,
          ]
        )
      );

    const recentEntries =
      usedTickets
        .slice(0, 20)
        .map(
          (ticket) => {
            const sale =
              saleMap.get(
                ticket.sale_id
              );

            const buyer =
              sale
                ? buyerMap.get(
                    sale.buyer_id
                  )
                : undefined;

            return {
              id:
                ticket.id,

              displayNumber:
                Number(
                  ticket.display_number
                ),

              manualCode:
                ticket.manual_code,

              usedAt:
                ticket.used_at,

              buyerName:
                buyer
                  ? `${buyer.first_name} ${buyer.last_name}`
                  : "Comprador",

              buyerDni:
                buyer?.dni ??
                null,

              ticketType:
                typeMap.get(
                  ticket.ticket_type_id
                ) ??
                "Entrada",
            };
          }
        );

    return (
      <IngresosPanel
        event={{
          id: event.id,
          name: event.name,
        }}
        organizationName={
          organizationName
        }
        organizerName={
          organizerName
        }
        initials={initials}
        metrics={{
          sold,
          used,
          pending,
        }}
        controllers={
          controllers
        }
        recentEntries={
          recentEntries
        }
      />
    );
  }

  let ticketTypes: {
    id: string;
    name: string;
    price_minor: number;
    capacity: number;
    status: string;
    active: boolean;
  }[] = [];

  let tickets: {
    id: string;
    ticket_type_id: string;
    status: string;
  }[] = [];

  let sales: {
    id: string;
    buyer_id: string;
    total_minor: number;
    channel: string;
    created_at: string;
  }[] = [];

  let buyers: {
    id: string;
    first_name: string;
    last_name: string;
  }[] = [];

  if (event) {
    const { data: types } =
      await supabase
        .from("ticket_types")
        .select(`
          id,
          name,
          price_minor,
          capacity,
          status,
          active
        `)
        .eq(
          "event_id",
          event.id
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        );

    ticketTypes =
      (types ??
        []) as typeof ticketTypes;

    const {
      data: ticketData,
    } = await supabase
      .from("tickets")
      .select(`
        id,
        ticket_type_id,
        status
      `)
      .eq(
        "event_id",
        event.id
      );

    tickets =
      (ticketData ??
        []) as typeof tickets;

    const {
      data: salesData,
    } = await supabase
      .from("sales")
      .select(`
        id,
        buyer_id,
        total_minor,
        channel,
        created_at
      `)
      .eq(
        "event_id",
        event.id
      )
      .eq(
        "status",
        "confirmed"
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    sales =
      (salesData ??
        []) as typeof sales;

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

    if (
      buyerIds.length > 0
    ) {
      const {
        data: buyerData,
      } = await supabase
        .from("buyers")
        .select(`
          id,
          first_name,
          last_name
        `)
        .in(
          "id",
          buyerIds
        );

      buyers =
        (buyerData ??
          []) as typeof buyers;
    }
  }

  const totalCapacity =
    ticketTypes.reduce(
      (
        total,
        ticket
      ) =>
        total +
        Number(
          ticket.capacity
        ),
      0
    );

  const soldTickets =
    tickets.filter(
      (ticket) =>
        ticket.status !==
        "cancelled"
    ).length;

  const usedTickets =
    tickets.filter(
      (ticket) =>
        ticket.status ===
        "used"
    ).length;

  const availableTicketsNow =
    ticketTypes.reduce(
      (
        total,
        type
      ) => {
        if (
          !type.active ||
          type.status !==
            "available"
        ) {
          return total;
        }

        const sold =
          tickets.filter(
            (ticket) =>
              ticket.ticket_type_id ===
                type.id &&
              ticket.status !==
                "cancelled"
          ).length;

        return (
          total +
          Math.max(
            0,
            Number(
              type.capacity
            ) -
              sold
          )
        );
      },
      0
    );

  const totalSales =
    sales.reduce(
      (
        total,
        sale
      ) =>
        total +
        Number(
          sale.total_minor
        ),
      0
    );

  const buyerMap =
    new Map(
      buyers.map(
        (buyer) => [
          buyer.id,
          `${buyer.first_name} ${buyer.last_name}`,
        ]
      )
    );

  const ticketCards =
    ticketTypes.map(
      (type) => {
        const sold =
          tickets.filter(
            (ticket) =>
              ticket.ticket_type_id ===
                type.id &&
              ticket.status !==
                "cancelled"
          ).length;

        return {
          id:
            type.id,

          name:
            type.name,

          price:
            Number(
              type.price_minor
            ),

          sold,

          capacity:
            Number(
              type.capacity
            ),

          status:
            type.status,
        };
      }
    );

  const recentSales =
    sales
      .slice(0, 5)
      .map(
        (sale) => ({
          id:
            sale.id,

          buyer:
            buyerMap.get(
              sale.buyer_id
            ) ??
            "Comprador",

          total:
            Number(
              sale.total_minor
            ),

          channel:
            sale.channel,

          createdAt:
            sale.created_at,
        })
      );

  const supportWhatsAppUrl =
    buildSupportWhatsAppUrl();

  return (
    <>
      <OrganizerPanelClient
        section={section}
        isAdmin={isAdmin}
        organizerName={
          organizerName
        }
        initials={
          initials
        }
        organizationName={
          organizationName
        }
        events={eventOptions}
        event={
          event
            ? {
                id:
                  event.id,

                name:
                  event.name,

                slug:
                  event.slug,

                startsAt:
                  event.starts_at,

                venueName:
                  event.venue_name,

                city:
                  event.city,

                status:
                  event.status,
              }
            : null
        }
        metrics={{
          soldTickets,

          totalCapacity,

          availableTicketsNow,

          usedTickets,

          totalSales,
        }}
        ticketCards={
          ticketCards
        }
        recentSales={
          recentSales
        }
      />

      {supportWhatsAppUrl && (
        <a
          href={
            supportWhatsAppUrl
          }
          target="_blank"
          rel="noreferrer"
          aria-label="Atención al cliente por WhatsApp"
          className="group fixed bottom-5 right-5 z-[250] inline-flex items-center gap-3 rounded-2xl border border-emerald-300/20 bg-[#07110d]/92 px-4 py-3 text-white shadow-[0_18px_55px_rgba(16,185,129,.16),inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur-xl transition duration-200 hover:scale-[1.03] hover:border-emerald-300/35 hover:bg-[#0a1711] md:bottom-7 md:right-7"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/[0.09] text-emerald-300 shadow-[0_0_25px_rgba(16,185,129,.10)]">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
              <path d="M3 13a2 2 0 0 1 2-2h1v5H5a2 2 0 0 1-2-2v-1Z" />
              <path d="M21 13a2 2 0 0 0-2-2h-1v5h1a2 2 0 0 0 2-2v-1Z" />
              <path d="M18 16v1a3 3 0 0 1-3 3h-2" />
              <circle cx="12" cy="19" r="1.2" />
            </svg>
          </span>

          <span className="hidden sm:block">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300/70">
              Soporte
            </span>

            <span className="mt-0.5 block text-sm font-semibold text-white/90">
              Atención al cliente
            </span>
          </span>

          <span className="hidden text-sm text-emerald-300 transition group-hover:translate-x-0.5 sm:block">
            ↗
          </span>
        </a>
      )}
    </>
  );
}

function buildSupportWhatsAppUrl() {
  const rawPhone =
    process.env
      .NEXT_PUBLIC_SUPPORT_WHATSAPP ??
    "";

  const phone =
    rawPhone.replace(
      /\D/g,
      ""
    );

  if (!phone) {
    return null;
  }

  const message =
    "Hola Capital Pass, necesito ayuda con mi cuenta.";

  return `https://wa.me/${phone}?text=${encodeURIComponent(
    message
  )}`;
}