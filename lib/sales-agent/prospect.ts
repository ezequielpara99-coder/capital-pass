import "server-only";
import { createAdminClient } from "../supabase/admin";
import { normalizeInstagramUsername, normalizeWebsiteDomain, normalizePhoneDigits, phoneMatchKey, normalizeEmail } from "./duplicates";
import { computeProspectScore, type ScoreInput } from "./scoring";
import { detectOpportunities } from "./opportunities";

export const PROSPECT_FIELDS =
  "id, campaign_id, name, instagram_username, instagram_url, website, city, province, country, category, followers, events_per_month, email, phone, whatsapp, ticketing_provider, ticketing_url, ticketing_confidence, score, score_reasons, score_missing, potential, status, source, responsible_user_id, notes, last_contacted_at, next_followup_at, investigated_at, created_at, updated_at";

export const CATEGORIES = [
  "boliche", "discoteca", "club", "productora", "organizador", "fiesta_electronica", "fiesta_universitaria",
  "evento_masivo", "bar", "rooftop", "salon", "festival", "corporativo", "deportivo", "cultural", "dj", "otro",
] as const;

export const STATUSES = [
  "nuevo", "investigando", "calificado", "listo_para_contactar", "contactado",
  "respondio", "interesado", "demo", "negociacion", "cliente", "no_interesado", "no_contactar",
] as const;

type Admin = ReturnType<typeof createAdminClient>;

export function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

export type ProspectInput = {
  name: string;
  instagramUsername?: string | null;
  instagramUrl?: string | null;
  website?: string | null;
  city?: string | null;
  province?: string | null;
  category?: string | null;
  followers?: number | null;
  eventsPerMonth?: number | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  notes?: string | null;
  campaignId?: string | null;
};

// Chequea duplicados por instagram/web/telefono/email ANTES de guardar (los
// indices unicos parciales de la base son la ultima linea de defensa, no la
// primera: aca se puede devolver un mensaje util con el prospecto existente).
export async function findDuplicate(admin: Admin, input: ProspectInput): Promise<{ id: string; name: string; reason: string } | null> {
  const checks: { column: string; value: string | null; reason: string }[] = [
    { column: "instagram_username", value: normalizeInstagramUsername(input.instagramUsername), reason: "el mismo Instagram" },
    { column: "website_domain", value: normalizeWebsiteDomain(input.website), reason: "el mismo sitio web" },
    { column: "phone_match_key", value: phoneMatchKey(input.whatsapp || input.phone), reason: "el mismo teléfono" },
    { column: "email_norm", value: normalizeEmail(input.email), reason: "el mismo email" },
  ];
  for (const check of checks) {
    if (!check.value) continue;
    const query = check.column === "instagram_username"
      ? admin.from("prospects").select("id, name").ilike("instagram_username", check.value)
      : admin.from("prospects").select("id, name").eq(check.column, check.value);
    const { data } = await query.is("deleted_at", null).limit(1).maybeSingle();
    if (data) return { id: data.id as string, name: data.name as string, reason: check.reason };
  }
  return null;
}

export function normalizedColumns(input: ProspectInput) {
  return {
    // instagram_username se guarda YA normalizado (sin @, en minusculas, y
    // si pegaron una URL de instagram.com/usuario se extrae el usuario) --
    // es la misma columna que se muestra ("@" + esto) y la que usa el
    // indice unico, asi que si se guardara cruda un "@usuario" quedaba
    // como "@@usuario" en pantalla y dos formas distintas de cargar el
    // mismo Instagram (con o sin @, con URL completa) no se detectaban
    // como duplicado.
    instagram_username: normalizeInstagramUsername(input.instagramUsername),
    website_domain: normalizeWebsiteDomain(input.website ?? null),
    phone_digits: normalizePhoneDigits(input.whatsapp || input.phone || null),
    phone_match_key: phoneMatchKey(input.whatsapp || input.phone || null),
    email_norm: normalizeEmail(input.email ?? null),
  };
}

// Recalcula puntaje + oportunidades a partir del estado actual del prospecto
// (en la base) y las guarda. Se llama tanto al crear/editar a mano como
// despues de investigar. admin/investigar pasan sus propias señales extra
// (hasRrppMention, hasUpcomingEvent, sellsOnline, externalToolsCount) porque
// esas no viven como columnas propias del prospecto.
export async function rescoreProspect(
  admin: Admin,
  prospectId: string,
  extra: { hasRrppMention?: boolean; hasUpcomingEvent?: boolean; sellsOnline?: boolean | null; externalToolsCount?: number } = {}
) {
  const { data: prospect, error } = await admin
    .from("prospects")
    .select("events_per_month, followers, website, instagram_username, ticketing_provider, email, phone, whatsapp")
    .eq("id", prospectId)
    .maybeSingle();
  if (error || !prospect) throw error ?? new Error("Prospecto no encontrado.");

  const { count: opportunityCount } = await admin.from("prospect_opportunities").select("id", { count: "exact", head: true }).eq("prospect_id", prospectId);

  const scoreInput: ScoreInput = {
    eventsPerMonth: prospect.events_per_month,
    followers: prospect.followers,
    sellsOnline: extra.sellsOnline ?? (prospect.ticketing_provider ? prospect.ticketing_provider !== "no_identificado" : null),
    ticketingProvider: prospect.ticketing_provider,
    opportunityCount: opportunityCount ?? 0,
    externalToolsCount: extra.externalToolsCount ?? 0,
    hasWebsite: Boolean(prospect.website),
    hasInstagram: Boolean(prospect.instagram_username),
    hasUpcomingEvent: extra.hasUpcomingEvent ?? false,
    email: prospect.email,
    phone: prospect.phone,
    whatsapp: prospect.whatsapp,
  };
  const result = computeProspectScore(scoreInput);

  await admin
    .from("prospects")
    .update({ score: result.score, potential: result.potential, score_reasons: result.reasons, score_missing: result.missing, updated_at: new Date().toISOString() })
    .eq("id", prospectId);

  return result;
}

export { detectOpportunities };
