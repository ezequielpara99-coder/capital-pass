import { cookies } from "next/headers";
import Link from "next/link";

import { createAdminClient } from "../../lib/supabase/admin";
import { verifySessionToken, CUSTOMER_SESSION_COOKIE } from "../../lib/customer/session";
import { createTicketPublicPath } from "../../lib/tickets/signature";
import { createMemberPublicPath } from "../../lib/members/signature";
import MiClient from "./mi-client";

function formatMoney(minor: number) {
  return `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(minor)}`;
}

function formatEventDate(value: string | null) {
  if (!value) return "Fecha a confirmar";
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

const STATUS_LABEL: Record<string, string> = { active: "Activo", expired: "Vencido", cancelled: "Cancelado" };

export default async function MiPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorParam } = await searchParams;
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value ?? "";
  const email = sessionCookie ? verifySessionToken(sessionCookie) : null;

  if (!email) {
    return <MiClient expiredLink={errorParam === "vencido"} />;
  }

  const admin = createAdminClient();

  // Entradas: todas las de compradores con este email, sin importar la
  // organizacion -- el portal es "mis cosas en Capital Pass", no de un solo
  // organizador.
  const { data: buyers } = await admin.from("buyers").select("id, first_name, last_name").eq("email", email);
  const buyerIds = (buyers ?? []).map((b) => b.id);

  type TicketRow = {
    id: string;
    manual_code: string | null;
    status: string;
    event_id: string;
    ticket_type_id: string | null;
  };

  let tickets: TicketRow[] = [];
  let eventNames = new Map<string, { name: string; starts_at: string | null; venue_name: string | null }>();
  let typeNames = new Map<string, string>();

  if (buyerIds.length > 0) {
    const { data: sales } = await admin.from("sales").select("id, event_id, buyer_id").in("buyer_id", buyerIds).eq("status", "confirmed");
    const saleIds = (sales ?? []).map((s) => s.id);

    if (saleIds.length > 0) {
      const { data: ticketRows } = await admin
        .from("tickets")
        .select("id, manual_code, status, event_id, ticket_type_id, sale_id")
        .in("sale_id", saleIds)
        .eq("status", "issued");
      tickets = (ticketRows ?? []) as TicketRow[];

      const eventIds = [...new Set(tickets.map((t) => t.event_id))];
      if (eventIds.length > 0) {
        const { data: events } = await admin.from("events").select("id, name, starts_at, venue_name").in("id", eventIds);
        eventNames = new Map((events ?? []).map((e) => [e.id, { name: e.name, starts_at: e.starts_at, venue_name: e.venue_name }]));
      }

      const typeIds = [...new Set(tickets.map((t) => t.ticket_type_id).filter((id): id is string => Boolean(id)))];
      if (typeIds.length > 0) {
        const { data: types } = await admin.from("ticket_types").select("id, name").in("id", typeIds);
        typeNames = new Map((types ?? []).map((t) => [t.id, t.name]));
      }
    }
  }

  // Ordena por fecha del evento, mas proximo primero.
  const sortedTickets = [...tickets].sort((a, b) => {
    const dateA = eventNames.get(a.event_id)?.starts_at ?? "";
    const dateB = eventNames.get(b.event_id)?.starts_at ?? "";
    return dateA.localeCompare(dateB);
  });

  const { data: members } = await admin
    .from("premium_members")
    .select("id, first_name, last_name, member_code, status, expires_at, balance_minor, organization_id")
    .eq("email", email);

  const orgIds = [...new Set((members ?? []).map((m) => m.organization_id))];
  const orgNames = orgIds.length
    ? new Map(((await admin.from("organizations").select("id, name").in("id", orgIds)).data ?? []).map((o) => [o.id, o.name]))
    : new Map<string, string>();

  const buyerName = buyers?.[0] ? `${buyers[0].first_name} ${buyers[0].last_name}` : email;

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[700px] px-5 py-8 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] pb-8">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass</p>
            <h1 className="mt-3 text-[clamp(28px,5vw,44px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Hola, {buyerName.split(" ")[0]}.</h1>
            <p className="mt-2 text-sm text-white/40">{email}</p>
          </div>
          <form action="/api/mi/salir" method="post">
            <button type="submit" className="h-10 border border-white/[0.14] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/50 transition hover:border-white/40 hover:text-white">
              Salir
            </button>
          </form>
        </header>

        {members && members.length > 0 && (
          <section className="mt-8">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Mi membresía</p>
            <div className="mt-3 space-y-2">
              {members.map((member) => (
                <Link
                  key={member.id}
                  href={createMemberPublicPath(member.id)}
                  className="flex items-center gap-3 border border-violet-400/20 bg-violet-400/[0.05] px-4 py-3 transition hover:border-violet-400/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{orgNames.get(member.organization_id) ?? "Socio premium"}</p>
                    <p className="mt-0.5 text-[11px] text-white/35">
                      {STATUS_LABEL[member.status] ?? member.status} · Código {member.member_code}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-black text-emerald-300">{formatMoney(Number(member.balance_minor))}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Mis entradas</p>
          {sortedTickets.length === 0 ? (
            <div className="mt-3 border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">
              Todavía no tenés entradas activas con este email.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {sortedTickets.map((ticket) => {
                const event = eventNames.get(ticket.event_id);
                return (
                  <Link
                    key={ticket.id}
                    href={createTicketPublicPath(ticket.id)}
                    className="flex items-center gap-3 border border-white/[0.08] bg-white/[0.02] px-4 py-3 transition hover:border-white/25"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{event?.name ?? "Evento"}</p>
                      <p className="mt-0.5 truncate text-[11px] text-white/35">
                        {formatEventDate(event?.starts_at ?? null)}
                        {event?.venue_name ? ` · ${event.venue_name}` : ""}
                        {" · "}
                        {typeNames.get(ticket.ticket_type_id ?? "") ?? "Entrada"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-white/30">Ver →</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
