"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createClient } from "../../lib/supabase/client";

type EventData = {
  id: string;
  name: string;
  starts_at: string | null;
  venue_name: string | null;
  city: string | null;
  door_sales_enabled: boolean;
  door_sales_start_at: string | null;
  door_sales_end_at: string | null;
};

type TicketType = {
  id: string;
  name: string;
  price_minor: number;
  status: string;
  active: boolean;
};

type GeneratedEntry = {
  id: string;
  displayNumber: number;
  manualCode: string;
  status: string;
  ticketType: string;
  url: string;
};

type SaleResult = {
  sale: {
    id: string;
    total: number;
  };

  buyer: {
    firstName: string;
    lastName: string;
    dni: string | null;
    phone: string | null;
  };

  event: {
    id: string;
    name: string;
    startsAt: string | null;
    venueName: string | null;
    city: string | null;
  };

  entries: GeneratedEntry[];
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeWhatsApp(value: string) {
  let digits = value.replace(/\D/g, "");

  if (digits.startsWith("549")) {
    return digits;
  }

  if (digits.startsWith("54")) {
    const rest = digits.slice(2);

    if (rest.startsWith("9")) {
      return digits;
    }

    return `549${rest}`;
  }

  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    return `549${digits}`;
  }

  return digits;
}

export default function DoorSellerPage() {
  const supabase = useMemo(
    () => createClient(),
    []
  );

  const [loading, setLoading] =
    useState(true);

  const [selling, setSelling] =
    useState(false);

  const [event, setEvent] =
    useState<EventData | null>(null);

  const [ticketTypes, setTicketTypes] =
    useState<TicketType[]>([]);

  const [sellerName, setSellerName] =
    useState("Vendedor");

  const [error, setError] =
    useState("");

  const [firstName, setFirstName] =
    useState("");

  const [lastName, setLastName] =
    useState("");

  const [dni, setDni] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [ticketTypeId, setTicketTypeId] =
    useState("");

  const [quantity, setQuantity] =
    useState(1);

  const [saleResult, setSaleResult] =
    useState<SaleResult | null>(null);

  // =====================================================
  // CARGAR VENDEDOR + EVENTO
  // =====================================================

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.replace("/login");
          return;
        }

        // -------------------------------------------------
        // PERFIL
        // -------------------------------------------------

        const { data: profile } =
          await supabase
            .from("profiles")
            .select(`
              first_name,
              last_name
            `)
            .eq("id", user.id)
            .maybeSingle();

        if (profile) {
          setSellerName(
            `${profile.first_name} ${profile.last_name}`.trim()
          );
        }

        // -------------------------------------------------
        // MEMBERSHIP
        // -------------------------------------------------

        const {
          data: membership,
          error: membershipError,
        } = await supabase
          .from("organization_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "door_seller")
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (membershipError) {
          throw membershipError;
        }

        if (!membership) {
          setError(
            "Tu cuenta no tiene acceso activo a venta en puerta."
          );
          return;
        }

        // -------------------------------------------------
        // EVENT STAFF
        // -------------------------------------------------

        const {
          data: staff,
          error: staffError,
        } = await supabase
          .from("event_staff")
          .select("event_id")
          .eq(
            "organization_member_id",
            membership.id
          )
          .eq(
            "staff_role",
            "door_seller"
          )
          .eq("active", true)
          .limit(1)
          .maybeSingle();

        if (staffError) {
          throw staffError;
        }

        if (!staff) {
          setError(
            "No tenés ningún evento asignado para vender en puerta."
          );
          return;
        }

        // -------------------------------------------------
        // EVENTO
        // -------------------------------------------------

        const {
          data: eventData,
          error: eventError,
        } = await supabase
          .from("events")
          .select(`
            id,
            name,
            starts_at,
            venue_name,
            city,
            door_sales_enabled,
            door_sales_start_at,
            door_sales_end_at
          `)
          .eq("id", staff.event_id)
          .maybeSingle();

        if (eventError) {
          throw eventError;
        }

        if (!eventData) {
          setError(
            "No se pudo encontrar el evento."
          );
          return;
        }

        const currentEvent =
          eventData as EventData;

        setEvent(currentEvent);

        // -------------------------------------------------
        // TANDAS
        // -------------------------------------------------

        const {
          data: types,
          error: typesError,
        } = await supabase
          .from("ticket_types")
          .select(`
            id,
            name,
            price_minor,
            status,
            active
          `)
          .eq(
            "event_id",
            currentEvent.id
          )
          .eq("active", true)
          .eq("status", "available")
          .order("created_at", {
            ascending: true,
          });

        if (typesError) {
          throw typesError;
        }

        const availableTypes =
          (types ?? []) as TicketType[];

        setTicketTypes(availableTypes);

        if (availableTypes.length > 0) {
          setTicketTypeId(
            availableTypes[0].id
          );
        }
      } catch (err) {
        console.error(
          "ERROR PUERTA:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar la venta en puerta."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [supabase]);

  const selectedType =
    ticketTypes.find(
      (type) =>
        type.id === ticketTypeId
    ) ?? null;

  const unitPrice =
    selectedType
      ? Number(
          selectedType.price_minor
        )
      : 0;

  const total =
    unitPrice * quantity;

  // =====================================================
  // DISPONIBILIDAD DE PUERTA
  // =====================================================

  const doorAvailable =
    useMemo(() => {
      if (!event) {
        return false;
      }

      if (!event.door_sales_enabled) {
        return false;
      }

      const now = Date.now();

      if (
        event.door_sales_start_at &&
        now <
          new Date(
            event.door_sales_start_at
          ).getTime()
      ) {
        return false;
      }

      if (
        event.door_sales_end_at &&
        now >
          new Date(
            event.door_sales_end_at
          ).getTime()
      ) {
        return false;
      }

      return true;
    }, [event]);

  // =====================================================
  // CREAR VENTA
  // =====================================================

  async function createSale(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (
      !event ||
      !ticketTypeId
    ) {
      return;
    }

    if (!doorAvailable) {
      setError(
        "La venta en puerta no está habilitada en este momento."
      );
      return;
    }

    setSelling(true);
    setError("");

    try {
      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        "create_sale",
        {
          p_event_id: event.id,

          p_ticket_type_id:
            ticketTypeId,

          p_quantity:
            quantity,

          p_buyer_first_name:
            firstName.trim(),

          p_buyer_last_name:
            lastName.trim(),

          p_buyer_dni:
            dni.trim() || null,

          p_buyer_phone:
            phone.trim() || null,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      const result =
        data?.[0];

      if (!result?.sale_id) {
        throw new Error(
          "La venta no devolvió un identificador."
        );
      }

      // -------------------------------------------------
      // RECUPERAR ENTRADAS
      // -------------------------------------------------

      const response = await fetch(
        `/api/puerta/ventas/${result.sale_id}/entradas`
      );

      const ticketData =
        await response.json();

      if (!response.ok) {
        throw new Error(
          ticketData?.error ??
            "La venta fue creada, pero no pudimos cargar las entradas."
        );
      }

      setSaleResult(
        ticketData as SaleResult
      );
    } catch (err) {
      console.error(
        "ERROR CREANDO VENTA PUERTA:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo registrar la venta."
      );
    } finally {
      setSelling(false);
    }
  }

  // =====================================================
  // NUEVA VENTA
  // =====================================================

  function resetSale() {
    setSaleResult(null);

    setFirstName("");
    setLastName("");
    setDni("");
    setPhone("");
    setQuantity(1);
    setError("");

    if (ticketTypes.length > 0) {
      setTicketTypeId(
        ticketTypes[0].id
      );
    }
  }

  // =====================================================
  // WHATSAPP
  // =====================================================

  function sendWhatsApp(
    entry: GeneratedEntry
  ) {
    const number =
      normalizeWhatsApp(phone);

    if (!number) {
      setError(
        "Ingresá el WhatsApp del comprador para enviar la entrada."
      );
      return;
    }

    const absoluteUrl =
      `${window.location.origin}${entry.url}`;

    const message =
      encodeURIComponent(
        `🎟️ Tu entrada para ${event?.name ?? "el evento"}\n\n` +
          `Hola ${firstName} 👋\n` +
          `Entrada: ${entry.ticketType}\n` +
          `N.º: #${String(entry.displayNumber).padStart(7, "0")}\n` +
          `Código: ${entry.manualCode}\n\n` +
          `${absoluteUrl}\n\n` +
          `Presentá esta entrada al ingresar. Capital Pass`
      );

    window.open(
      `https://wa.me/${number}?text=${message}`,
      "_blank"
    );
  }

  // =====================================================
  // CERRAR SESIÓN
  // =====================================================

  async function logout() {
    await supabase.auth.signOut();

    window.location.replace(
      "/login"
    );
  }

  // =====================================================
  // CARGANDO
  // =====================================================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050308] text-white">
        <p className="text-sm text-white/35">
          Preparando boletería...
        </p>
      </main>
    );
  }

  // =====================================================
  // VENTA GENERADA
  // =====================================================

  if (saleResult) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#050308] px-5 py-8 text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[650px] w-[650px] -translate-x-1/2 rounded-full bg-emerald-600/15 blur-[170px]" />
        </div>

        <section className="relative z-10 mx-auto max-w-lg">
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-4xl text-emerald-300">
              ✓
            </div>

            <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
              Venta confirmada
            </p>

            <h1 className="mt-2 text-3xl font-black">
              Entradas generadas
            </h1>

            <p className="mt-2 text-sm text-white/35">
              {saleResult.event.name}
            </p>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs text-white/30">
                Entradas
              </p>

              <p className="mt-2 text-2xl font-bold">
                {
                  saleResult.entries
                    .length
                }
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs text-white/30">
                Total
              </p>

              <p className="mt-2 text-2xl font-bold">
                {formatMoney(
                  saleResult.sale
                    .total
                )}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {saleResult.entries.map(
              (entry, index) => (
                <div
                  key={entry.id}
                  className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5"
                >
                  <p className="text-xs uppercase tracking-[0.16em] text-[#ff9b82]">
                    Entrada{" "}
                    {index + 1}
                  </p>

                  <h2 className="mt-2 text-lg font-bold">
                    {
                      entry.ticketType
                    }
                  </h2>

                  <div className="mt-4 rounded-xl bg-black/25 p-4">
                    <p className="text-xs text-white/30">
                      N.º
                    </p>

                    <p className="mt-1 font-mono font-bold">
                      #
                      {String(
                        entry.displayNumber
                      ).padStart(
                        7,
                        "0"
                      )}
                    </p>

                    <p className="mt-4 text-xs text-white/30">
                      Código manual
                    </p>

                    <p className="mt-1 font-mono text-lg font-bold text-[#ffc4ad]">
                      {
                        entry.manualCode
                      }
                    </p>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <a
                      href={
                        entry.url
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm font-semibold"
                    >
                      Ver entrada
                    </a>

                    <button
                      type="button"
                      onClick={() =>
                        sendWhatsApp(
                          entry
                        )
                      }
                      className="h-12 rounded-xl bg-emerald-500 text-sm font-semibold text-black"
                    >
                      Enviar por WhatsApp
                    </button>
                  </div>
                </div>
              )
            )}
          </div>

          <button
            type="button"
            onClick={resetSale}
            className="mt-6 h-14 w-full rounded-2xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] font-bold"
          >
            Registrar otra venta
          </button>

          <button
            type="button"
            onClick={logout}
            className="mt-3 h-12 w-full text-sm text-white/35"
          >
            Cerrar sesión
          </button>
        </section>
      </main>
    );
  }

  // =====================================================
  // PANTALLA PRINCIPAL
  // =====================================================

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050308] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-48 -top-48 h-[600px] w-[600px] rounded-full bg-[#ff2a1a]/20 blur-[160px]" />

        <div className="absolute -right-48 bottom-[-200px] h-[600px] w-[600px] rounded-full bg-[#ff5a2a]/15 blur-[160px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-lg px-5 py-7">
        {/* HEADER */}

        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#ff5a2a]/30 bg-[#ff3b24]/15 font-black">
              CP
            </div>

            <div>
              <p className="font-semibold">
                Capital Pass
              </p>

              <p className="text-xs text-white/30">
                Venta en puerta
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-xs text-white/45"
          >
            Salir
          </button>
        </header>

        {/* VENDEDOR */}

        <section className="mt-9">
          <p className="text-xs uppercase tracking-[0.18em] text-[#ff9b82]">
            Boletería
          </p>

          <h1 className="mt-2 text-2xl font-bold">
            Hola, {sellerName} 👋
          </h1>
        </section>

        {/* EVENTO */}

        {event && (
          <section className="mt-5 rounded-[24px] border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.08] p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-[#ff9b82]">
              Evento asignado
            </p>

            <h2 className="mt-2 text-xl font-bold">
              {event.name}
            </h2>

            <p className="mt-2 text-xs text-white/35">
              {[
                event.venue_name,
                event.city,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            <div className="mt-4">
              <span
                className={`rounded-full px-3 py-1.5 text-xs ${
                  doorAvailable
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-red-500/10 text-red-300"
                }`}
              >
                {doorAvailable
                  ? "● Venta habilitada"
                  : "● Venta no disponible"}
              </span>
            </div>
          </section>
        )}

        {/* ERROR */}

        {error && (
          <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* SIN EVENTO */}

        {!event ? null : (
          <section className="mt-5 rounded-[26px] border border-white/10 bg-white/[0.04] p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-[#ff9b82]">
                Nueva venta
              </p>

              <h2 className="mt-2 text-xl font-bold">
                Datos del comprador
              </h2>
            </div>

            <form
              onSubmit={createSale}
              className="mt-6 space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Nombre"
                  value={firstName}
                  onChange={setFirstName}
                  required
                />

                <Field
                  label="Apellido"
                  value={lastName}
                  onChange={setLastName}
                  required
                />
              </div>

              <Field
                label="DNI"
                value={dni}
                onChange={setDni}
              />

              <Field
                label="WhatsApp"
                value={phone}
                onChange={setPhone}
                placeholder="Ej: 3462..."
              />

              <label className="block">
                <span className="text-xs text-white/35">
                  Tipo de entrada
                </span>

                <select
                  value={
                    ticketTypeId
                  }
                  required
                  onChange={(e) =>
                    setTicketTypeId(
                      e.target.value
                    )
                  }
                  className="mt-2 h-13 w-full rounded-xl border border-white/10 bg-[#100b15] px-4 text-sm outline-none"
                >
                  {ticketTypes.map(
                    (type) => (
                      <option
                        key={
                          type.id
                        }
                        value={
                          type.id
                        }
                      >
                        {
                          type.name
                        }{" "}
                        ·{" "}
                        {formatMoney(
                          Number(
                            type.price_minor
                          )
                        )}
                      </option>
                    )
                  )}
                </select>
              </label>

              {/* CANTIDAD */}

              <div>
                <p className="text-xs text-white/35">
                  Cantidad
                </p>

                <div className="mt-2 flex h-14 items-center rounded-xl border border-white/10 bg-black/20">
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity(
                        Math.max(
                          1,
                          quantity - 1
                        )
                      )
                    }
                    className="h-full w-16 text-xl"
                  >
                    −
                  </button>

                  <div className="flex-1 text-center text-xl font-bold">
                    {quantity}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setQuantity(
                        Math.min(
                          20,
                          quantity + 1
                        )
                      )
                    }
                    className="h-full w-16 text-xl"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* TOTAL */}

              <div className="rounded-2xl border border-[#ff5a2a]/15 bg-[#ff3b24]/[0.07] p-5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-white/35">
                      Precio unitario
                    </p>

                    <p className="mt-1 text-sm">
                      {formatMoney(
                        unitPrice
                      )}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-white/35">
                      Total
                    </p>

                    <p className="mt-1 text-2xl font-black">
                      {formatMoney(
                        total
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  selling ||
                  !doorAvailable ||
                  !firstName.trim() ||
                  !lastName.trim() ||
                  !ticketTypeId
                }
                className="h-16 w-full rounded-2xl bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] text-base font-black disabled:cursor-not-allowed disabled:opacity-35"
              >
                {selling
                  ? "Registrando..."
                  : "Confirmar venta"}
              </button>
            </form>
          </section>
        )}

        <p className="py-7 text-center text-[10px] uppercase tracking-[0.2em] text-white/15">
          Capital Pass · Door Sales
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-white/35">
        {label}
      </span>

      <input
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(
            e.target.value
          )
        }
        className="mt-2 h-13 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm outline-none focus:border-[#ff5a2a]/50"
      />
    </label>
  );
}