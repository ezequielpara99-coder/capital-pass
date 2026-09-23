import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import SubmitButton from "./submit-button";

// ============================================================
// CREAR EVENTO
// ============================================================

async function createEvent(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // =========================================================
  // ORGANIZACIÓN
  // =========================================================

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    redirect(
      "/panel/eventos/nuevo?error=No+pudimos+encontrar+tu+organizacion"
    );
  }

  // =========================================================
  // DATOS
  // =========================================================

  const name = String(
    formData.get("name") ?? ""
  ).trim();

  const description = String(
    formData.get("description") ?? ""
  ).trim();

  const city = String(
    formData.get("city") ?? ""
  ).trim();

  const venueName = String(
    formData.get("venue_name") ?? ""
  ).trim();

  const startsAtRaw = String(
    formData.get("starts_at") ?? ""
  ).trim();

  const endsAtRaw = String(
    formData.get("ends_at") ?? ""
  ).trim();

  // =========================================================
  // VALIDACIÓN
  // =========================================================

  if (!name) {
    redirect(
      "/panel/eventos/nuevo?error=Ingresa+el+nombre+del+evento"
    );
  }

  if (!startsAtRaw) {
    redirect(
      "/panel/eventos/nuevo?error=Ingresa+la+fecha+y+hora+del+evento"
    );
  }

  const startsAt =
    argentinaLocalToIso(startsAtRaw);

  if (!startsAt) {
    redirect(
      "/panel/eventos/nuevo?error=La+fecha+de+inicio+no+es+valida"
    );
  }

  const endsAt =
    endsAtRaw
      ? argentinaLocalToIso(endsAtRaw)
      : null;

  if (endsAtRaw && !endsAt) {
    redirect(
      "/panel/eventos/nuevo?error=La+fecha+de+finalizacion+no+es+valida"
    );
  }

  if (
    endsAt &&
    new Date(endsAt).getTime() <=
      new Date(startsAt).getTime()
  ) {
    redirect(
      "/panel/eventos/nuevo?error=La+fecha+de+finalizacion+debe+ser+posterior+al+inicio"
    );
  }

  // =========================================================
  // SLUG
  // =========================================================

  const slugBase =
    createSlug(name) || "evento";

  const slug =
    `${slugBase}-${crypto
      .randomUUID()
      .slice(0, 6)}`;

  // =========================================================
  // CREAR
  // =========================================================

  const admin =
    createAdminClient();

  const insertData: {
    organization_id: string;
    name: string;
    slug: string;
    starts_at: string;
    status: string;
    description?: string;
    city?: string;
    venue_name?: string;
    ends_at?: string;
  } = {
    organization_id:
      membership.organization_id,

    name,

    slug,

    starts_at:
      startsAt,

    status:
      "draft",
  };

  if (description) {
    insertData.description =
      description;
  }

  if (city) {
    insertData.city =
      city;
  }

  if (venueName) {
    insertData.venue_name =
      venueName;
  }

  if (endsAt) {
    insertData.ends_at =
      endsAt;
  }

  const {
    data: event,
    error,
  } = await admin
    .from("events")
    .insert(insertData)
    .select("id")
    .single();

  if (
    error ||
    !event
  ) {
    console.error(
      "ERROR CREANDO EVENTO:",
      error
    );

    const message =
      error?.message ||
      "No se pudo crear el evento";

    redirect(
      `/panel/eventos/nuevo?error=${encodeURIComponent(
        message
      )}`
    );
  }

  revalidatePath(
    "/panel/eventos"
  );

  redirect(
    `/panel/evento?eventId=${event.id}`
  );
}

// ============================================================
// PAGE
// ============================================================

export default async function NuevoEventoPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
  }>;
}) {
  const params =
    await searchParams;

  const errorMessage =
    params.error
      ? decodeURIComponent(
          params.error
        )
      : null;

  // "min" del datetime-local: evita el accidente comun de dejar un evento
  // con fecha de inicio en el pasado sin ningun aviso (no se bloquea del
  // lado del servidor a proposito, por si hace falta cargar un evento
  // viejo a mano).
  const minStartsAt =
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(new Date())
      .replace(" ", "T");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-[#f7f3ed]">

      {/* FONDO */}

      <div className="pointer-events-none fixed inset-0">

        <div className="absolute -left-[260px] -top-[260px] h-[650px] w-[650px] rounded-full bg-[#ff2a1a]/10 blur-[190px]" />

        <div className="absolute -right-[240px] top-[25%] h-[620px] w-[620px] rounded-full bg-[#ff5a2a]/[0.08] blur-[190px]" />

      </div>

      {/* HEADER */}

      <header className="relative z-10 border-b border-white/[0.07] bg-black/75 backdrop-blur-2xl">

        <div className="mx-auto flex min-h-[82px] max-w-[1200px] items-center gap-4 px-5 md:px-8">

          <Link
            href="/panel/eventos"
            className="flex h-11 w-11 items-center justify-center border border-white/[0.09] bg-white/[0.025] text-white/45 transition hover:border-[#ff5a2a]/40 hover:text-white"
          >
            ←
          </Link>

          <div>

            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff6848]">
              Capital Pass
            </p>

            <h1 className="mt-1 text-xl font-black uppercase tracking-[-0.03em]">
              Crear evento
            </h1>

          </div>

        </div>

      </header>

      {/* CONTENIDO */}

      <div className="relative z-10 mx-auto grid max-w-[1200px] gap-10 px-5 py-10 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-16">

        {/* INFO */}

        <section>

          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6040]">
            Nuevo evento
          </p>

          <h2 className="mt-4 text-5xl font-black uppercase leading-[0.86] tracking-[-0.065em] md:text-6xl">

            Creá.

            <span className="block bg-gradient-to-r from-[#fff5ef] via-[#ff9a7b] to-[#ff3b24] bg-clip-text text-transparent">
              Publicá.
            </span>

            Gestioná.

          </h2>

          <p className="mt-6 max-w-md text-sm leading-6 text-white/35">
            Creá el evento y después configurá tandas, RRPP, venta en puerta, identidad visual y entradas.
          </p>

          <div className="mt-10 border-l border-[#ff3b24]/35 pl-5">

            <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/65">
              Estado inicial
            </p>

            <p className="mt-2 text-sm text-white/30">
              El evento se crea como borrador.
            </p>

          </div>

        </section>

        {/* FORM */}

        <section className="border border-white/[0.09] bg-[#0a0908]">

          <div className="border-b border-white/[0.07] p-6 md:p-8">

            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#ff6040]">
              Información principal
            </p>

            <h3 className="mt-2 text-2xl font-black uppercase tracking-[-0.035em]">
              Datos del evento
            </h3>

          </div>

          <form
            action={createEvent}
            className="p-6 md:p-8"
          >

            {errorMessage && (

              <div className="mb-6 border border-red-400/25 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </div>

            )}

            <div className="grid gap-6">

              <Field
                label="Nombre del evento"
                required
              >
                <input
                  name="name"
                  required
                  maxLength={120}
                  placeholder="Ej: PRIMAVERA 2026"
                  className={inputClass}
                />
              </Field>

              <Field label="Descripción">
                <textarea
                  name="description"
                  rows={4}
                  maxLength={1000}
                  placeholder="Descripción breve del evento..."
                  className={`${inputClass} min-h-[110px] resize-none py-3`}
                />
              </Field>

              <div className="grid gap-5 md:grid-cols-2">

                <Field label="Ciudad">
                  <input
                    name="city"
                    maxLength={100}
                    placeholder="Ej: Rosario"
                    className={inputClass}
                  />
                </Field>

                <Field label="Lugar">
                  <input
                    name="venue_name"
                    maxLength={150}
                    placeholder="Ej: Club Prisma"
                    className={inputClass}
                  />
                </Field>

              </div>

              <div className="grid gap-5 md:grid-cols-2">

                <Field
                  label="Inicio"
                  required
                >
                  <input
                    name="starts_at"
                    type="datetime-local"
                    required
                    min={minStartsAt}
                    className={inputClass}
                  />
                </Field>

                <Field label="Finalización">
                  <input
                    name="ends_at"
                    type="datetime-local"
                    className={inputClass}
                  />
                </Field>

              </div>

            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-white/[0.07] pt-6 sm:flex-row sm:justify-end">

              <Link
                href="/panel/eventos"
                className="flex h-12 items-center justify-center border border-white/[0.09] px-6 text-[10px] font-black uppercase tracking-[0.14em] text-white/40 transition hover:bg-white/[0.04] hover:text-white"
              >
                Cancelar
              </Link>

              <SubmitButton />

            </div>

          </form>

        </section>

      </div>

    </main>
  );
}

// ============================================================
// UI
// ============================================================

const inputClass =
  "h-12 w-full border border-white/[0.09] bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-white/15 focus:border-[#ff5a2a]/55 focus:bg-black/50";

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">

      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.13em] text-white/40">

        {label}

        {required && (

          <span className="ml-1 text-[#ff6040]">
            *
          </span>

        )}

      </span>

      {children}

    </label>
  );
}

// ============================================================
// HELPERS
// ============================================================

function createSlug(
  value: string
) {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(
      0,
      70
    );
}

function argentinaLocalToIso(
  value: string
): string | null {
  const date = new Date(
    `${value}:00-03:00`
  );

  // Un POST directo al server action (sin pasar por el <input
  // type="datetime-local">, que normalmente evita esto) podia mandar un
  // valor con un formato inesperado -- new Date(...).toISOString() tira
  // un RangeError sin capturar, mostrando un 500 generico en vez del
  // mensaje de validacion normal.
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}