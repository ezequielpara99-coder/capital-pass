import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { sendPushToUser } from "../../../../lib/push/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

// Corre cada 5 minutos (ver vercel.json). Para cada organizador que
// configuro un resumen periodico, revisa si ya paso su intervalo y, si
// hubo actividad, le manda un push con entradas + tragos + mesas vendidas
// desde el ultimo resumen.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("notification_settings")
    .select("user_id, summary_interval_minutes, last_summary_sent_at")
    .not("summary_interval_minutes", "is", null);

  const now = Date.now();
  const due = (settings ?? []).filter((s) => {
    const last = s.last_summary_sent_at ? new Date(s.last_summary_sent_at).getTime() : 0;
    return now - last >= (s.summary_interval_minutes ?? 0) * 60_000;
  });

  if (due.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const userIds = due.map((d) => d.user_id);
  const { data: members } = await admin
    .from("organization_members")
    .select("user_id, organization_id")
    .in("user_id", userIds)
    .eq("role", "organizer")
    .eq("status", "active");

  // Un organizador puede administrar mas de una organizacion -- hay que
  // juntar todas, no quedarse con una sola (Map de user_id a un solo
  // organization_id perdia en silencio la actividad de las demas).
  const orgsByUser = new Map<string, string[]>();
  for (const m of members ?? []) {
    const list = orgsByUser.get(m.user_id) ?? [];
    list.push(m.organization_id);
    orgsByUser.set(m.user_id, list);
  }

  let sent = 0;

  // Si UN organizador falla (excepcion real, no solo un error suave) no
  // puede cortar el resto del lote -- este cron corre cada 5 minutos
  // sobre todos los que tienen resumen periodico activado, y antes una
  // sola falla dejaba sin procesar a todos los que venian despues en el
  // array hasta el proximo tick.
  for (const item of due) {
    try {
      const organizationIds = orgsByUser.get(item.user_id);
      if (!organizationIds || organizationIds.length === 0) continue;

      const { data: events } = await admin.from("events").select("id").in("organization_id", organizationIds);
      const eventIds = (events ?? []).map((e) => e.id);
      const nowIso = new Date().toISOString();

      if (eventIds.length === 0) {
        await admin.from("notification_settings").update({ last_summary_sent_at: nowIso }).eq("user_id", item.user_id);
        continue;
      }

      const since = item.last_summary_sent_at ?? new Date(0).toISOString();

      const [{ data: barSales }, { data: mesaSales }, { data: ticketSales }] = await Promise.all([
        admin.from("bar_sales").select("total_minor").in("event_id", eventIds).is("cancelled_at", null).gt("created_at", since),
        admin.from("sales").select("total_minor").in("event_id", eventIds).eq("channel", "mesa").eq("status", "confirmed").gt("created_at", since),
        admin.from("sales").select("total_minor").in("event_id", eventIds).in("channel", ["organizer", "rrpp", "door", "online"]).eq("status", "confirmed").gt("created_at", since),
      ]);

      const barCount = barSales?.length ?? 0;
      const mesaCount = mesaSales?.length ?? 0;
      const ticketCount = ticketSales?.length ?? 0;
      const totalMinor =
        (barSales ?? []).reduce((sum, s) => sum + Number(s.total_minor), 0) +
        (mesaSales ?? []).reduce((sum, s) => sum + Number(s.total_minor), 0) +
        (ticketSales ?? []).reduce((sum, s) => sum + Number(s.total_minor), 0);

      if (barCount + mesaCount + ticketCount === 0) {
        await admin.from("notification_settings").update({ last_summary_sent_at: nowIso }).eq("user_id", item.user_id);
        continue;
      }

      const parts: string[] = [];
      if (ticketCount) parts.push(`${ticketCount} entrada${ticketCount !== 1 ? "s" : ""}`);
      if (barCount) parts.push(`${barCount} trago${barCount !== 1 ? "s" : ""}`);
      if (mesaCount) parts.push(`${mesaCount} mesa${mesaCount !== 1 ? "s" : ""}`);

      await sendPushToUser(item.user_id, {
        title: "📊 Resumen de ventas",
        body: `${parts.join(", ")} — ${money(totalMinor)}`,
        url: "/panel/stock",
      });

      await admin.from("notification_settings").update({ last_summary_sent_at: nowIso }).eq("user_id", item.user_id);
      sent++;
    } catch (error) {
      console.error("CRON RESUMEN: fallo procesando a un organizador, sigue con el resto.", item.user_id, error);
    }
  }

  return NextResponse.json({ ok: true, sent });
}
