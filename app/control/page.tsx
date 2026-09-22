"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createClient } from "../../lib/supabase/client";

type Membership = {
  id: string;
};

type StaffAssignment = {
  event_id: string;
};

type EventRow = {
  id: string;
  name: string;
  starts_at: string | null;
  venue_name: string | null;
  city: string | null;
};

type ValidationResult = {
  result: string;
  ticket_id?: string | null;
  buyer_name?: string | null;
  buyer_dni?: string | null;
  ticket_type?: string | null;
  manual_code?: string | null;
  used_at?: string | null;
  message?: string | null;
};

function normalizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function formatDate(value: string | null) {
  if (!value) {
    return "Fecha a confirmar";
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ControlPage() {
  const supabase = useMemo(() => createClient(), []);

  const inputRef = useRef<HTMLInputElement>(null);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);

  const processingQRRef =
    useRef(false);

  const [loading, setLoading] =
    useState(true);

  const [validating, setValidating] =
    useState(false);

  const [scannerOpen, setScannerOpen] =
    useState(false);

  const [cameraLoading, setCameraLoading] =
    useState(false);

  const [imageLoading, setImageLoading] =
    useState(false);

  const [event, setEvent] =
    useState<EventRow | null>(null);

  const [code, setCode] =
    useState("");

  const [error, setError] =
    useState("");

  const [validation, setValidation] =
    useState<ValidationResult | null>(
      null
    );

  // =====================================================
  // CARGAR CONTROLADOR + EVENTO
  // =====================================================

  useEffect(() => {
    async function loadControl() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        if (!user) {
          window.location.replace(
            "/login"
          );

          return;
        }

        const {
          data: membershipData,
          error: membershipError,
        } = await supabase
          .from(
            "organization_members"
          )
          .select("id")
          .eq("user_id", user.id)
          .eq(
            "role",
            "controller"
          )
          .eq(
            "status",
            "active"
          )
          .limit(1)
          .maybeSingle();

        if (membershipError) {
          throw membershipError;
        }

        if (!membershipData) {
          window.location.replace(
            "/login"
          );

          return;
        }

        const membership =
          membershipData as Membership;

        const {
          data: staffData,
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
            "controller"
          )
          .eq("active", true)
          .limit(1)
          .maybeSingle();

        if (staffError) {
          throw staffError;
        }

        if (!staffData) {
          setError(
            "No tenés ningún evento asignado para controlar."
          );

          return;
        }

        const staff =
          staffData as StaffAssignment;

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
            city
          `)
          .eq(
            "id",
            staff.event_id
          )
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

        setEvent(
          eventData as EventRow
        );

        setTimeout(() => {
          inputRef.current?.focus();
        }, 150);
      } catch (err) {
        console.error(
          "ERROR CONTROL:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar el control de ingreso."
        );
      } finally {
        setLoading(false);
      }
    }

    loadControl();
  }, [supabase]);

  // =====================================================
  // DETENER CÁMARA
  // =====================================================

  async function stopScanner() {
    const scanner =
      scannerRef.current;

    if (!scanner) {
      return;
    }

    try {
      const state =
        scanner.getState?.();

      if (
        state === 2 ||
        state === 3
      ) {
        await scanner.stop();
      }
    } catch (err) {
      console.warn(
        "No se pudo detener la cámara:",
        err
      );
    }

    try {
      scanner.clear?.();
    } catch {
      // nada
    }

    scannerRef.current = null;
  }

  // =====================================================
  // ENVIAR QR A LA API
  // =====================================================

  async function validateQR(
    qrPayload: string
  ) {
    if (
      !event ||
      processingQRRef.current
    ) {
      return;
    }

    processingQRRef.current = true;

    setValidating(true);
    setError("");

    try {
      await stopScanner();

      setScannerOpen(false);

      const response = await fetch(
        "/api/control/validar-qr",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            eventId: event.id,
            qrPayload,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo validar el QR."
        );
      }

      setValidation(
        data as ValidationResult
      );
    } catch (err) {
      console.error(
        "ERROR VALIDANDO QR:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo validar el QR."
      );
    } finally {
      setValidating(false);

      processingQRRef.current =
        false;
    }
  }

  // =====================================================
  // ABRIR CÁMARA
  // =====================================================

  async function openScanner() {
    if (!event) {
      return;
    }

    setError("");
    setValidation(null);
    setScannerOpen(true);
    setCameraLoading(true);

    await new Promise(
      (resolve) =>
        setTimeout(resolve, 150)
    );

    try {
      const {
        Html5Qrcode,
      } = await import(
        "html5-qrcode"
      );

      await stopScanner();

      const scanner =
        new Html5Qrcode(
          "capital-pass-qr-reader"
        );

      scannerRef.current =
        scanner;

      await scanner.start(
        {
          facingMode: "environment",
        },

        {
          fps: 10,

          qrbox: {
            width: 250,
            height: 250,
          },

          aspectRatio: 1,
        },

        async (
          decodedText: string
        ) => {
          if (
            processingQRRef.current
          ) {
            return;
          }

          await validateQR(
            decodedText
          );
        },

        () => {
          // Los errores mientras busca
          // un QR son normales.
        }
      );
    } catch (err) {
      console.error(
        "ERROR CÁMARA:",
        err
      );

      await stopScanner();

      setScannerOpen(false);

      setError(
        "No pudimos abrir la cámara. Revisá que Capital Pass tenga permiso para usarla."
      );
    } finally {
      setCameraLoading(false);
    }
  }

  // =====================================================
  // CERRAR CÁMARA
  // =====================================================

  async function closeScanner() {
    await stopScanner();

    setScannerOpen(false);
    setCameraLoading(false);
  }

  // =====================================================
  // CARGAR IMAGEN CON QR
  // =====================================================

  async function handleQRImage(
    e: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      e.target.files?.[0];

    if (!file || !event) {
      return;
    }

    setError("");
    setValidation(null);
    setImageLoading(true);

    try {
      await stopScanner();

      const {
        Html5Qrcode,
      } = await import(
        "html5-qrcode"
      );

      const fileReader =
        new Html5Qrcode(
          "capital-pass-file-reader"
        );

      const decodedText =
        await fileReader.scanFile(
          file,
          false
        );

      try {
        fileReader.clear();
      } catch {
        // nada
      }

      await validateQR(
        decodedText
      );
    } catch (err) {
      console.error(
        "ERROR LEYENDO IMAGEN QR:",
        err
      );

      setError(
        "No pudimos encontrar un QR válido en esa imagen. Probá con una captura donde el código se vea completo y nítido."
      );
    } finally {
      setImageLoading(false);

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";
      }
    }
  }

  // =====================================================
  // VALIDAR CÓDIGO MANUAL
  // =====================================================

  async function validateCode(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (!event) {
      return;
    }

    const normalized =
      normalizeCode(code);

    if (!normalized) {
      setError(
        "Ingresá el código de la entrada."
      );

      return;
    }

    setValidating(true);
    setError("");
    setValidation(null);

    try {
      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        "validate_ticket_manual",
        {
          p_event_id:
            event.id,

          p_manual_code:
            normalized,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      const rows =
        (data ??
          []) as ValidationResult[];

      const result =
        rows[0];

      if (!result) {
        throw new Error(
          "La validación no devolvió un resultado."
        );
      }

      setValidation(result);
    } catch (err) {
      console.error(
        "ERROR VALIDANDO ENTRADA:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo validar la entrada."
      );
    } finally {
      setValidating(false);
    }
  }

  // =====================================================
  // SIGUIENTE ENTRADA
  // =====================================================

  async function nextTicket() {
    await stopScanner();

    setCode("");
    setValidation(null);
    setError("");
    setScannerOpen(false);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }

  // =====================================================
  // SALIR
  // =====================================================

  async function logout() {
    await stopScanner();

    await supabase.auth.signOut();

    window.location.replace(
      "/login"
    );
  }

  // =====================================================
  // LIMPIEZA
  // =====================================================

  useEffect(() => {
    return () => {
      const scanner =
        scannerRef.current;

      if (scanner) {
        try {
          scanner.stop?.();
          scanner.clear?.();
        } catch {
          // nada
        }
      }
    };
  }, []);

  // =====================================================
  // CARGANDO
  // =====================================================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050308] text-white">
        <p className="text-sm text-white/40">
          Preparando control de
          ingreso...
        </p>
      </main>
    );
  }

  // =====================================================
  // RESULTADO
  // =====================================================

  if (validation) {
    const result =
      validation.result?.toLowerCase();

    const isValid =
      result === "valid";

    const isAlreadyUsed =
      result ===
      "already_used";

    // Una entrada anulada/devuelta sigue existiendo en la
    // base de datos, por eso la validación puede devolver
    // sus datos aunque ya no permita el ingreso.
    //
    // Soportamos tanto un resultado explícito "cancelled"
    // como el comportamiento actual del RPC, que puede
    // devolver un resultado no válido junto con ticket_id.
    const isCancelled =
      result === "cancelled" ||
      result === "canceled" ||
      result === "returned" ||
      result === "void" ||
      (!isValid &&
        !isAlreadyUsed &&
        Boolean(validation.ticket_id));

    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050308] px-5 py-8 text-white">
        <div className="pointer-events-none absolute inset-0">
          <div
            className={`absolute left-1/2 top-1/2 h-[650px] w-[650px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[170px] ${
              isValid
                ? "bg-emerald-600/20"
                : isAlreadyUsed
                  ? "bg-orange-600/20"
                  : isCancelled
                    ? "bg-rose-700/20"
                    : "bg-red-600/20"
            }`}
          />
        </div>

        <section className="relative z-10 w-full max-w-[480px] text-center">
          <div
            className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full border text-5xl ${
              isValid
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                : isAlreadyUsed
                  ? "border-orange-400/40 bg-orange-500/15 text-orange-300"
                  : isCancelled
                    ? "border-rose-400/40 bg-rose-500/15 text-rose-300"
                    : "border-red-400/40 bg-red-500/15 text-red-300"
            }`}
          >
            {isValid
              ? "✓"
              : isAlreadyUsed
                ? "!"
                : isCancelled
                  ? "⊘"
                  : "×"}
          </div>

          <p
            className={`mt-7 text-xs font-bold uppercase tracking-[0.22em] ${
              isValid
                ? "text-emerald-300"
                : isAlreadyUsed
                  ? "text-orange-300"
                  : isCancelled
                    ? "text-rose-300"
                    : "text-red-300"
            }`}
          >
            {isValid
              ? "Acceso autorizado"
              : isAlreadyUsed
                ? "Atención"
                : "Acceso rechazado"}
          </p>

          <h1 className="mt-3 text-4xl font-black uppercase tracking-tight">
            {isValid
              ? "Entrada válida"
              : isAlreadyUsed
                ? "Entrada ya utilizada"
                : isCancelled
                  ? "Entrada anulada"
                  : "Entrada no válida"}
          </h1>

          {(validation.buyer_name ||
            validation.buyer_dni ||
            validation.ticket_type ||
            validation.manual_code) && (
            <div className="mt-7 rounded-[26px] border border-white/10 bg-white/[0.04] p-6 text-left backdrop-blur-xl">
              {validation.buyer_name && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">
                    Comprador
                  </p>

                  <p className="mt-2 text-xl font-bold">
                    {
                      validation.buyer_name
                    }
                  </p>
                </div>
              )}

              {validation.buyer_dni && (
                <div className="mt-5 border-t border-white/10 pt-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">
                    DNI
                  </p>

                  <p className="mt-2 font-semibold">
                    {
                      validation.buyer_dni
                    }
                  </p>
                </div>
              )}

              {validation.ticket_type && (
                <div className="mt-5 border-t border-white/10 pt-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">
                    Entrada
                  </p>

                  <p className="mt-2 font-semibold">
                    {
                      validation.ticket_type
                    }
                  </p>
                </div>
              )}

              {validation.manual_code && (
                <div className="mt-5 border-t border-white/10 pt-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">
                    Código
                  </p>

                  <p className="mt-2 font-mono font-semibold tracking-[0.08em]">
                    {
                      validation.manual_code
                    }
                  </p>
                </div>
              )}
            </div>
          )}

          {isValid && (
            <p className="mt-6 text-sm text-white/40">
              El ingreso quedó
              registrado correctamente.
            </p>
          )}

          {isAlreadyUsed && (
            <p className="mt-6 text-sm leading-6 text-orange-200/65">
              Esta entrada ya había sido
              utilizada anteriormente. No
              permitas un nuevo ingreso
              con el mismo ticket.
            </p>
          )}

          {isCancelled && (
            <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-500/[0.07] px-5 py-4">
              <p className="text-sm font-semibold text-rose-200">
                Esta entrada fue devuelta y ya no es válida para ingresar.
              </p>

              <p className="mt-2 text-xs leading-5 text-white/40">
                No permitas el acceso con este ticket.
              </p>
            </div>
          )}

          {!isValid &&
            !isAlreadyUsed &&
            !isCancelled && (
              <p className="mt-6 text-sm leading-6 text-red-200/65">
                {validation.message ??
                  "La entrada no pudo ser validada."}
              </p>
            )}

          <button
            type="button"
            onClick={nextTicket}
            className={`mt-8 h-16 w-full rounded-2xl text-base font-bold transition hover:scale-[1.01] active:scale-[0.99] ${
              isValid
                ? "bg-emerald-500 text-black"
                : isAlreadyUsed
                  ? "bg-orange-500 text-black"
                  : isCancelled
                    ? "bg-rose-500 text-white"
                    : "bg-red-500 text-white"
            }`}
          >
            Validar siguiente entrada
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
        <div className="absolute -left-52 -top-44 h-[600px] w-[600px] rounded-full bg-[#ff2a1a]/25 blur-[160px]" />

        <div className="absolute -right-48 bottom-[-180px] h-[600px] w-[600px] rounded-full bg-[#ff5a2a]/20 blur-[160px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-xl flex-col px-5 py-7">
        {/* HEADER */}

        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#ff9b82]/25 bg-gradient-to-br from-[#ff2a1a]/40 to-[#ff5a2a]/20 font-black">
              CP
            </div>

            <div>
              <p className="font-semibold">
                Capital Pass
              </p>

              <p className="text-xs text-white/30">
                Control de ingreso
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-xs text-white/45 transition hover:text-white"
          >
            Salir
          </button>
        </header>

        {/* EVENTO */}

        {event && (
          <section className="mt-10 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff9b82]">
              Evento
            </p>

            <h1 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-4xl">
              {event.name}
            </h1>

            <p className="mt-2 text-sm text-white/35">
              {formatDate(
                event.starts_at
              )}
            </p>

            {(event.city ||
              event.venue_name) && (
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/25">
                {[
                  event.venue_name,
                  event.city,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </section>
        )}

        {/* CÁMARA CERRADA */}

        {!scannerOpen && (
          <section className="mt-10 space-y-3">
            {/* ESCANEAR */}

            <button
              type="button"
              onClick={openScanner}
              disabled={
                validating ||
                imageLoading ||
                !event
              }
              className="flex h-20 w-full items-center justify-center gap-3 rounded-[24px] border border-[#ff5a2a]/30 bg-gradient-to-r from-[#ff2a1a]/45 to-[#ff5a2a]/35 text-lg font-black shadow-[0_18px_55px_rgba(255,42,26,0.20)] transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
            >
              <span className="text-2xl">
                📷
              </span>

              Escanear QR
            </button>

            {/* CARGAR IMAGEN */}

            <button
              type="button"
              onClick={() =>
                fileInputRef.current?.click()
              }
              disabled={
                validating ||
                imageLoading ||
                !event
              }
              className="flex h-16 w-full items-center justify-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.045] text-sm font-bold text-white/75 transition hover:border-[#ff5a2a]/40 hover:bg-[#ff3b24]/10 hover:text-white disabled:opacity-40"
            >
              <span className="text-xl">
                🖼️
              </span>

              {imageLoading
                ? "Leyendo QR..."
                : "Cargar imagen del QR"}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleQRImage}
              className="hidden"
            />

            <p className="pt-1 text-center text-[10px] uppercase tracking-[0.18em] text-white/25">
              Cámara o captura de pantalla
            </p>
          </section>
        )}

        {/* CÁMARA */}

        {scannerOpen && (
          <section className="mt-8 rounded-[30px] border border-[#ff5a2a]/25 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between px-2 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff9b82]">
                  Escáner QR
                </p>

                <p className="mt-1 text-sm text-white/40">
                  Apuntá al código de la
                  entrada
                </p>
              </div>

              <button
                type="button"
                onClick={closeScanner}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-white/60"
              >
                ×
              </button>
            </div>

            <div className="overflow-hidden rounded-[24px] bg-black">
              <div
                id="capital-pass-qr-reader"
                className="min-h-[320px] w-full"
              />
            </div>

            {cameraLoading && (
              <p className="py-4 text-center text-sm text-white/35">
                Abriendo cámara...
              </p>
            )}

            <p className="px-4 pb-2 pt-4 text-center text-xs leading-5 text-white/30">
              Mantené el QR dentro del
              cuadro. La entrada se valida
              automáticamente.
            </p>
          </section>
        )}

        {/* LECTOR OCULTO PARA ARCHIVOS */}

        <div
          id="capital-pass-file-reader"
          className="hidden"
        />

        {/* ERROR */}

        {error && (
          <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* CÓDIGO MANUAL */}

        {!scannerOpen && (
          <>
            <div className="my-8 flex items-center gap-4">
              <div className="h-px flex-1 bg-white/10" />

              <span className="text-xs font-bold uppercase tracking-[0.25em] text-white/25">
                o
              </span>

              <div className="h-px flex-1 bg-white/10" />
            </div>

            <section className="rounded-[30px] border border-[#ff5a2a]/20 bg-white/[0.04] p-6 shadow-[0_0_60px_rgba(255,42,26,0.12)] backdrop-blur-xl">
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff9b82]">
                  Validación manual
                </p>

                <h2 className="mt-2 text-xl font-bold">
                  Ingresá el código
                </h2>

                <p className="mt-2 text-sm text-white/35">
                  Usalo cuando no puedas
                  escanear el QR.
                </p>
              </div>

              <form
                onSubmit={validateCode}
                className="mt-6"
              >
                <input
                  ref={inputRef}
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value.toUpperCase()
                    )
                  }
                  placeholder="0000019-28D5"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-16 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-center font-mono text-xl font-bold uppercase tracking-[0.10em] text-white outline-none transition placeholder:text-white/15 focus:border-[#ff5a2a]/60 focus:ring-4 focus:ring-[#ff3b24]/10"
                />

                <button
                  type="submit"
                  disabled={
                    validating ||
                    imageLoading ||
                    !code.trim() ||
                    !event
                  }
                  className="mt-5 h-16 w-full rounded-2xl bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] text-base font-black uppercase tracking-wide text-white shadow-[0_15px_45px_rgba(255,42,26,0.25)] transition hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {validating
                    ? "Validando..."
                    : "Validar entrada"}
                </button>
              </form>
            </section>
          </>
        )}

        <p className="mt-auto pt-8 text-center text-[10px] uppercase tracking-[0.22em] text-white/15">
          Capital Pass · Access Control
        </p>
      </div>
    </main>
  );
}