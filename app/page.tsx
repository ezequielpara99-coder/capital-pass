"use client";

import {
  CSSProperties,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Link from "next/link";
import { createClient } from "../lib/supabase/client";
import InstallAppButton from "./install-app-button";

/* =========================================================
   CONFIG
========================================================= */

// Lee el número real desde NEXT_PUBLIC_SUPPORT_WHATSAPP.
// Si viene sin el prefijo de país (Argentina: 549), se lo agrega.
function normalizeWhatsApp(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("54")) return digits;
  return `549${digits.replace(/^0+/, "")}`;
}

const SUPPORT_WHATSAPP = normalizeWhatsApp(
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "549XXXXXXXXXX"
);

type Theme = "dark" | "light";

type SubscriptionPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  billing_interval: string;
  active: boolean;
};

/* =========================================================
   HELPERS
========================================================= */

function formatPrice(
  amountMinor: number,
  currency = "ARS"
) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor);
}

function billingLabel(interval: string) {
  const value = interval?.toLowerCase();

  if (
    value === "month" ||
    value === "monthly" ||
    value === "mensual"
  ) {
    return "/ mes";
  }

  if (
    value === "year" ||
    value === "yearly" ||
    value === "annual"
  ) {
    return "/ año";
  }

  return interval ? `/ ${interval}` : "";
}

/* =========================================================
   REVEAL
========================================================= */

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(
    null
  );

  const [visible, setVisible] =
    useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const observer =
      new IntersectionObserver(
        ([entry]) => {
          if (
            entry.isIntersecting
          ) {
            setVisible(true);
            observer.disconnect();
          }
        },
        {
          threshold: 0.12,
        }
      );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        transitionDelay: `${delay}ms`,
      }}
      className={[
        className,
        "transition-all duration-[900ms] ease-out",
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-10 opacity-0",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/* =========================================================
   QR ILUSTRATIVO
========================================================= */

function GenericQr() {
  const rows = [
    "1111101011111",
    "1000101110001",
    "1010110110101",
    "1000101010001",
    "1111101011111",
    "0000001100000",
    "1011110110101",
    "0110011011010",
    "1101100101101",
    "0101011010010",
    "1111101101101",
    "1000110110110",
    "1010101011001",
  ];

  return (
    <div className="grid aspect-square w-full grid-cols-[repeat(13,1fr)] gap-[2px] bg-white p-3">
      {rows
        .join("")
        .split("")
        .map(
          (
            value,
            index
          ) => (
            <span
              key={index}
              className={
                value === "1"
                  ? "bg-black"
                  : "bg-white"
              }
            />
          )
        )}
    </div>
  );
}

/* =========================================================
   CELULAR
========================================================= */

function FloatingPhone() {
  return (
    <div className="relative mx-auto w-[280px] sm:w-[310px] md:w-[340px]">
      {/* GLOW */}

      <div className="absolute -inset-16 rounded-full bg-[#ff3b24]/20 blur-[110px]" />

      {/* TELÉFONO */}

      <div className="phone-float relative rounded-[55px] border border-white/20 bg-[#050505] p-[9px] shadow-[0_40px_110px_rgba(0,0,0,.55),0_0_90px_rgba(255,59,36,.16)]">
        <div className="relative min-h-[610px] overflow-hidden rounded-[46px] bg-[#0b0908]">
          {/* NOTCH */}

          <div className="absolute left-1/2 top-2 z-30 h-7 w-[96px] -translate-x-1/2 rounded-full bg-black" />

          {/* FALLBACK */}

          <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_0%,rgba(255,90,42,.30),transparent_34%),linear-gradient(180deg,#1b100c,#080706)] px-5 pb-6 pt-14">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black tracking-[0.08em] text-white">
                CAPITAL
                <span className="text-[#ff442b]">
                  PASS
                </span>
              </p>

              <span className="h-2 w-2 rounded-full bg-[#ff3b24] shadow-[0_0_14px_#ff3b24]" />
            </div>

            <p className="mt-10 text-[8px] uppercase tracking-[0.2em] text-white/35">
              Digital ticket
            </p>

            <h3 className="mt-3 text-3xl font-black uppercase leading-[0.88] tracking-[-0.05em] text-white">
              SUMMER

              <span className="block text-[#ff5537]">
                SESSION
              </span>
            </h3>

            <div className="mt-7 border-y border-white/10 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[7px] uppercase tracking-[0.16em] text-white/30">
                    Fecha
                  </p>

                  <p className="mt-1 text-xs font-semibold text-white">
                    20 SEP 2026
                  </p>
                </div>

                <div>
                  <p className="text-[7px] uppercase tracking-[0.16em] text-white/30">
                    Acceso
                  </p>

                  <p className="mt-1 text-xs font-semibold text-[#ff7956]">
                    VIP
                  </p>
                </div>
              </div>
            </div>

            <div className="mx-auto mt-8 w-[165px] overflow-hidden rounded-2xl">
              <GenericQr />
            </div>

            <p className="mt-4 text-center text-[8px] uppercase tracking-[0.18em] text-white/28">
              Presentá este QR en el ingreso
            </p>

            <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-4">
              <div>
                <p className="text-[7px] uppercase tracking-[0.15em] text-white/30">
                  Ticket
                </p>

                <p className="mt-1 text-[10px] font-bold text-white">
                  CP-200926
                </p>
              </div>

              <span className="border border-[#ff5537]/30 bg-[#ff5537]/10 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-[#ff8969]">
                Valid
              </span>
            </div>
          </div>

          {/* IMAGEN PERSONALIZADA OPCIONAL */}

          <img
            src="/capital-pass-ticket-phone.png"
            alt="Entrada digital Capital Pass"
            className="absolute inset-0 z-20 h-full w-full object-cover"
            onError={(
              event
            ) => {
              event.currentTarget.style.display =
                "none";
            }}
          />
        </div>
      </div>

      {/* LABEL */}

      <div className="absolute -left-20 top-[30%] hidden border border-white/10 bg-black/70 px-4 py-3 shadow-xl backdrop-blur-xl md:block">
        <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-[#ff7956]">
          QR READY
        </p>
      </div>

      <div className="absolute -right-24 bottom-[22%] hidden border border-white/10 bg-black/70 px-4 py-3 shadow-xl backdrop-blur-xl md:block">
        <p className="text-[7px] uppercase tracking-[0.18em] text-white/40">
          Access status
        </p>

        <p className="mt-1 text-xs font-black text-[#ff7956]">
          VALIDATED
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   HOME
========================================================= */

export default function Home() {
  const supabase =
    useMemo(
      () =>
        createClient(),
      []
    );

  const [
    theme,
    setTheme,
  ] =
    useState<Theme>(
      "dark"
    );

  const [
    plans,
    setPlans,
  ] =
    useState<
      SubscriptionPlan[]
    >([]);

  const [
    plansLoading,
    setPlansLoading,
  ] =
    useState(true);

  /* =======================================================
     THEME
  ======================================================= */

  useEffect(() => {
    const saved =
      localStorage.getItem(
        "capital-pass-theme"
      );

    if (
      saved === "dark" ||
      saved === "light"
    ) {
      setTheme(saved);
    }
  }, []);

  function toggleTheme() {
    const next =
      theme === "dark"
        ? "light"
        : "dark";

    setTheme(next);

    localStorage.setItem(
      "capital-pass-theme",
      next
    );
  }

  /* =======================================================
     PLANS
  ======================================================= */

  useEffect(() => {
    async function loadPlans() {
      setPlansLoading(
        true
      );

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "subscription_plans"
          )
          .select(`
            id,
            code,
            name,
            description,
            price_minor,
            currency,
            billing_interval,
            active
          `)
          .eq(
            "active",
            true
          )
          .order(
            "price_minor",
            {
              ascending:
                true,
            }
          );

      if (error) {
        console.error(
          "ERROR PLANS:",
          error
        );

        setPlans([]);

        setPlansLoading(
          false
        );

        return;
      }

      setPlans(
        (data ??
          []) as SubscriptionPlan[]
      );

      setPlansLoading(
        false
      );
    }

    loadPlans();
  }, [supabase]);

  /* =======================================================
     COLORS
  ======================================================= */

  const dark =
    theme === "dark";

  const themeVars =
    (
      dark
        ? {
            "--cp-bg":
              "#050505",

            "--cp-panel":
              "#0c0b0a",

            "--cp-soft":
              "rgba(255,255,255,.035)",

            "--cp-text":
              "#f7f3ed",

            "--cp-muted":
              "rgba(255,255,255,.38)",

            "--cp-border":
              "rgba(255,255,255,.085)",
          }
        : {
            "--cp-bg":
              "#f3ede4",

            "--cp-panel":
              "#fffaf3",

            "--cp-soft":
              "rgba(55,24,14,.04)",

            "--cp-text":
              "#1a0d08",

            "--cp-muted":
              "rgba(35,18,12,.48)",

            "--cp-border":
              "rgba(45,20,12,.11)",
          }
    ) as CSSProperties;

  /* =======================================================
     WHATSAPP
  ======================================================= */

  const whatsappUrl =
    `https://wa.me/${SUPPORT_WHATSAPP}` +
    `?text=${encodeURIComponent(
      "Hola Capital Pass, necesito ayuda con la plataforma."
    )}`;

  const commonFeatures = [
    "Gestión de eventos",
    "Tandas de entradas",
    "Entradas digitales con QR",
    "RRPP y comisiones",
    "Control de accesos",
    "Venta en puerta",
    "Informes y métricas",
    "Control de stock y barras",
    "Gestión de bartenders y mesas",
    "Análisis de precios y ganancia",
  ];

  return (
    <main
      style={themeVars}
      className="min-h-screen overflow-hidden bg-[var(--cp-bg)] text-[var(--cp-text)] transition-colors duration-500"
    >
      {/* =====================================================
          GLOBAL CSS
      ===================================================== */}

      <style jsx global>{`
        html {
          scroll-behavior: smooth;
        }

        body {
          margin: 0;
        }

        @keyframes phoneFloat {
          0% {
            transform:
              translateY(0px)
              rotate(5deg);
          }

          50% {
            transform:
              translateY(-18px)
              rotate(3.5deg);
          }

          100% {
            transform:
              translateY(0px)
              rotate(5deg);
          }
        }

        .phone-float {
          animation:
            phoneFloat
            5s
            ease-in-out
            infinite;
        }
      `}</style>

      {/* =====================================================
          AMBIENT
      ===================================================== */}

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-[250px] -top-[250px] h-[600px] w-[600px] rounded-full bg-[#ff2a1a]/10 blur-[160px]" />

        <div className="absolute -right-[250px] top-[30%] h-[650px] w-[650px] rounded-full bg-[#ff5a2a]/[0.08] blur-[170px]" />
      </div>

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="relative z-50 border-b border-[var(--cp-border)] bg-[var(--cp-bg)]/85 backdrop-blur-2xl">
        <div className="mx-auto flex h-[80px] max-w-[1560px] items-center justify-between px-5 md:px-8 xl:px-10">
          {/* BRAND */}

          <Link
            href="/"
            className="flex items-center gap-3"
          >
            <div className="relative h-10 w-10 overflow-hidden">
              <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_24px_rgba(255,59,36,.25)]" />

              <div className="absolute inset-[7px] rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.6),transparent_35%)]" />
            </div>

            <div>
              <p className="text-[12px] font-black tracking-[0.1em]">
                CAPITAL
                <span className="text-[#ff3b24]">
                  PASS
                </span>
              </p>

              <p className="mt-0.5 text-[8px] uppercase tracking-[0.22em] text-[var(--cp-muted)]">
                Event Operating System
              </p>
            </div>
          </Link>

          {/* NAV */}

          <nav className="hidden items-center gap-8 lg:flex">
            <a
              href="#platform"
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--cp-muted)] transition hover:text-[var(--cp-text)]"
            >
              Plataforma
            </a>

            <a
              href="#tickets"
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--cp-muted)] transition hover:text-[var(--cp-text)]"
            >
              Tickets
            </a>

            <a
              href="#pricing"
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--cp-muted)] transition hover:text-[var(--cp-text)]"
            >
              Suscripción
            </a>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--cp-muted)] transition hover:text-[#ff6343]"
            >
              Soporte
            </a>
          </nav>

          {/* ACTIONS */}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={
                toggleTheme
              }
              className="hidden h-10 border border-[var(--cp-border)] px-4 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--cp-muted)] transition hover:text-[var(--cp-text)] sm:block"
            >
              {dark
                ? "Light"
                : "Dark"}
            </button>

            <Link
              href="/login"
              className="hidden h-10 items-center border border-[var(--cp-border)] px-5 text-[9px] font-bold uppercase tracking-[0.16em] sm:flex"
            >
              Ingresar
            </Link>

            <Link
              href="/suscribirse"
              className="flex h-10 items-center bg-[#ff2a1a] px-5 text-[9px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d]"
            >
              Empezar
            </Link>
          </div>
        </div>
      </header>

      {/* =====================================================
          HERO
      ===================================================== */}

      <section className="relative z-10 flex h-[100svh] min-h-[600px] max-h-[1040px] flex-col overflow-hidden border-b border-[var(--cp-border)] sm:min-h-[680px]">
        {/* LIGHTS */}

        <div className="pointer-events-none absolute inset-0">
          <div className="cp-breathe absolute left-1/2 top-[48%] h-[700px] w-[1100px] rounded-[50%] bg-[#ff2a1a]/[0.22] blur-[160px]" />

          <div className="absolute left-1/2 top-[38%] h-[360px] w-[560px] -translate-x-1/2 rounded-[50%] bg-[#ff5a2a]/[0.2] blur-[110px]" />

          <div className="absolute left-[12%] top-[15%] h-[420px] w-[420px] rounded-full bg-[#ff5a2a]/[0.13] blur-[140px]" />

          <div className="absolute right-[6%] top-[22%] h-[420px] w-[420px] rounded-full bg-[#ff2a1a]/[0.14] blur-[150px]" />
        </div>

        {/* CONTENT — todo el bloque entra en la primera pantalla (pc/tablet/mobile) */}

        <div className="relative z-10 mx-auto flex w-full max-w-[1560px] flex-1 flex-col items-center justify-center gap-4 px-5 text-center sm:gap-5 md:gap-6 md:px-8 xl:px-10">
          {/* TITLE */}

          <Reveal
            delay={80}
          >
            <h1 className="relative max-w-[1100px] text-[clamp(40px,9.5vw,150px)] font-black uppercase leading-[0.82] tracking-[-0.06em] drop-shadow-[0_10px_80px_rgba(255,59,36,.55)] sm:leading-[0.80] sm:tracking-[-0.08em]">
              THE FUTURE

              <span className="block bg-gradient-to-r from-[#fff8f4] via-[#ffa876] to-[#ff2200] bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(255,90,42,.4)]">
                OF EVENTS.
              </span>
            </h1>
          </Reveal>

          {/* DESCRIPTION */}

          <Reveal
            delay={150}
          >
            <p className="max-w-[680px] text-xs leading-6 text-[var(--cp-muted)] sm:text-sm sm:leading-7 md:text-base">
              Ventas, entradas, RRPP,
              accesos y operación del
              evento conectados en una
              sola plataforma.
            </p>
          </Reveal>

          {/* CTAS */}

          <Reveal
            delay={210}
          >
            <div className="flex flex-row flex-wrap items-center justify-center gap-2 sm:gap-3">
              <Link
                href="/suscribirse"
                className="cp-shine-loop flex h-12 min-w-[160px] items-center justify-center rounded-full border-2 border-white/25 bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] px-5 text-[9px] font-black uppercase tracking-[0.15em] text-white shadow-[0_18px_55px_rgba(255,59,36,.55)] transition hover:scale-[1.06] hover:shadow-[0_24px_70px_rgba(255,59,36,.7)] sm:h-16 sm:min-w-[210px] sm:px-8 sm:text-[11px] sm:tracking-[0.17em]"
              >
                Empezar ahora
              </Link>

              <a
                href="#platform"
                className="cp-punch flex h-11 min-w-[150px] items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-5 text-[9px] font-bold uppercase tracking-[0.15em] backdrop-blur-xl transition hover:border-[#ff5a2a]/50 hover:bg-white/[0.07] sm:h-14 sm:min-w-[195px] sm:px-7 sm:text-[10px] sm:tracking-[0.17em]"
              >
                Ver plataforma
              </a>
            </div>
          </Reveal>

          {/* LOGO */}

          <Reveal
            delay={270}
            className="relative z-20"
          >
            <div className="relative mx-auto w-[105px] sm:w-[160px] md:w-[210px] lg:w-[250px]">
              <div className="cp-breathe-scale absolute inset-0 -z-10 scale-150 rounded-full bg-[#ff3b24]/40 blur-[50px]" />

              <img
                src="/capital-pass-logo.png"
                alt="Capital Pass"
                className="w-full object-contain drop-shadow-[0_25px_55px_rgba(255,45,20,.55)]"
                onError={(
                  event
                ) => {
                  event.currentTarget.style.display =
                    "none";
                }}
              />
            </div>
          </Reveal>
        </div>

        {/* GLOSSY HORIZON WITHOUT LINE */}

        <div className="pointer-events-none absolute bottom-[-235px] left-1/2 z-0 h-[340px] w-[150%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_top,#ffb08f_0%,#ff5534_12%,#e52312_25%,#3a0905_47%,#080504_65%)] shadow-[0_-50px_150px_rgba(255,59,36,.22)] sm:bottom-[-390px] sm:h-[620px]">
          <div className="absolute left-1/2 top-[-16px] h-[42px] w-[56%] -translate-x-1/2 rounded-[50%] bg-[#ffb998]/35 blur-[30px]" />
        </div>

        {/* GRAIN */}

        <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.045] mix-blend-screen">
          <div className="h-full w-full bg-[radial-gradient(circle,white_0.6px,transparent_0.8px)] bg-[size:5px_5px]" />
        </div>
      </section>

      {/* =====================================================
          PLATFORM INTRO
      ===================================================== */}

      <section
        id="platform"
        className="relative z-10 mx-auto max-w-[1560px] px-5 py-28 md:px-8 lg:py-36 xl:px-10"
      >
        <Reveal>
          <div className="grid gap-14 border-t border-[var(--cp-border)] pt-12 lg:grid-cols-[0.65fr_1.35fr]">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#ff6342]">
                One platform
              </p>
            </div>

            <div>
              <h2 className="max-w-[1000px] text-[clamp(48px,6.5vw,102px)] font-black uppercase leading-[0.82] tracking-[-0.07em]">
                TODO TU

                <span className="block">
                  EVENTO.
                </span>

                <span className="block text-[#ff3b24]">
                  CONECTADO.
                </span>
              </h2>

              <p className="mt-8 max-w-[680px] text-sm leading-7 text-[var(--cp-muted)] md:text-base">
                Desde la primera entrada
                vendida hasta el último
                ingreso de la noche.
                Capital Pass organiza toda
                la operación, incluyendo
                stock, barras y bartenders,
                desde un mismo lugar.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* =====================================================
          PHONE + QR
      ===================================================== */}

      <section
        id="tickets"
        className="relative z-10 overflow-hidden border-y border-[var(--cp-border)]"
      >
        <div className="pointer-events-none absolute left-[-200px] top-[10%] h-[500px] w-[500px] rounded-full bg-[#ff2a1a]/10 blur-[140px]" />

        <div className="mx-auto grid min-h-[800px] max-w-[1560px] items-center gap-20 px-5 py-28 md:px-8 lg:grid-cols-[0.9fr_1.1fr] xl:px-10">
          <Reveal>
            <FloatingPhone />
          </Reveal>

          <Reveal
            delay={120}
          >
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#ff6f4d]">
              Digital access / 01
            </p>

            <h2 className="mt-6 text-[clamp(52px,7vw,112px)] font-black uppercase leading-[0.81] tracking-[-0.075em]">
              YOUR

              <span className="block">
                TICKET.
              </span>

              <span className="block bg-gradient-to-r from-[#ff2a1a] via-[#ff5938] to-[#ffc4ad] bg-clip-text text-transparent">
                YOUR
              </span>

              <span className="block">
                ACCESS.
              </span>
            </h2>

            <div className="mt-10 max-w-[590px] border-l border-[#ff3b24] pl-6">
              <p className="text-sm leading-7 text-[var(--cp-muted)] md:text-base">
                Cada entrada incluye su
                identificación digital y
                llega directo al WhatsApp
                del comprador. El QR puede
                validarse desde el acceso y
                queda asociado al evento,
                comprador y tanda.
              </p>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-4 text-[9px] font-bold uppercase tracking-[0.17em] text-[var(--cp-muted)]">
              <span>
                QR Ticket
              </span>

              <span>
                Envío por WhatsApp
              </span>

              <span>
                Live validation
              </span>

              <span>
                Access control
              </span>

              <span>
                Digital entry
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* =====================================================
          FEATURES
      ===================================================== */}

      <section className="relative z-10 mx-auto max-w-[1560px] px-5 py-28 md:px-8 lg:py-36 xl:px-10">
        <Reveal>
          <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#ff6f4d]">
            System / 02
          </p>

          <h2 className="mt-5 text-5xl font-black uppercase tracking-[-0.06em] md:text-7xl">
            BUILT FOR

            <span className="block text-[#ff3b24]">
              EVENTS.
            </span>
          </h2>
        </Reveal>

        <div className="mt-16 border-t border-[var(--cp-border)]">
          {[
            [
              "01",
              "Ventas",
              "Seguimiento de ingresos, entradas y tandas.",
            ],

            [
              "02",
              "RRPP",
              "Organización de vendedores, ventas y comisiones.",
            ],

            [
              "03",
              "Entradas",
              "Tickets digitales individuales con QR.",
            ],

            [
              "04",
              "Accesos",
              "Validación y control de ingreso en tiempo real.",
            ],

            [
              "05",
              "Puerta",
              "Ventas presenciales integradas al mismo evento.",
            ],

            [
              "06",
              "Informes",
              "Datos históricos y métricas de rendimiento.",
            ],

            [
              "07",
              "Barras",
              "Stock de bebidas, barras, bartenders, mesas y análisis de precios.",
            ],
          ].map(
            (
              [
                number,
                title,
                description,
              ],
              index
            ) => (
              <Reveal
                key={
                  number
                }
                delay={
                  index *
                  40
                }
              >
                <div className="group grid gap-5 border-b border-[var(--cp-border)] py-7 transition md:grid-cols-[90px_0.65fr_1fr] md:items-center">
                  <p className="text-[9px] font-bold text-[#ff6f4d]">
                    {
                      number
                    }
                  </p>

                  <h3 className="text-2xl font-black uppercase tracking-[-0.035em] transition-transform duration-300 group-hover:translate-x-2 md:text-3xl">
                    {
                      title
                    }
                  </h3>

                  <p className="max-w-[620px] text-sm leading-6 text-[var(--cp-muted)]">
                    {
                      description
                    }
                  </p>
                </div>
              </Reveal>
            )
          )}
        </div>
      </section>

      {/* =====================================================
          INSTALL APP
      ===================================================== */}

      <section className="relative z-10 mx-auto max-w-[1560px] px-5 py-16 md:px-8 xl:px-10">
        <Reveal>
          <div className="flex flex-col items-center gap-5 rounded-3xl border border-[#ff5537]/20 bg-[#ff3b24]/[0.05] px-6 py-12 text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#ff7655]">Llevala en el bolsillo</p>
            <h2 className="max-w-[600px] text-3xl font-black uppercase leading-[0.95] tracking-[-0.04em] md:text-5xl">
              Capital Pass, instalada en tu celular.
            </h2>
            <p className="max-w-[520px] text-sm leading-6 text-[var(--cp-muted)] md:text-base">
              Organizadores, RRPP, puerta y bartenders entran directo desde un ícono, sin buscar la URL cada vez.
            </p>
            <InstallAppButton className="cp-punch mt-2 flex h-14 min-w-[220px] items-center justify-center rounded-full border-2 border-white/25 bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] px-8 text-[11px] font-black uppercase tracking-[0.17em] text-white shadow-[0_18px_55px_rgba(255,59,36,.4)] transition hover:scale-[1.04]" />
          </div>
        </Reveal>
      </section>

      {/* =====================================================
          PRICING GLOSSY
      ===================================================== */}

      <section
        id="pricing"
        className="relative z-10 overflow-hidden border-y border-white/10 bg-[#040404] text-white"
      >
        {/* AMBIENT GLOW */}

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-[25%] h-[760px] w-[1200px] -translate-x-1/2 rounded-full bg-[#ff341f]/10 blur-[180px]" />

          <div className="absolute bottom-[-150px] left-[20%] h-[420px] w-[420px] rounded-full bg-[#ff6a32]/10 blur-[130px]" />

          <div className="absolute right-[10%] top-[18%] h-[460px] w-[460px] rounded-full bg-[#ff482d]/[0.08] blur-[140px]" />
        </div>

        {/* BIG BACKGROUND BRAND */}

        <div className="pointer-events-none absolute inset-x-0 top-[155px] flex justify-center overflow-hidden">
          <div className="select-none whitespace-nowrap text-[clamp(95px,17vw,285px)] font-black uppercase leading-none tracking-[-0.11em]">
            <span className="text-white/[0.035]">
              CAPITAL
            </span>

            <span className="text-[#ff3b24]/[0.12]">
              PASS
            </span>
          </div>
        </div>

        {/* SECOND GLOW BEHIND CARDS */}

        <div className="pointer-events-none absolute left-1/2 top-[42%] h-[500px] w-[75%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(255,78,45,.15),transparent_68%)] blur-[25px]" />

        <div className="relative mx-auto max-w-[1560px] px-5 py-28 md:px-8 lg:py-36 xl:px-10">
          <Reveal>
            <div className="text-center">
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#ff7655]">
                Subscription / 03
              </p>

              <h2 className="mt-5 text-[clamp(52px,7vw,108px)] font-black uppercase leading-[0.82] tracking-[-0.075em]">
                CHOOSE YOUR

                <span className="block bg-gradient-to-r from-[#fff1e8] via-[#ff8c69] to-[#ff2a1a] bg-clip-text text-transparent">
                  EXPERIENCE.
                </span>
              </h2>

              <p className="mx-auto mt-7 max-w-[620px] text-sm leading-7 text-white/40">
                Elegí tu suscripción y
                empezá a gestionar tus
                eventos desde Capital Pass.
              </p>
            </div>
          </Reveal>

          {/* PLANS */}

          <div className="relative mt-24">
            {plansLoading ? (
              <div className="border-y border-white/10 py-14 text-center text-sm text-white/40">
                Cargando suscripciones...
              </div>
            ) : plans.length >
              0 ? (
              <div
                className={[
                  "grid items-stretch gap-6",

                  plans.length >=
                  3
                    ? "lg:grid-cols-3"
                    : plans.length ===
                      2
                    ? "lg:grid-cols-2"
                    : "mx-auto max-w-[520px]",
                ].join(" ")}
              >
                {plans.map(
                  (
                    plan,
                    index
                  ) => {
                    const highlighted =
                      plans.length >
                        1 &&
                      index ===
                        Math.floor(
                          plans.length /
                            2
                        );

                    return (
                      <Reveal
                        key={
                          plan.id
                        }
                        delay={
                          index *
                          90
                        }
                      >
                        <article
                          className={[
                            "group relative flex min-h-[570px] flex-col overflow-hidden rounded-[36px] border p-7 backdrop-blur-[28px] transition duration-300 md:p-9",

                            highlighted
                              ? "-translate-y-3 border-[#ffb197]/70 bg-[linear-gradient(180deg,rgba(255,107,72,.26),rgba(255,255,255,.05))] shadow-[0_45px_160px_rgba(255,65,30,.32),inset_0_1px_0_rgba(255,255,255,.26)] hover:-translate-y-4"
                              : "border-white/[0.13] bg-[linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.025))] shadow-[0_35px_100px_rgba(0,0,0,.38),inset_0_1px_0_rgba(255,255,255,.11)] hover:border-white/25",
                          ].join(
                            " "
                          )}
                        >
                          {/* GLOSS LAYERS */}

                          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[36px]">
                            <div
                              className={[
                                "absolute -top-[80px] left-1/2 h-[260px] w-[260px] -translate-x-1/2 rounded-full blur-[90px]",
                                highlighted
                                  ? "bg-[#ff5736]/30"
                                  : "bg-white/[0.055]",
                              ].join(
                                " "
                              )}
                            />

                            <div className="absolute inset-x-[8%] top-0 h-px bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-70" />

                            <div className="absolute -right-[95px] top-[24%] h-[240px] w-[240px] rounded-full bg-[#ff5a2a]/12 blur-[95px]" />

                            <div className="absolute -left-[90px] bottom-[3%] h-[200px] w-[200px] rounded-full bg-[#ff2a1a]/[0.07] blur-[90px]" />

                            <div className="absolute inset-0 bg-[linear-gradient(118deg,transparent_22%,rgba(255,255,255,.065)_41%,transparent_58%)] opacity-65 transition duration-700 group-hover:translate-x-[12px]" />

                            <div className="absolute left-[12%] top-[7%] h-[60%] w-[22%] rotate-[18deg] rounded-full bg-white/[0.025] blur-[20px]" />
                          </div>

                          {/* CARD HEADER */}

                          <div className="relative flex items-start justify-between">
                            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#ff7956]">
                              {String(
                                index +
                                  1
                              ).padStart(
                                2,
                                "0"
                              )}
                            </p>

                            {highlighted && (
                              <span className="rounded-full border border-[#ff9d80]/35 bg-white/[0.08] px-3 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-white backdrop-blur-xl">
                                Popular
                              </span>
                            )}
                          </div>

                          {/* TITLE */}

                          <h3 className="relative mt-10 text-3xl font-black uppercase tracking-[-0.05em]">
                            {
                              plan.name
                            }
                          </h3>

                          {/* DESCRIPTION */}

                          {plan.description && (
                            <p className="relative mt-3 min-h-[48px] text-sm leading-6 text-white/45">
                              {
                                plan.description
                              }
                            </p>
                          )}

                          {/* PRICE */}

                          <div className="relative mt-10">
                            <span className="text-4xl font-black tracking-[-0.06em] md:text-5xl">
                              {formatPrice(
                                plan.price_minor,
                                plan.currency
                              )}
                            </span>

                            <span className="ml-2 text-xs text-white/35">
                              {billingLabel(
                                plan.billing_interval
                              )}
                            </span>
                          </div>

                          {/* FEATURES */}

                          <div className="relative mt-10 flex-1 border-t border-white/10 pt-5">
                            {commonFeatures.map(
                              (
                                feature
                              ) => (
                                <div
                                  key={
                                    feature
                                  }
                                  className="flex items-center gap-3 border-b border-white/[0.07] py-3 text-xs text-white/[0.72]"
                                >
                                  <span className="text-[#ff6545]">
                                    +
                                  </span>

                                  {
                                    feature
                                  }
                                </div>
                              )
                            )}
                          </div>

                          {/* CTA */}

                          <Link
                            href="/suscribirse"
                            className={[
                              "cp-punch relative mt-8 flex h-14 items-center justify-between rounded-[18px] px-5 text-[10px] font-black uppercase tracking-[0.16em] transition",

                              highlighted
                                ? "bg-white text-black shadow-[0_16px_50px_rgba(255,255,255,.22)] hover:scale-[1.03]"
                                : "border border-white/15 bg-white/[0.04] text-white hover:scale-[1.02] hover:border-[#ff5a2a]/50 hover:bg-white/[0.08]",
                            ].join(
                              " "
                            )}
                          >
                            Suscribirme

                            <span className="text-lg">
                              →
                            </span>
                          </Link>
                        </article>
                      </Reveal>
                    );
                  }
                )}
              </div>
            ) : (
              <div className="border-y border-white/10 py-14 text-center">
                <p className="text-sm text-white/40">
                  Las suscripciones
                  estarán disponibles
                  próximamente.
                </p>

                <Link
                  href="/suscribirse"
                  className="mt-6 inline-flex bg-[#ff2a1a] px-6 py-4 text-[10px] font-black uppercase tracking-[0.16em] text-white"
                >
                  Consultar
                </Link>
              </div>
            )}
          </div>

          <p className="mt-8 text-center text-[9px] uppercase tracking-[0.12em] text-white/25">
            Capital Pass no cobra
            comisión por entrada.
          </p>
        </div>
      </section>

      {/* =====================================================
          FINAL CTA
      ===================================================== */}

      <section className="relative z-10 overflow-hidden bg-[#f32d17] text-[#180a06]">
        <div className="absolute -bottom-[50%] left-[-10%] h-[100%] w-[75%] rounded-full bg-[#ffe9c6] blur-[70px]" />

        <div className="relative mx-auto grid min-h-[650px] max-w-[1560px] items-end gap-12 px-5 py-20 md:px-8 lg:grid-cols-[1fr_auto] xl:px-10">
          <Reveal>
            <h2 className="text-[clamp(62px,9vw,145px)] font-black uppercase leading-[0.77] tracking-[-0.085em]">
              READY

              <span className="block">
                FOR THE
              </span>

              <span className="block">
                NEXT
              </span>

              <span className="block">
                EVENT?
              </span>
            </h2>
          </Reveal>

          <Reveal
            delay={100}
          >
            <div className="flex flex-col gap-3">
              <Link
                href="/suscribirse"
                className="cp-punch flex h-16 min-w-[230px] items-center justify-between bg-[#160b07] px-6 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_20px_60px_rgba(0,0,0,.35)] transition hover:scale-[1.03] hover:bg-black"
              >
                Empezar

                <span className="transition group-hover:translate-x-1">
                  →
                </span>
              </Link>

              <a
                href={
                  whatsappUrl
                }
                target="_blank"
                rel="noreferrer"
                className="cp-punch flex h-16 min-w-[230px] items-center justify-between border-2 border-[#160b07]/50 px-6 text-[10px] font-black uppercase tracking-[0.18em] transition hover:border-[#160b07] hover:bg-[#160b07]/[0.06]"
              >
                Soporte

                <span className="transition group-hover:translate-x-1">
                  →
                </span>
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* =====================================================
          FOOTER
      ===================================================== */}

      <footer className="relative z-10 border-t border-[var(--cp-border)]">
        <div className="mx-auto grid max-w-[1560px] gap-10 px-5 py-10 md:grid-cols-3 md:px-8 xl:px-10">
          <div>
            <p className="text-sm font-black tracking-[0.08em]">
              CAPITAL
              <span className="text-[#ff3b24]">
                PASS
              </span>
            </p>

            <p className="mt-2 text-[9px] uppercase tracking-[0.18em] text-[var(--cp-muted)]">
              The future of events.
            </p>
          </div>

          <div className="flex flex-wrap gap-5 text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--cp-muted)]">
            <a href="#platform">
              Plataforma
            </a>

            <a href="#tickets">
              Tickets
            </a>

            <a href="#pricing">
              Suscripción
            </a>

            <Link href="/login">
              Login
            </Link>
          </div>

          <div className="md:text-right">
            <a
              href={
                whatsappUrl
              }
              target="_blank"
              rel="noreferrer"
              className="text-[9px] font-black uppercase tracking-[0.16em] text-[#ff6b48]"
            >
              Soporte por WhatsApp ↗
            </a>

            <p className="mt-3 text-[8px] uppercase tracking-[0.14em] text-[var(--cp-muted)]">
              Capital Studio · Argentina
            </p>
          </div>
        </div>
      </footer>

      {/* =====================================================
          WHATSAPP FLOATING
      ===================================================== */}

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Contactar soporte de Capital Pass"
        className="group fixed bottom-5 right-5 z-[100] flex h-14 items-center gap-3 rounded-full border border-[#ff6a47]/30 bg-[#0b0908]/90 px-4 text-white shadow-[0_14px_50px_rgba(0,0,0,.35),0_0_30px_rgba(255,59,36,.12)] backdrop-blur-xl transition hover:scale-[1.04] hover:border-[#ff6a47]/60"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ff3b24] text-white">
          <svg
            viewBox="0 0 24 24"
            className="h-[18px] w-[18px]"
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

        <span className="hidden text-[9px] font-black uppercase tracking-[0.16em] sm:block">
          Soporte
        </span>
      </a>
    </main>
  );
}